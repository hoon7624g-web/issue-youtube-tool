// ═══════════════════════════════════════════════
// main/ipc-tts.js — Google TTS IPC (렌더러에 키 노출 방지)
// requestId 기반 취소 지원
// ═══════════════════════════════════════════════
const { httpsPost } = require('./http-helpers');

const _activeTtsRequests = new Map();

function registerTTSIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys) {
  ipcMain.handle('cancel-tts-request', (event, requestId) => {
    assertTrustedSender(event);
    const rid = requestId || 'default';
    const entry = _activeTtsRequests.get(rid);
    if (!entry) return { ok: true, cancelled: false };
    entry.cancelled = true;
    try { if (entry.controller) entry.controller.abort(); } catch (_) {}
    return { ok: true, cancelled: true };
  });

  ipcMain.handle('call-tts', async (event, text, voiceName, gender, speed, requestId) => {
    assertTrustedSender(event);
    text = asString(text, 5000);
    voiceName = (typeof voiceName === 'string' && voiceName.length < 50) ? voiceName : 'ko-KR-Neural2-B';
    gender = (typeof gender === 'string' && ['MALE','FEMALE'].includes(gender)) ? gender : 'FEMALE';
    speed = (typeof speed === 'number' && speed >= 0.5 && speed <= 2.0) ? speed : 1.0;

    const keys = readEncryptedKeys();
    if (!keys.tts) return { error: 'Google TTS API 키가 설정되지 않았습니다.', status: 401 };

    const controller = new AbortController();
    const rid = requestId || 'default';
    const entry = { controller, cancelled: false };
    _activeTtsRequests.set(rid, entry);

    try {
      const body = JSON.stringify({
        input: { text },
        voice: { languageCode: 'ko-KR', name: voiceName, ssmlGender: gender },
        audioConfig: { audioEncoding: 'MP3', speakingRate: speed, pitch: 0 }
      });
      const res = await httpsPost({
        hostname: 'texttospeech.googleapis.com',
        path: '/v1/text:synthesize?key=' + keys.tts,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, body, 60000, undefined, controller.signal);
      if (entry.cancelled || res.cancelled) return { cancelled: true, status: 499 };
      if (res.error) return { error: res.error, status: 0 };
      const json = JSON.parse(res.body);
      if (res.statusCode === 403) return { error: 'Google TTS API 키가 유효하지 않거나 API가 활성화되지 않았습니다.', status: 403 };
      if (res.statusCode >= 400) return { error: (json.error && json.error.message) || 'TTS API 오류', status: res.statusCode };
      return { audioContent: json.audioContent, status: 200 };
    } catch (e) { return { error: e.message, status: 0 }; }
    finally {
      const current = _activeTtsRequests.get(rid);
      if (current === entry) _activeTtsRequests.delete(rid);
    }
  });
}

module.exports = { registerTTSIPC };
