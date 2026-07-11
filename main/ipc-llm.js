// ═══════════════════════════════════════════════
// main/ipc-llm.js — Claude / Gemini / OpenAI / Perplexity IPC
// v3.6.0 — callProvider 추상화, safeSend, safeError 마스킹
// ═══════════════════════════════════════════════
const { httpsPost, httpsStream, maskKey } = require('./http-helpers');
const { MAIN_CONFIG } = require('./config');
const E = MAIN_CONFIG.ERR; // 에러 메시지 단축 참조
const _activeStreams = new Map();
const _activeRequests = new Map();

// ★ Fix #5: Gemini path 빌더 — API 키를 URL에 포함하되, 에러 경로에서 마스킹 보장
function geminiPath(model, action, apiKey) {
  return '/v1beta/models/' + encodeURIComponent(model) + ':' + action + '?key=' + apiKey;
}
// 에러 메시지에서 API 키 마스킹 (Gemini ?key= 등 URL에 포함된 키 보호)
function safeError(msg) {
  return maskKey(typeof msg === 'string' ? msg : String(msg || ''));
}

// ★ Fix B: sender 파괴 체크 — 창 닫힘/페이지 이동 시 main process 예외 방지
function safeSend(sender, channel, ...args) {
  if (!sender || sender.isDestroyed()) return false;
  try {
    sender.send(channel, ...args);
    return true;
  } catch (_) {
    return false;
  }
}

function _trackStream(requestId, req) {
  const rid = requestId || 'default';
  const entry = { req, cancelled: false };
  _activeStreams.set(rid, entry);
  return entry;
}
function _finishStream(requestId, entry) {
  const rid = requestId || 'default';
  const current = _activeStreams.get(rid);
  if (current && (!entry || current === entry)) _activeStreams.delete(rid);
}

function _trackRequest(requestId, controller) {
  const rid = requestId || 'default';
  const entry = { controller, cancelled: false };
  _activeRequests.set(rid, entry);
  return entry;
}
function _finishRequest(requestId, entry) {
  const rid = requestId || 'default';
  const current = _activeRequests.get(rid);
  if (current && (!entry || current === entry)) _activeRequests.delete(rid);
}

// ── 공용 헬퍼 (키/모델명 중복 제거) ──
function getGeminiKey(keys) {
  return keys.googleAiStudio || keys.gemini;
}
function safeGeminiModel(model) {
  if (typeof model === 'string' && MAIN_CONFIG.ALLOWED_GEMINI_MODELS.has(model)) return model;
  return MAIN_CONFIG.DEFAULT_GEMINI_MODEL;
}
function safeClaudeModel(model) {
  if (typeof model === 'string' && MAIN_CONFIG.ALLOWED_CLAUDE_MODELS.has(model)) return model;
  return MAIN_CONFIG.DEFAULT_CLAUDE_MODEL;
}

// ★ Fix #8: 공용 LLM 호출 헬퍼 — 5개 핸들러의 공통 패턴 추출
// httpsPost → statusCode 분기 → 텍스트 추출을 일관되게 처리
async function callProvider({
  hostname,
  path,
  headers,
  body,
  timeout,
  errorMap,
  extractText,
  label,
  signal,
}) {
  const res = await httpsPost(
    {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
    timeout,
    undefined,
    signal
  );
  if (res.cancelled || (signal && signal.aborted)) return { cancelled: true, status: 499 };
  if (res.error) return { error: safeError(res.error), status: 0 };
  try {
    const json = JSON.parse(res.body);
    if (errorMap && errorMap[res.statusCode])
      return { error: errorMap[res.statusCode], status: res.statusCode };
    if (res.statusCode === 429) return { error: E.rate_limit, status: 429 };
    if (res.statusCode >= 400)
      return {
        error: safeError((json.error && json.error.message) || label + ' API 오류'),
        status: res.statusCode,
      };
    const text = extractText(json);
    return { text, status: 200 };
  } catch (e) {
    return { error: safeError(e.message), status: 500 };
  }
}

// ── 텍스트 추출 함수 (프로바이더별) ──
function extractClaude(json) {
  return json.content ? json.content.map((c) => c.text).join('') : '';
}
function extractGemini(json) {
  return json.candidates && json.candidates[0] && json.candidates[0].content
    ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
    : '';
}
function extractOpenAI(json) {
  return json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content || ''
    : '';
}

function registerLLMIPC(ipcMain, assertTrustedSender, asString, isValidVideoId, readEncryptedKeys) {
  ipcMain.handle('cancel-llm-request', (event, requestId) => {
    assertTrustedSender(event);
    const rid = requestId || 'default';
    const entry = _activeRequests.get(rid);
    if (!entry) return { ok: true, cancelled: false };
    entry.cancelled = true;
    try {
      if (entry.controller) entry.controller.abort();
    } catch (_) {}
    return { ok: true, cancelled: true };
  });

  // ── Claude ──
  ipcMain.handle('call-claude', async (event, prompt, model, maxTokens, requestId) => {
    assertTrustedSender(event);
    prompt = asString(prompt, 30000);
    model = safeClaudeModel(model);
    maxTokens = Math.min(parseInt(maxTokens) || 16384, 16384);
    const keys = readEncryptedKeys();
    if (!keys.claude) return { error: E.claude_no_key, status: 401 };
    const controller = new AbortController();
    const entry = _trackRequest(requestId, controller);
    try {
      const result = await callProvider({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        headers: { 'x-api-key': keys.claude, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt.substring(0, 30000) }],
        }),
        errorMap: { 401: E.claude_invalid_key },
        extractText: extractClaude,
        label: 'Claude',
        signal: controller.signal,
      });
      return entry.cancelled ? { cancelled: true, status: 499 } : result;
    } finally {
      _finishRequest(requestId, entry);
    }
  });

  // ── Gemini ──
  ipcMain.handle('call-gemini', async (event, prompt, model, maxTokens, requestId) => {
    assertTrustedSender(event);
    prompt = asString(prompt, 60000);
    model = safeGeminiModel(model);
    maxTokens = Math.min(parseInt(maxTokens) || 16384, 16384);
    const keys = readEncryptedKeys();
    const apiKey = getGeminiKey(keys);
    if (!apiKey) return { error: E.gemini_no_key, status: 401 };
    const controller = new AbortController();
    const entry = _trackRequest(requestId, controller);
    try {
      const result = await callProvider({
        hostname: 'generativelanguage.googleapis.com',
        path: geminiPath(model, 'generateContent', apiKey),
        headers: {},
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt.substring(0, 60000) }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        errorMap: { 400: E.gemini_invalid_key },
        extractText: extractGemini,
        label: 'Gemini',
        signal: controller.signal,
      });
      return entry.cancelled ? { cancelled: true, status: 499 } : result;
    } finally {
      _finishRequest(requestId, entry);
    }
  });

  // ── Gemini Video ──
  ipcMain.handle(
    'call-gemini-video',
    async (event, videoId, prompt, model, maxTokens, requestId) => {
      assertTrustedSender(event);
      if (!isValidVideoId(videoId)) return { error: 'Invalid video ID', status: 400 };
      prompt = asString(prompt, 30000);
      model = safeGeminiModel(model);
      maxTokens = Math.min(parseInt(maxTokens) || 4096, 8192);
      const keys = readEncryptedKeys();
      const apiKey = getGeminiKey(keys);
      if (!apiKey) return { error: E.gemini_no_key, status: 401 };
      const controller = new AbortController();
      const entry = _trackRequest(requestId, controller);
      try {
        const result = await callProvider({
          hostname: 'generativelanguage.googleapis.com',
          path: geminiPath(model, 'generateContent', apiKey),
          headers: {},
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    fileData: {
                      fileUri: 'https://www.youtube.com/watch?v=' + videoId,
                      mimeType: 'video/*',
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: { maxOutputTokens: maxTokens },
          }),
          errorMap: { 400: E.gemini_invalid_key },
          extractText: extractGemini,
          label: 'Gemini Video',
          signal: controller.signal,
        });
        return entry.cancelled ? { cancelled: true, status: 499 } : result;
      } finally {
        _finishRequest(requestId, entry);
      }
    }
  );

  // ── OpenAI ──
  ipcMain.handle('call-openai', async (event, prompt, maxTokens, requestId) => {
    assertTrustedSender(event);
    prompt = asString(prompt, 30000);
    maxTokens = Math.min(parseInt(maxTokens) || 16384, 16384);
    const keys = readEncryptedKeys();
    if (!keys.openai) return { error: E.openai_no_key, status: 401 };
    const controller = new AbortController();
    const entry = _trackRequest(requestId, controller);
    try {
      const result = await callProvider({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        headers: { Authorization: 'Bearer ' + keys.openai },
        body: JSON.stringify({
          model: MAIN_CONFIG.DEFAULT_OPENAI_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt.substring(0, 30000) }],
        }),
        errorMap: { 401: E.openai_invalid_key },
        extractText: extractOpenAI,
        label: 'OpenAI',
        signal: controller.signal,
      });
      return entry.cancelled ? { cancelled: true, status: 499 } : result;
    } finally {
      _finishRequest(requestId, entry);
    }
  });

  // ── Perplexity ──
  ipcMain.handle('call-perplexity', async (event, prompt, maxTokens, requestId) => {
    assertTrustedSender(event);
    prompt = asString(prompt, 30000);
    maxTokens = Math.min(parseInt(maxTokens) || 4096, 8192);
    const keys = readEncryptedKeys();
    if (!keys.perplexity) return { error: E.perplexity_no_key, status: 401 };
    const controller = new AbortController();
    const entry = _trackRequest(requestId, controller);
    try {
      const result = await callProvider({
        hostname: 'api.perplexity.ai',
        path: '/chat/completions',
        headers: { Authorization: 'Bearer ' + keys.perplexity },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: prompt.substring(0, 30000) }],
          max_tokens: maxTokens,
        }),
        timeout: 120000,
        errorMap: { 401: E.perplexity_invalid_key },
        extractText: extractOpenAI,
        label: 'Perplexity',
        signal: controller.signal,
      });
      return entry.cancelled ? { cancelled: true, status: 499 } : result;
    } finally {
      _finishRequest(requestId, entry);
    }
  });
}

// ═══════════════════════════════════════════════
// 4-1 LLM 스트리밍 — Electron main process에서
// webContents.send()로 청크를 렌더러에 실시간 전달
// P0-2: httpsStream (http-helpers.js)에 settled guard 적용 완료
// ═══════════════════════════════════════════════

function registerLLMStreamIPC(
  ipcMain,
  assertTrustedSender,
  asString,
  readEncryptedKeys,
  isValidVideoId
) {
  ipcMain.handle('cancel-llm-stream', (event, requestId) => {
    assertTrustedSender(event);
    const rid = requestId || 'default';
    const entry = _activeStreams.get(rid);
    if (!entry) return { ok: true, cancelled: false };
    entry.cancelled = true;
    try {
      if (entry.req && !entry.req.destroyed) entry.req.destroy(new Error('cancelled'));
    } catch (_) {}
    _activeStreams.delete(rid);
    return { ok: true, cancelled: true };
  });

  // ── Claude 스트리밍 ──
  ipcMain.handle('call-claude-stream', async (event, prompt, model, maxTokens, requestId) => {
    assertTrustedSender(event);
    prompt = asString(prompt, 30000);
    model = safeClaudeModel(model);
    maxTokens = Math.min(parseInt(maxTokens) || 16384, 16384);
    requestId = requestId || 'default';
    const keys = readEncryptedKeys();
    if (!keys.claude) {
      safeSend(event.sender, 'llm-stream-error', requestId, E.claude_no_key);
      return { error: E.claude_no_key, status: 401 };
    }

    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt.substring(0, 30000) }],
    });

    return new Promise((resolve) => {
      let fullText = '';
      let entry = null;
      const req = httpsStream(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': keys.claude,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        body,
        // onChunk
        (payload) => {
          if (entry && entry.cancelled) {
            try {
              req.destroy();
            } catch (_) {}
            return;
          }
          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
              fullText += evt.delta.text;
              safeSend(event.sender, 'llm-stream-chunk', requestId, evt.delta.text);
            }
          } catch (e) {
            /* skip */
          }
        },
        // onDone
        () => {
          const cancelled = entry && entry.cancelled;
          _finishStream(requestId, entry);
          if (cancelled) {
            resolve({ cancelled: true, status: 499 });
            return;
          }
          safeSend(event.sender, 'llm-stream-done', requestId, fullText);
          resolve({ text: fullText, status: 200 });
        },
        // onError
        (err) => {
          const cancelled = entry && entry.cancelled;
          _finishStream(requestId, entry);
          if (cancelled) {
            resolve({ cancelled: true, status: 499 });
            return;
          }
          let msg = err.error || 'Claude 스트리밍 오류';
          // err.body에서 실제 API 에러 메시지 추출
          if (err.body) {
            try {
              const parsed = JSON.parse(err.body);
              if (parsed.error && parsed.error.message) msg = parsed.error.message;
            } catch (_) {}
          }
          if (err.statusCode === 401) msg = E.claude_invalid_key;
          if (err.statusCode === 429) msg = E.rate_limit;
          safeSend(event.sender, 'llm-stream-error', requestId, safeError(msg));
          resolve({ error: safeError(msg), status: err.statusCode || 0 });
        },
        300000
      );
      entry = _trackStream(requestId, req);
    });
  });

  // ── Gemini 스트리밍 ──
  ipcMain.handle('call-gemini-stream', async (event, prompt, model, maxTokens, requestId) => {
    requestId = requestId || 'default';
    assertTrustedSender(event);
    prompt = asString(prompt, 60000);
    model = safeGeminiModel(model);
    maxTokens = Math.min(parseInt(maxTokens) || 16384, 16384);
    const keys = readEncryptedKeys();
    const apiKey = getGeminiKey(keys);
    if (!apiKey) {
      safeSend(event.sender, 'llm-stream-error', requestId, E.gemini_no_key);
      return { error: E.gemini_no_key, status: 401 };
    }

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt.substring(0, 60000) }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });

    return new Promise((resolve) => {
      let fullText = '';
      let entry = null;
      const req = httpsStream(
        {
          hostname: 'generativelanguage.googleapis.com',
          path: geminiPath(model, 'streamGenerateContent', apiKey).replace(
            '?key=',
            '?alt=sse&key='
          ),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        body,
        // onChunk
        (payload) => {
          if (entry && entry.cancelled) {
            try {
              req.destroy();
            } catch (_) {}
            return;
          }
          try {
            const evt = JSON.parse(payload);
            const text =
              evt.candidates &&
              evt.candidates[0] &&
              evt.candidates[0].content &&
              evt.candidates[0].content.parts &&
              evt.candidates[0].content.parts[0]
                ? evt.candidates[0].content.parts[0].text || ''
                : '';
            if (text) {
              fullText += text;
              safeSend(event.sender, 'llm-stream-chunk', requestId, text);
            }
          } catch (e) {
            /* skip */
          }
        },
        // onDone
        () => {
          const cancelled = entry && entry.cancelled;
          _finishStream(requestId, entry);
          if (cancelled) {
            resolve({ cancelled: true, status: 499 });
            return;
          }
          safeSend(event.sender, 'llm-stream-done', requestId, fullText);
          resolve({ text: fullText, status: 200 });
        },
        // onError
        (err) => {
          const cancelled = entry && entry.cancelled;
          _finishStream(requestId, entry);
          if (cancelled) {
            resolve({ cancelled: true, status: 499 });
            return;
          }
          let msg = err.error || 'Gemini 스트리밍 오류';
          if (err.body) {
            try {
              const parsed = JSON.parse(err.body);
              if (parsed.error && parsed.error.message) msg = parsed.error.message;
            } catch (_) {}
          }
          if (err.statusCode === 400) msg = E.gemini_invalid_key;
          if (err.statusCode === 429) msg = E.rate_limit;
          safeSend(event.sender, 'llm-stream-error', requestId, safeError(msg));
          resolve({ error: safeError(msg), status: err.statusCode || 0 });
        },
        300000
      );
      entry = _trackStream(requestId, req);
    });
  });

  // ── Gemini Video 스트리밍 (영상 분석 실시간 표시) ──
  ipcMain.handle(
    'call-gemini-video-stream',
    async (event, videoId, prompt, model, maxTokens, requestId) => {
      requestId = requestId || 'default';
      assertTrustedSender(event);
      if (!isValidVideoId(videoId)) {
        safeSend(event.sender, 'llm-stream-error', requestId, '유효하지 않은 영상 ID입니다.');
        return { error: 'Invalid video ID', status: 400 };
      }
      prompt = asString(prompt, 30000);
      model = safeGeminiModel(model);
      maxTokens = Math.min(parseInt(maxTokens) || 4096, 8192);
      const keys = readEncryptedKeys();
      const apiKey = getGeminiKey(keys);
      if (!apiKey) {
        safeSend(event.sender, 'llm-stream-error', requestId, E.gemini_no_key);
        return { error: E.gemini_no_key, status: 401 };
      }

      const body = JSON.stringify({
        contents: [
          {
            parts: [
              {
                fileData: {
                  fileUri: 'https://www.youtube.com/watch?v=' + videoId,
                  mimeType: 'video/*',
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      });

      return new Promise((resolve) => {
        let fullText = '';
        let entry = null;
        const req = httpsStream(
          {
            hostname: 'generativelanguage.googleapis.com',
            path: geminiPath(model, 'streamGenerateContent', apiKey).replace(
              '?key=',
              '?alt=sse&key='
            ),
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          body,
          // onChunk
          (payload) => {
            if (entry && entry.cancelled) {
              try {
                req.destroy();
              } catch (_) {}
              return;
            }
            try {
              const evt = JSON.parse(payload);
              const text =
                evt.candidates &&
                evt.candidates[0] &&
                evt.candidates[0].content &&
                evt.candidates[0].content.parts &&
                evt.candidates[0].content.parts[0]
                  ? evt.candidates[0].content.parts[0].text || ''
                  : '';
              if (text) {
                fullText += text;
                safeSend(event.sender, 'llm-stream-chunk', requestId, text);
              }
            } catch (e) {
              /* skip */
            }
          },
          // onDone
          () => {
            const cancelled = entry && entry.cancelled;
            _finishStream(requestId, entry);
            if (cancelled) {
              resolve({ cancelled: true, status: 499 });
              return;
            }
            safeSend(event.sender, 'llm-stream-done', requestId, fullText);
            resolve({ text: fullText, status: 200 });
          },
          // onError
          (err) => {
            const cancelled = entry && entry.cancelled;
            _finishStream(requestId, entry);
            if (cancelled) {
              resolve({ cancelled: true, status: 499 });
              return;
            }
            let msg = err.error || 'Gemini Video 스트리밍 오류';
            if (err.body) {
              try {
                const parsed = JSON.parse(err.body);
                if (parsed.error && parsed.error.message) msg = parsed.error.message;
              } catch (_) {}
            }
            if (err.statusCode === 400) msg = E.gemini_invalid_key;
            if (err.statusCode === 429) msg = E.rate_limit;
            safeSend(event.sender, 'llm-stream-error', requestId, safeError(msg));
            resolve({ error: safeError(msg), status: err.statusCode || 0 });
          },
          300000
        ); // 5분 타임아웃 (영상 로딩 + 분석)
        entry = _trackStream(requestId, req);
      });
    }
  );
}

// P2-8: 단일 module.exports로 통합
module.exports = { registerLLMIPC, registerLLMStreamIPC };
