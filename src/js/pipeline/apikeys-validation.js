// ═══════════════════════════════════════
// pipeline/apikeys-validation.js — API 키 연결 테스트
// v3.6.0 — Electron: Main Process IPC 경유 (렌더러 키 미노출)
//           웹(개발): 직접 fetch (개발/테스트 전용)
// ═══════════════════════════════════════
import { $ , el } from '../utils.js';
import { fetchWithTimeout } from '../../client-proxy-auth.js';

const _isElectron = !!(window.electronAPI && window.electronAPI.testApiKeyDirect);

// ═══════════════════════════════════════
// 웹 환경 전용 fallback (개발/테스트)
// Electron에서는 사용되지 않음
// ═══════════════════════════════════════

async function _webTestYouTube(key) {
  if (!key) return { skip: true };
  try {
    const r = await fetchWithTimeout('https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&maxResults=1&key=' + key, {}, 10000);
    if (r.status === 200) return { ok: true };
    if (r.status === 403) {
      const d = await r.json().catch(() => ({}));
      const reason = (d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || '';
      if (reason === 'quotaExceeded') return { ok: false, msg: '일일 할당량 초과 (한국 시간 오후 4시경 초기화)' };
      if (reason === 'accessNotConfigured') return { ok: false, msg: 'YouTube Data API v3가 활성화되지 않았습니다' };
      return { ok: false, msg: 'API 키가 유효하지 않습니다' };
    }
    if (r.status === 400) return { ok: false, msg: 'API 키 형식이 올바르지 않습니다' };
    return { ok: false, msg: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, msg: '네트워크 오류: ' + (e.message || '') }; }
}

async function _webTestClaude(key) {
  if (!key) return { skip: true };
  try {
    const r = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    }, 10000);
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
    if (r.status === 403) return { ok: false, msg: '키 권한이 부족합니다' };
    return { ok: false, msg: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, msg: '네트워크 오류' }; }
}

async function _webTestGemini(key) {
  if (!key) return { skip: true };
  try {
    const r = await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, {}, 10000);
    if (r.status === 200) return { ok: true };
    if (r.status === 400 || r.status === 403) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
    return { ok: false, msg: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, msg: '네트워크 오류' }; }
}

async function _webTestOpenAI(key) {
  if (!key) return { skip: true };
  try {
    const r = await fetchWithTimeout('https://api.openai.com/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key }
    }, 10000);
    if (r.status === 200) return { ok: true };
    if (r.status === 401) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
    if (r.status === 429) return { ok: false, msg: '요청 한도 초과' };
    return { ok: false, msg: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, msg: '네트워크 오류' }; }
}

async function _webTestElevenLabs(key) {
  if (!key) return { skip: true };
  // ElevenLabs 키 형식: 32자 hex 또는 sk_ 접두사
  if (key.length >= 20) return { ok: true, formatOnly: true, msg: '키 형식 확인됨 (실제 음성 생성 시 검증)' };
  return { ok: false, msg: 'API 키 형식이 올바르지 않습니다' };
}

async function _webTestPexels(key) {
  if (!key) return { skip: true };
  try {
    const r = await fetchWithTimeout('https://api.pexels.com/v1/search?query=test&per_page=1', {
      headers: { 'Authorization': key }
    }, 10000);
    if (r.status === 200) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
    return { ok: false, msg: 'HTTP ' + r.status };
  } catch (e) { return { ok: false, msg: '네트워크 오류' }; }
}

function _webTestPerplexity(key) {
  if (!key) return { skip: true };
  if (key.startsWith('pplx-') && key.length > 20) return { ok: true, msg: '형식 확인 (실제 호출 시 검증됩니다)' };
  return { ok: false, msg: '키 형식이 올바르지 않습니다 (pplx-... 형식)' };
}

function _webTestTTS(key) {
  if (!key) return { skip: true };
  if (key.startsWith('AIza') && key.length > 30) return { ok: true, msg: '형식 확인 (Cloud Text-to-Speech API 활성화 필요)' };
  return { ok: false, msg: '키 형식이 올바르지 않습니다 (AIza... 형식)' };
}

const WEB_TEST_MAP = {
  youtube: _webTestYouTube,
  claude: _webTestClaude,
  gemini: _webTestGemini,
  openai: _webTestOpenAI,
  elevenlabs: _webTestElevenLabs,
  pexels: _webTestPexels,
  perplexity: _webTestPerplexity,
  tts: _webTestTTS,
};

// ═══════════════════════════════════════
// 통합 테스트 함수: Electron → IPC, 웹 → 직접 fetch
// ═══════════════════════════════════════

export { _isElectron as isElectronEnv };

async function _runTest(provider, key) {
  if (_isElectron) {
    // Electron: 키를 IPC로 Main Process에 전달하여 테스트
    // ※ 키는 IPC 채널을 통해서만 이동하며 렌더러 fetch를 사용하지 않음
    return window.electronAPI.testApiKeyDirect(provider, key);
  }
  // 웹(개발/테스트): 렌더러에서 직접 호출
  const fn = WEB_TEST_MAP[provider];
  if (!fn) return { ok: false, msg: 'UNKNOWN_PROVIDER' };
  return fn(key);
}

// ═══════════════════════════════════════
// 전체 키 검증 (순차 실행 + 결과 UI)
// ═══════════════════════════════════════

export async function validateAllKeys() {
  const area = $('keyValidationArea');
  const btn = $('validateKeysBtn');
  if (!area || !btn) return;

  const yt = ($('keyYt') || {}).value || '';
  const claude = ($('keyClaude') || {}).value || '';
  const gemini = ($('keyGemini') || {}).value || '';
  const openai = ($('keyChatgpt') || {}).value || '';
  const tts = ($('keyTts') || {}).value || '';
  const el11 = ($('keyEl') || {}).value || '';
  const pexels = ($('keyPexels') || {}).value || '';
  const gaiStudio = ($('keyGaiStudio') || {}).value || '';
  const perplexity = ($('keyPerp') || {}).value || '';

  let llmProvider = 'claude';
  if ($('llmGemini') && $('llmGemini').classList.contains('on')) llmProvider = 'gemini';
  if ($('llmChatgpt') && $('llmChatgpt').classList.contains('on')) llmProvider = 'chatgpt';

  const tests = [
    { label: 'YouTube', provider: 'youtube', key: yt.trim(), required: true },
  ];
  if (llmProvider === 'claude') tests.push({ label: 'Claude', provider: 'claude', key: claude.trim(), required: true });
  else if (llmProvider === 'gemini') tests.push({ label: 'Gemini', provider: 'gemini', key: gemini.trim(), required: true });
  else if (llmProvider === 'chatgpt') tests.push({ label: 'ChatGPT', provider: 'openai', key: openai.trim(), required: true });
  if (llmProvider !== 'gemini' && gaiStudio.trim()) {
    tests.push({ label: 'Google AI (영상 분석)', provider: 'gemini', key: gaiStudio.trim(), required: true });
  }
  if (tts.trim()) tests.push({ label: 'Google TTS', provider: 'tts', key: tts.trim(), required: false });
  if (el11.trim()) tests.push({ label: 'ElevenLabs', provider: 'elevenlabs', key: el11.trim(), required: false });
  if (pexels.trim()) tests.push({ label: 'Pexels', provider: 'pexels', key: pexels.trim(), required: false });
  if (perplexity.trim()) tests.push({ label: 'Perplexity', provider: 'perplexity', key: perplexity.trim(), required: false });

  btn.disabled = true;
  btn.textContent = '\u23F3 테스트 중...';

  // 테스트 경로 안내
  const methodNote = _isElectron ? 'Main Process IPC 경유' : '렌더러 직접 호출 (개발 모드)';

  area.textContent = '';
  const wrap = el('div', { style: 'padding:16px;background:var(--bg);border-radius:var(--r2);border:1px solid var(--bdr)' });
  const header = el('div', { style: 'font-size:13px;font-weight:600;margin-bottom:12px;color:var(--t1)' });
  header.appendChild(document.createTextNode('\uD83D\uDD0D API 연결 테스트 중...'));
  header.appendChild(el('span', { style: 'font-size:10px;font-weight:400;color:var(--t4);margin-left:8px', textContent: methodNote }));
  wrap.appendChild(header);
  const resultsEl = el('div', { id: 'validationResults' });
  wrap.appendChild(resultsEl);
  area.appendChild(wrap);

  let passCount = 0;
  let requiredFailCount = 0;
  let optionalFailCount = 0;
  let skipCount = 0;

  for (const t of tests) {
    const row = el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bdr)' });

    const icon = el('span', { style: 'width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;background:var(--bg2);color:var(--t3)', textContent: '\u23F3' });
    row.appendChild(icon);

    const label = el('span', { style: 'font-size:13px;font-weight:500;min-width:120px;color:var(--t1)', textContent: t.label + (t.required ? ' *' : '') });
    row.appendChild(label);

    const status = el('span', { style: 'font-size:12px;color:var(--t3)', textContent: '확인 중...' });
    row.appendChild(status);

    resultsEl.appendChild(row);

    try {
      const result = await _runTest(t.provider, t.key);
      if (result.skip) {
        icon.textContent = '\u2014';
        icon.style.background = 'var(--bg2)';
        icon.style.color = 'var(--t4)';
        status.textContent = '미입력';
        status.style.color = 'var(--t4)';
        if (t.required) { requiredFailCount++; status.textContent = '미입력 (필수)'; status.style.color = 'var(--red)'; icon.textContent = '!'; icon.style.background = 'var(--red-bg)'; icon.style.color = 'var(--red)'; }
        else { skipCount++; }
      } else if (result.ok && result.formatOnly) {
        // ★ P2-fix: 형식만 확인된 경우 — 성공이지만 경고 스타일로 구분
        icon.textContent = '\u26A0';
        icon.style.background = 'var(--yel-bg)';
        icon.style.color = 'var(--yel)';
        status.textContent = result.msg || '형식만 확인됨';
        status.style.color = 'var(--yel)';
        passCount++;
      } else if (result.ok) {
        icon.textContent = '\u2713';
        icon.style.background = 'var(--grn-bg)';
        icon.style.color = 'var(--grn)';
        status.textContent = result.msg || '연결 성공';
        status.style.color = 'var(--grn)';
        passCount++;
      } else {
        icon.textContent = '\u2717';
        icon.style.background = 'var(--red-bg)';
        icon.style.color = 'var(--red)';
        status.textContent = result.msg || '연결 실패';
        status.style.color = 'var(--red)';
        if (t.required) { requiredFailCount++; }
        else {
          optionalFailCount++;
          icon.style.background = 'var(--yel-bg)';
          icon.style.color = 'var(--yel)';
          status.style.color = 'var(--yel)';
          status.textContent = (result.msg || '연결 실패') + ' (선택 — 나중에 수정 가능)';
        }
      }
    } catch (e) {
      icon.textContent = '\u2717';
      icon.style.background = 'var(--red-bg)';
      icon.style.color = 'var(--red)';
      status.textContent = '오류: ' + (e.message || '').substring(0, 50);
      status.style.color = 'var(--red)';
      if (t.required) { requiredFailCount++; }
      else { optionalFailCount++; }
    }
  }

  const totalFailCount = requiredFailCount + optionalFailCount;
  const summary = el('div', { style: 'margin-top:12px;padding:10px 14px;border-radius:var(--r);font-size:13px;font-weight:600;line-height:1.5' });

  if (totalFailCount === 0) {
    summary.style.background = 'var(--grn-bg)';
    summary.style.color = 'var(--grn)';
    summary.textContent = '\u2713 모든 API 키가 정상입니다!' + (skipCount > 0 ? ' (선택 키 ' + skipCount + '개 미입력)' : '');
  } else if (requiredFailCount === 0 && optionalFailCount > 0) {
    summary.style.background = 'var(--yel-bg)';
    summary.style.color = 'var(--yel)';
    summary.textContent = '\u2713 필수 키는 정상입니다! 선택 키 ' + optionalFailCount + '개에 문제가 있지만 바로 시작할 수 있습니다.';
  } else {
    summary.style.background = 'var(--red-bg)';
    summary.style.color = 'var(--red)';
    summary.textContent = '\u2717 필수 키 ' + requiredFailCount + '개에 문제가 있습니다. 위 오류 메시지를 확인해주세요.';
  }
  resultsEl.appendChild(summary);

  btn.disabled = false;
  btn.textContent = '\uD83D\uDD0D 연결 테스트';
  return { failCount: totalFailCount, requiredFailCount, optionalFailCount, passCount, skipCount };
}

// ═══════════════════════════════════════
// P0-2: 필드별 실시간 검증 (개별 키 테스트)
// ═══════════════════════════════════════
export async function validateSingleKey(provider, key) {
  if (!key || !key.trim()) return { skip: true };
  return _runTest(provider, key.trim());
}
