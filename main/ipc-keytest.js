// ═══════════════════════════════════════════════
// main/ipc-keytest.js — API 키 연결 테스트 (Main Process)
// v3.6.0 — P1-5: fetch→httpsGet 전환 (프록시 설정 일관성)
// ═══════════════════════════════════════════════
const log = require('electron-log');
const { httpsGet } = require('./http-helpers');

// ── 개별 키 테스트 (Main Process에서 실행) ──

async function _testYouTube(key) {
  if (!key) return { skip: true };
  const r = await httpsGet(
    'https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&maxResults=1&key=' + key
  );
  if (r.error) return { ok: false, msg: '네트워크 오류: ' + r.error };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 403) {
    try {
      const d = JSON.parse(r.body);
      const reason =
        (d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || '';
      if (reason === 'quotaExceeded')
        return { ok: false, msg: '일일 할당량 초과 (한국 시간 오후 4시경 초기화)' };
      if (reason === 'accessNotConfigured')
        return { ok: false, msg: 'YouTube Data API v3가 활성화되지 않았습니다' };
    } catch (_) {}
    return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  }
  if (r.statusCode === 400) return { ok: false, msg: 'API 키 형식이 올바르지 않습니다' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

async function _testClaude(key) {
  if (!key) return { skip: true };
  const r = await httpsGet('https://api.anthropic.com/v1/models', {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  });
  if (r.error) return { ok: false, msg: '네트워크 오류' };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 401) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  if (r.statusCode === 403) return { ok: false, msg: '키 권한이 부족합니다' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

async function _testGemini(key) {
  if (!key) return { skip: true };
  const r = await httpsGet('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
  if (r.error) return { ok: false, msg: '네트워크 오류' };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 400 || r.statusCode === 403)
    return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

async function _testOpenAI(key) {
  if (!key) return { skip: true };
  const r = await httpsGet('https://api.openai.com/v1/models', { Authorization: 'Bearer ' + key });
  if (r.error) return { ok: false, msg: '네트워크 오류' };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 401) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  if (r.statusCode === 429) return { ok: false, msg: '요청 한도 초과' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

async function _testElevenLabs(key) {
  if (!key) return { skip: true };
  const r = await httpsGet('https://api.elevenlabs.io/v1/user', { 'xi-api-key': key });
  if (r.error) return { ok: false, msg: '네트워크 오류' };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 401) return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

async function _testPexels(key) {
  if (!key) return { skip: true };
  const r = await httpsGet('https://api.pexels.com/v1/search?query=test&per_page=1', {
    Authorization: key,
  });
  if (r.error) return { ok: false, msg: '네트워크 오류' };
  if (r.statusCode === 200) return { ok: true };
  if (r.statusCode === 401 || r.statusCode === 403)
    return { ok: false, msg: 'API 키가 유효하지 않습니다' };
  return { ok: false, msg: 'HTTP ' + r.statusCode };
}

function _testPerplexity(key) {
  if (!key) return { skip: true };
  // ★ P2-fix: formatOnly 플래그 추가 — UI에서 "형식만 확인됨" vs "실제 연결 성공" 구분 가능
  if (key.startsWith('pplx-') && key.length > 20)
    return { ok: true, formatOnly: true, msg: '형식 확인 (실제 호출 시 검증됩니다)' };
  return { ok: false, msg: '키 형식이 올바르지 않습니다 (pplx-... 형식)' };
}

function _testTTS(key) {
  if (!key) return { skip: true };
  // ★ P2-fix: formatOnly 플래그 추가
  if (key.startsWith('AIza') && key.length > 30)
    return { ok: true, formatOnly: true, msg: '형식 확인 (Cloud Text-to-Speech API 활성화 필요)' };
  return { ok: false, msg: '키 형식이 올바르지 않습니다 (AIza... 형식)' };
}

const TEST_MAP = {
  youtube: _testYouTube,
  claude: _testClaude,
  gemini: _testGemini,
  // ★ v3.6.2 P0-1: googleAiStudio는 별도 키로 저장되지만 검증은 동일한 Gemini API 사용
  googleAiStudio: _testGemini,
  openai: _testOpenAI,
  elevenlabs: _testElevenLabs,
  pexels: _testPexels,
  perplexity: _testPerplexity,
  tts: _testTTS,
};

// ── IPC 핸들러 등록 ──
function registerKeyTestIPC(ipcMain, assertTrustedSender, readEncryptedKeys) {
  // 단일 키 테스트: 저장된 키를 Main에서 읽어서 테스트 (렌더러에 키 미전달)
  ipcMain.handle('test-api-key', async (event, provider) => {
    assertTrustedSender(event);
    if (typeof provider !== 'string' || !TEST_MAP[provider]) {
      return { ok: false, msg: 'INVALID_PROVIDER' };
    }
    const keys = readEncryptedKeys();
    const key = keys[provider] || '';

    try {
      const result = await TEST_MAP[provider](key);
      log.info('[KeyTest]', provider, result.ok ? 'OK' : 'FAIL: ' + (result.msg || ''));
      return result;
    } catch (e) {
      log.error('[KeyTest]', provider, e.message);
      return { ok: false, msg: '테스트 오류: ' + (e.message || '') };
    }
  });

  // 폼에서 입력한 키로 직접 테스트 (아직 저장 전 — 키를 IPC 인자로 받음)
  ipcMain.handle('test-api-key-direct', async (event, provider, key) => {
    assertTrustedSender(event);
    if (typeof provider !== 'string' || !TEST_MAP[provider]) {
      return { ok: false, msg: 'INVALID_PROVIDER' };
    }
    if (typeof key !== 'string') return { ok: false, msg: 'INVALID_KEY' };
    if (key.length > 500) return { ok: false, msg: 'KEY_TOO_LONG' };

    try {
      const result = await TEST_MAP[provider](key.trim());
      log.info('[KeyTest:direct]', provider, result.ok ? 'OK' : 'FAIL: ' + (result.msg || ''));
      return result;
    } catch (e) {
      log.error('[KeyTest:direct]', provider, e.message);
      return { ok: false, msg: '테스트 오류: ' + (e.message || '') };
    }
  });
}

module.exports = { registerKeyTestIPC };
