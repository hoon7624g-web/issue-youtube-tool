// ═══════════════════════════════════════════════════════════
// client-proxy-llm.js — LLM 호출 (Claude / Gemini / ChatGPT / Perplexity)
// v3.6.0 — async/await 전환 + withRetry 래퍼
//
// 보안 참고: Electron 환경에서는 IPC를 통해 main process에서 API 호출 (키 미노출).
// 웹 환경에서는 렌더러에서 직접 fetch (개발/테스트 용도).
// 프로덕션 배포는 반드시 Electron 빌드를 사용하세요.
// ═══════════════════════════════════════════════════════════
import { toast, wait } from './js/utils.js';
import { CONFIG } from './config.js';
import { checkThrottle, getApiKeys, fetchWithTimeout } from './client-proxy-auth.js';

// ── 웹 fallback 경고 (1회만 표시) ──
// ★ P1-5: Electron 환경에서는 웹 fallback을 차단하여 API 키 노출 방지
const _webFallbackWarned = {};

// ★ P1-3: Gemini 키 해석 공통화 — main process와 동일 규칙
// googleAiStudio → gemini 순서로 fallback
function getGeminiKey(keys) { return keys.googleAiStudio || keys.gemini || ''; }
function hasGeminiKey(keys) { return !!(keys.googleAiStudio || keys.gemini); }

function _attachStreamAbort(signal, requestId, cleanup, reject, clearSafetyTimer) {
  if (!signal) return () => {};
  const onAbort = () => {
    try { cleanup(); } catch (_) {}
    try { if (clearSafetyTimer) clearSafetyTimer(); } catch (_) {}
    if (window.electronAPI && window.electronAPI.cancelLLMStream) {
      Promise.resolve(window.electronAPI.cancelLLMStream(requestId)).catch(() => {});
    }
    reject(new Error('사용자가 작업을 취소했습니다.'));
  };
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  signal.addEventListener('abort', onAbort, { once: true });
  return () => {
    try { signal.removeEventListener('abort', onAbort); } catch (_) {}
  };
}


function _createRequestId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function _isAbortError(e) {
  return !!(e && (e.name === 'AbortError' || /abort/i.test(String(e.message || ''))));
}

function _toAbortError() {
  return new Error('사용자가 작업을 취소했습니다.');
}

async function _invokeElectronAbortable(invokeFactory, cancelFactory, signal) {
  const requestId = _createRequestId();
  if (!signal) return invokeFactory(requestId);
  if (signal.aborted) throw _toAbortError();

  let removeAbort = () => {};
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => {
      Promise.resolve(cancelFactory(requestId)).catch(() => {});
      reject(_toAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbort = () => {
      try { signal.removeEventListener('abort', onAbort); } catch (_) {}
    };
  });

  try {
    return await Promise.race([
      Promise.resolve(invokeFactory(requestId)),
      abortPromise,
    ]);
  } finally {
    removeAbort();
  }
}

// ★ v3.5.8→v3.6.0: stale provider 방지 + UI 표시용 export
// 저장된 llmProvider가 현재 키 상태와 불일치하면 자동 fallback
export function resolveProvider(keys) {
  const preferred = keys.llmProvider;
  if (preferred === 'gemini' && hasGeminiKey(keys)) return 'gemini';
  if (preferred === 'chatgpt' && keys.openai) return 'chatgpt';
  if (preferred === 'claude' && keys.claude) return 'claude';
  // preferred가 없거나 해당 키가 비어있으면 자동 선택
  if (hasGeminiKey(keys)) return 'gemini';
  if (keys.openai) return 'chatgpt';
  if (keys.claude) return 'claude';
  return 'claude'; // 최종 fallback — callXxx 내부에서 키 부재 에러 처리
}

function _warnWebFallback(provider) {
  // Electron 앱인데 IPC가 없는 경우 = preload 로드 실패 → 키 노출 차단
  if (window.electronAPI && window.electronAPI.isElectron) {
    throw new Error(provider + ' IPC 연결 실패 — 앱을 재시작해주세요. (preload 로드 오류)');
  }
  if (_webFallbackWarned[provider]) return;
  _webFallbackWarned[provider] = true;
  console.warn('[보안 경고] ' + provider + ' API를 브라우저에서 직접 호출합니다. API 키가 DevTools에 노출될 수 있습니다. 프로덕션에서는 Electron 빌드를 사용하세요.');
}

// ── 공통 재시도 래퍼 ──
export async function withRetry(fn, { maxRetries = 2, backoff = 5000, label = 'API', signal } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal && signal.aborted) throw _toAbortError();
    try {
      return await fn();
    } catch (e) {
      if (_isAbortError(e) || (signal && signal.aborted)) throw _toAbortError();
      if (attempt === maxRetries) throw e;
      const status = e.status || 0;
      if (status === 429 || (status >= 500 && status < 600)) {
        const delaySec = backoff * (attempt + 1) / 1000;
        toast(`${label} 오류 — ${delaySec}초 후 재시도...`, 'err');
        await wait(backoff * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

// ── HTTP 에러 헬퍼 ──
function httpError(status, msg) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

// ── 단일 호출 (프로바이더별 내부 함수) ──
async function _callChatGPT(prompt, { signal } = {}) {
  const keys = getApiKeys();
  if (!keys.openai) throw new Error('OpenAI API 키를 설정해주세요.');
  if (window.electronAPI && window.electronAPI.callOpenAI) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callOpenAI(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), CONFIG.MAX_OUTPUT_TOKENS, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.status === 429) throw httpError(429, 'ChatGPT 요청 한도 초과');
    if (r.status >= 500) throw httpError(r.status, 'ChatGPT 서버 오류');
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('ChatGPT');
  const r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys.openai },
    body: JSON.stringify({ model: CONFIG.DEFAULT_OPENAI_MODEL, max_tokens: CONFIG.MAX_OUTPUT_TOKENS, messages: [{ role: 'user', content: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }] }),
    signal,
  }, 180000, signal);
  if (r.status === 401) throw new Error('OpenAI API 키가 유효하지 않습니다.');
  if (r.status === 429) throw httpError(429, 'ChatGPT 요청 한도 초과');
  if (r.status >= 500) throw httpError(r.status, 'ChatGPT 서버 오류');
  if (!r.ok) { const d = await r.json(); throw new Error(d.error && d.error.message || 'ChatGPT API 오류: ' + r.status); }
  const d = await r.json();
  if (d.choices && d.choices[0] && d.choices[0].message) return d.choices[0].message.content || '';
  throw new Error('ChatGPT 응답 형식 오류');
}

async function _callGemini(prompt, { signal } = {}) {
  const keys = getApiKeys();
  const geminiKey = getGeminiKey(keys);
  if (!geminiKey) throw new Error('Gemini / Google AI Studio API 키를 설정해주세요.');
  if (window.electronAPI && window.electronAPI.callGemini) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callGemini(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), CONFIG.DEFAULT_GEMINI_MODEL, CONFIG.MAX_OUTPUT_TOKENS, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.status === 429) throw httpError(429, 'Gemini 요청 한도 초과');
    if (r.status >= 500) throw httpError(r.status, 'Gemini 서버 오류');
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('Gemini');
  const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.DEFAULT_GEMINI_MODEL + ':generateContent?key=' + geminiKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }] }], generationConfig: { maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS } }),
    signal,
  }, 180000, signal);
  if (r.status === 400) throw new Error('Gemini API 키가 유효하지 않습니다.');
  if (r.status === 429) throw httpError(429, 'Gemini 요청 한도 초과');
  if (r.status >= 500) throw httpError(r.status, 'Gemini 서버 오류');
  if (!r.ok) { const d = await r.json(); throw new Error(d.error && d.error.message || 'Gemini API 오류: ' + r.status); }
  const d = await r.json();
  if (d.candidates && d.candidates[0] && d.candidates[0].content) return d.candidates[0].content.parts.map(p => p.text || '').join('');
  throw new Error('Gemini 응답 형식 오류');
}

async function _callClaude(prompt, { signal } = {}) {
  const keys = getApiKeys();
  if (!keys.claude) throw new Error('Claude API 키를 설정해주세요.');
  const claudeModel = keys.claudeModel || CONFIG.DEFAULT_CLAUDE_MODEL;
  if (window.electronAPI && window.electronAPI.callClaude) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callClaude(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), claudeModel, CONFIG.MAX_OUTPUT_TOKENS, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.status === 429) throw httpError(429, 'Claude 요청 한도 초과');
    if (r.status >= 500) throw httpError(r.status, 'Claude 서버 오류');
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('Claude');
  const r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: claudeModel, max_tokens: CONFIG.MAX_OUTPUT_TOKENS, messages: [{ role: 'user', content: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }] }),
    signal,
  }, 180000, signal);
  if (r.status === 401) throw new Error('Claude API 키가 유효하지 않습니다.');
  if (r.status === 429) throw httpError(429, 'Claude 요청 한도 초과');
  if (r.status >= 500) throw httpError(r.status, 'Claude 서버 오류');
  if (!r.ok) { const d = await r.json(); throw new Error(d.error && d.error.message || 'Claude API 오류: ' + r.status); }
  const d = await r.json();
  if (d.content) return d.content.map(c => c.text).join('');
  return typeof d === 'string' ? d : JSON.stringify(d);
}

// ── LLM 호출 내부 (throttle 없음 — callLLMStream fallback 등에서 사용) ──
async function _callLLMInternal(prompt, { signal } = {}) {
  const keys = getApiKeys();
  const provider = resolveProvider(keys);

  if (provider === 'chatgpt') return withRetry(() => _callChatGPT(prompt, { signal }), { label: 'ChatGPT', signal });
  if (provider === 'gemini') return withRetry(() => _callGemini(prompt, { signal }), { label: 'Gemini', signal });
  return withRetry(() => _callClaude(prompt, { signal }), { label: 'Claude', signal });
}

// ── LLM 호출 (withRetry로 429/5xx 자동 재시도) ──
export async function callLLM(prompt, { signal } = {}) {
  checkThrottle();
  return _callLLMInternal(prompt, { signal });
}

// ── Pro 모델 (윤문 전용) ──
// ★ P2-8: 재귀 재시도 → withRetry 통일 (checkThrottle 1회만 호출, 일관된 재시도 패턴)
async function _callGeminiPro(prompt, { signal } = {}) {
  const keys = getApiKeys();
  const gKey = getGeminiKey(keys);
  if (!gKey) throw new Error('Gemini / Google AI Studio API 키가 필요합니다 (Pro 윤문)');
  if (window.electronAPI && window.electronAPI.callGemini) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callGemini(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS_PRO), CONFIG.DEFAULT_GEMINI_MODEL, CONFIG.MAX_OUTPUT_TOKENS, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.status === 429) throw httpError(429, 'Gemini Pro 요청 한도 초과');
    if (r.status >= 500) throw httpError(r.status, 'Gemini Pro 서버 오류');
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('Gemini');
  const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.DEFAULT_GEMINI_MODEL + ':generateContent?key=' + gKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS_PRO) }] }], generationConfig: { maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS } }),
    signal,
  }, 180000, signal);
  if (r.status === 400) throw new Error('Gemini Pro API 키가 유효하지 않습니다.');
  if (r.status === 429) throw httpError(429, 'Gemini Pro 요청 한도 초과');
  if (r.status >= 500) throw httpError(r.status, 'Gemini Pro 서버 오류');
  if (!r.ok) { const d = await r.json(); throw new Error(d.error && d.error.message || 'Gemini Pro 오류: ' + r.status); }
  const d = await r.json();
  if (d.candidates && d.candidates[0] && d.candidates[0].content) return d.candidates[0].content.parts.map(p => p.text || '').join('');
  throw new Error('Gemini Pro 응답 형식 오류');
}

export async function callLLMPro(prompt, { signal } = {}) {
  checkThrottle();
  return withRetry(() => _callGeminiPro(prompt, { signal }), { maxRetries: 2, backoff: 10000, label: 'Gemini Pro', signal });
}

// ── Google AI Studio ──
export async function callGeminiVideo(videoId, prompt, { signal } = {}) {
  checkThrottle();
  const keys = getApiKeys();
  const gaiKey = getGeminiKey(keys);
  if (!gaiKey) throw new Error('Google AI Studio API 키를 설정해주세요.');
  const videoModel = keys.geminiVideoModel || CONFIG.DEFAULT_GEMINI_MODEL;
  if (window.electronAPI && window.electronAPI.callGeminiVideo) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callGeminiVideo(videoId, prompt, videoModel, CONFIG.MAX_OUTPUT_TOKENS_SHORT, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('Gemini Video');
  const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models/' + videoModel + ':generateContent?key=' + gaiKey, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ fileData: { fileUri: 'https://www.youtube.com/watch?v=' + videoId, mimeType: 'video/*' } }, { text: prompt }] }], generationConfig: { maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS_SHORT } }),
    signal,
  }, 600000, signal);
  if (!r.ok) {
    try {
      const d = await r.json();
      const msg = (d.error && d.error.message) || 'status ' + r.status;
      throw new Error('Google AI Studio (' + videoModel + '): ' + msg);
    } catch (e) {
      if (e.message.startsWith('Google AI Studio')) throw e;
      throw new Error('Google AI Studio (' + videoModel + '): HTTP ' + r.status);
    }
  }
  const d = await r.json();
  if (d.candidates && d.candidates[0] && d.candidates[0].content) return d.candidates[0].content.parts.map(p => p.text || '').join('');
  throw new Error('Google AI Studio 응답 형식 오류');
}

// ── Google AI Studio 영상 분석 (스트리밍) ──
export async function callGeminiVideoStream(videoId, prompt, { onChunk, onDone, onError, signal } = {}) {
  checkThrottle();
  const keys = getApiKeys();
  const gaiKey = getGeminiKey(keys);
  if (!gaiKey) throw new Error('Google AI Studio API 키를 설정해주세요.');
  const videoModel = keys.geminiVideoModel || CONFIG.DEFAULT_GEMINI_MODEL;

  // ── Electron: IPC 스트리밍 ──
  if (window.electronAPI && window.electronAPI.callGeminiVideoStream) {
    return new Promise((resolve, reject) => {
      let fullText = '';
      let settled = false;
      const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
      const settleResolve = (text) => {
        if (settled) return;
        settled = true;
        removeAbort();
        clearTimeout(safetyTimer);
        if (onDone) onDone(text);
        resolve(text);
      };
      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        removeAbort();
        clearTimeout(safetyTimer);
        if (onError) onError(error instanceof Error ? error.message : String(error));
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      // ★ P0-2: 안전 타임아웃 — Main process 크래시 등으로 done/error 미수신 시 리스너 누수 방지
      // ★ P2-fix: TIMEOUT.ANALYSIS_VIDEO(10분)와 정책 통일 (기존 6분 → 11분, withTimeout보다 1분 여유)
      const safetyTimer = setTimeout(() => {
        try { if (window.electronAPI.cancelLLMStream) window.electronAPI.cancelLLMStream(requestId); } catch (_) {}
        cleanup();
        settleReject(new Error('영상 분석 스트리밍 타임아웃 (11분)'));
      }, 660000);

      // ★ Fix #4: onLLMStream 통합 API 사용 (개별 리스너 이중 등록 방지)
      const cleanup = window.electronAPI.onLLMStream(requestId, {
        onChunk: (chunk) => {
          fullText += chunk;
          if (onChunk) onChunk(chunk, fullText);
        },
        onDone: (text) => { settleResolve(text); },
        onError: (error) => { settleReject(new Error(error)); }
      });
      const removeAbort = _attachStreamAbort(signal, requestId, cleanup, settleReject, () => { clearTimeout(safetyTimer); });

      // ★ Fix A: invoke() 실패 시 6분 대기 대신 즉시 reject
      Promise.resolve(
        window.electronAPI.callGeminiVideoStream(videoId, prompt, videoModel, CONFIG.MAX_OUTPUT_TOKENS_SHORT, requestId)
      ).catch((err) => {
        cleanup();
        settleReject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }

  // ── 웹: non-streaming 우선 + 1회 자동 재시도 ──
  // 영상 분석은 응답이 한꺼번에 오므로 안정적인 generateContent 사용
  {
    const _vk = getApiKeys();
    const _gk = getGeminiKey(_vk);
    if (!_gk) throw new Error('Google AI Studio API 키를 설정해주세요.');
    const _vm0 = _vk.geminiVideoModel || CONFIG.DEFAULT_GEMINI_MODEL;
    const _vm = (_vm0 === 'gemini-2.0-flash' || _vm0 === 'gemini-2.0-flash-001' || _vm0 === 'gemini-2.5-flash') ? 'gemini-2.5-pro' : _vm0;
    const _url = 'https://generativelanguage.googleapis.com/v1beta/models/' + _vm + ':generateContent?key=' + _gk;
    const _body = JSON.stringify({ contents: [{ parts: [{ fileData: { fileUri: 'https://www.youtube.com/watch?v=' + videoId, mimeType: 'video/*' } }, { text: prompt }] }], generationConfig: { maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS_SHORT } });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          console.log('[Gemini Video] 재시도 ' + attempt + '/1 (3초 대기 후)');
          await new Promise(r => setTimeout(r, 3000));
        }
        const resp = await fetch(_url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: _body, signal,
        });
        if (!resp.ok) {
          const errBody = await resp.text().catch(() => '');
          throw new Error('Gemini Video ' + resp.status + ' ' + errBody.substring(0, 100));
        }
        const d = await resp.json();
        if (d.candidates && d.candidates[0] && d.candidates[0].content) {
          const fullText = d.candidates[0].content.parts.map(p => p.text || '').join('');
          if (onChunk) onChunk(fullText, fullText);
          if (onDone) onDone(fullText);
          return fullText;
        }
        throw new Error('Gemini Video 응답 형식 오류');
      } catch (e) {
        console.warn('[Gemini Video] 시도 ' + (attempt + 1) + ' 실패:', e.message);
        if (attempt >= 1) throw e;  // 2번째 실패 → 상위에서 텍스트 fallback
      }
    }
  }
}

// ── Perplexity API ──
export async function callPerplexity(prompt, { signal } = {}) {
  checkThrottle();
  const keys = getApiKeys();
  if (!keys.perplexity) throw new Error('Perplexity API 키가 없습니다.');
  if (window.electronAPI && window.electronAPI.callPerplexity) {
    const r = await _invokeElectronAbortable(
      (requestId) => window.electronAPI.callPerplexity(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), CONFIG.MAX_OUTPUT_TOKENS_SHORT, requestId),
      (requestId) => window.electronAPI.cancelLLMRequest ? window.electronAPI.cancelLLMRequest(requestId) : Promise.resolve(),
      signal
    );
    if (r && r.cancelled) throw _toAbortError();
    if (r.error) throw new Error(r.error);
    return r.text || '';
  }
  _warnWebFallback('Perplexity');
  const r = await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + keys.perplexity },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }], max_tokens: CONFIG.MAX_OUTPUT_TOKENS_SHORT }),
    signal,
  }, 300000, signal);
  if (r.status === 401) throw new Error('Perplexity API 키가 유효하지 않습니다.');
  if (r.status === 429) throw new Error('Perplexity 요청 한도 초과.');
  if (!r.ok) { const d = await r.json(); throw new Error(d.error && d.error.message || 'Perplexity 오류: ' + r.status); }
  const d = await r.json();
  if (d.choices && d.choices[0] && d.choices[0].message) return d.choices[0].message.content;
  throw new Error('Perplexity 응답 형식 오류');
}

// ═══════════════════════════════════════════════════════════
// 4-1 LLM 스트리밍 — 롱폼 대본 생성에서 실시간 텍스트 표시용
// Electron: IPC 이벤트로 청크 수신
// 웹: SSE (Edge Function) 또는 직접 API 스트리밍
// ═══════════════════════════════════════════════════════════

export async function callLLMStream(prompt, { onChunk, onDone, onError, signal } = {}) {
  checkThrottle();
  const keys = getApiKeys();
  const provider = resolveProvider(keys);

  // ★ P1-6: ChatGPT는 스트리밍 미지원 → 진입점에서 즉시 non-streaming fallback
  // ★ v3.5.8: 이미 checkThrottle() 호출됨 → _callLLMInternal로 중복 차감 방지
  if (provider === 'chatgpt') {
    const text = await _callLLMInternal(prompt, { signal });
    if (onChunk) onChunk(text, text);
    if (onDone) onDone(text);
    return text;
  }

  // ── Electron: IPC 스트리밍 ──
  if (window.electronAPI && window.electronAPI.callClaudeStream) {
    return new Promise((resolve, reject) => {
      let fullText = '';
      let settled = false;
      const requestId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
      const settleResolve = (text) => {
        if (settled) return;
        settled = true;
        removeAbort();
        clearTimeout(safetyTimer);
        if (onDone) onDone(text);
        resolve(text);
      };
      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        removeAbort();
        clearTimeout(safetyTimer);
        if (onError) onError(error instanceof Error ? error.message : String(error));
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      // ★ P0-2: 안전 타임아웃 — Main process 크래시 등으로 done/error 미수신 시 리스너 누수 방지
      // ★ P2-fix: TIMEOUT.SCRIPT(10분)와 정책 통일 (기존 6분 → 11분)
      const safetyTimer = setTimeout(() => {
        try { if (window.electronAPI.cancelLLMStream) window.electronAPI.cancelLLMStream(requestId); } catch (_) {}
        cleanup();
        settleReject(new Error('LLM 스트리밍 타임아웃 (11분)'));
      }, 660000);

      // ★ Fix #4: onLLMStream 통합 API 사용 (개별 리스너 이중 등록 방지)
      const cleanup = window.electronAPI.onLLMStream(requestId, {
        onChunk: (chunk) => {
          fullText += chunk;
          if (onChunk) onChunk(chunk, fullText);
        },
        onDone: (text) => { settleResolve(text); },
        onError: (error) => { settleReject(new Error(error)); }
      });
      const removeAbort = _attachStreamAbort(signal, requestId, cleanup, settleReject, () => { clearTimeout(safetyTimer); });

      // 프로바이더별 IPC 호출
      // ★ Fix A: invoke() 실패 시 6분 대기 대신 즉시 reject
      const _rejectOnInvokeError = (startPromise) => {
        Promise.resolve(startPromise).catch((err) => {
          cleanup();
          settleReject(err instanceof Error ? err : new Error(String(err)));
        });
      };

      if (provider === 'gemini') {
        if (!hasGeminiKey(keys)) { cleanup(); settleReject(new Error('Gemini / Google AI Studio API 키를 설정해주세요.')); return; }
        _rejectOnInvokeError(window.electronAPI.callGeminiStream(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), CONFIG.DEFAULT_GEMINI_MODEL, CONFIG.MAX_OUTPUT_TOKENS, requestId));
      } else {
        // Claude (기본값)
        if (!keys.claude) { cleanup(); settleReject(new Error('Claude API 키를 설정해주세요.')); return; }
        const claudeModel = keys.claudeModel || CONFIG.DEFAULT_CLAUDE_MODEL;
        _rejectOnInvokeError(window.electronAPI.callClaudeStream(prompt.substring(0, CONFIG.MAX_PROMPT_CHARS), claudeModel, CONFIG.MAX_OUTPUT_TOKENS, requestId));
      }
    });
  }

  // ── 웹: SSE 스트리밍 (Edge Function 경유) ──
  const { PROXY_BASE } = await import('./client-proxy-auth.js');
  const { getToken } = await import('./client-proxy-auth.js');
  const token = getToken();

  if (token && PROXY_BASE) {
    let fullText = '';  // ★ v3.5.8: catch에서 부분 응답 확인을 위해 try 바깥으로 이동
    try {
      const resp = await fetch(PROXY_BASE + '/api/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          prompt: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS),
          provider: provider === 'chatgpt' ? 'claude' : provider,
          max_tokens: CONFIG.MAX_OUTPUT_TOKENS
        }),
        signal, // ★ P2-fix: 취소 signal 전달 (기존 누락)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error('스트리밍 요청 실패: ' + resp.status + ' ' + errText.substring(0, 100));
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          // ★ P0-fix: JSON 파싱 실패와 비즈니스 에러를 분리
          // 이전 코드: 내부 try/catch가 evt.error throw도 삼켜버림
          let evt;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue; // 진짜 JSON 파싱 실패만 스킵
          }
          // 비즈니스 에러는 반드시 상위로 전파
          if (evt.error) {
            if (onError) onError(evt.error);
            throw new Error(evt.error);
          }
          if (evt.t) {
            fullText += evt.t;
            if (onChunk) onChunk(evt.t, fullText);
          }
          if (evt.done) {
            if (onDone) onDone(fullText);
            return fullText;
          }
        }
      }
      // 스트림이 done 이벤트 없이 종료된 경우
      if (onDone) onDone(fullText);
      return fullText;
    } catch (e) {
      // ★ Fix #6 → v3.6.0: 부분 응답 처리 — CONFIG.SSE_PARTIAL_THRESHOLD 참조
      // - 임계값 이상: onDone만 호출 (성공 취급, console.warn으로 기록)
      // - 임계값 미만: non-streaming fallback으로 진행
      if (fullText && fullText.length > CONFIG.SSE_PARTIAL_THRESHOLD) {
        console.warn('[LLM Stream] SSE failed after partial response (' + fullText.length + ' chars, threshold ' + CONFIG.SSE_PARTIAL_THRESHOLD + '), using partial:', e.message);
        if (onDone) onDone(fullText);
        return fullText;
      }
      // 부분 응답이 부족할 때만 non-streaming fallback
      console.warn('[LLM Stream] SSE failed, falling back to non-streaming:', e.message);
    }
  }

  // ── 브라우저 직접 스트리밍 (웹 전용) — SSE 프록시 실패 시 시도 ──
  if (!window.electronAPI || !window.electronAPI.isElectron) {
    const keys = getApiKeys();
    try {
      if (provider === 'claude' && keys.claude) {
        const claudeModel = keys.claudeModel || CONFIG.DEFAULT_CLAUDE_MODEL;
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: claudeModel, max_tokens: CONFIG.MAX_OUTPUT_TOKENS, stream: true, messages: [{ role: 'user', content: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }] }),
          signal,
        });
        if (!resp.ok) throw new Error('Claude stream ' + resp.status);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
                fullText += evt.delta.text;
                if (onChunk) onChunk(evt.delta.text, fullText);
              }
            } catch (_) {}
          }
        }
        if (onDone) onDone(fullText);
        return fullText;
      }
      if (provider === 'gemini' && hasGeminiKey(keys)) {
        const geminiKey = getGeminiKey(keys);
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.DEFAULT_GEMINI_MODEL + ':streamGenerateContent?alt=sse&key=' + geminiKey, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt.substring(0, CONFIG.MAX_PROMPT_CHARS) }] }], generationConfig: { maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS } }),
          signal,
        });
        if (!resp.ok) throw new Error('Gemini stream ' + resp.status);
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            try {
              const evt = JSON.parse(payload);
              if (evt.candidates && evt.candidates[0] && evt.candidates[0].content) {
                const txt = evt.candidates[0].content.parts.map(p => p.text || '').join('');
                if (txt) { fullText += txt; if (onChunk) onChunk(txt, fullText); }
              }
            } catch (_) {}
          }
        }
        if (onDone) onDone(fullText);
        return fullText;
      }
    } catch (e) {
      console.warn('[LLM Stream] Browser direct stream failed, falling back to non-streaming:', e.message);
    }
  }

  // ── Fallback: 일반 호출 후 전체 텍스트 전달 ──
  // ★ v3.5.8: callLLMStream 진입 시 이미 checkThrottle()을 호출했으므로
  // fallback에서는 _callLLMInternal로 throttle 중복 차감 방지
  const text = await _callLLMInternal(prompt, { signal });
  if (onChunk) onChunk(text, text);
  if (onDone) onDone(text);
  return text;
}
