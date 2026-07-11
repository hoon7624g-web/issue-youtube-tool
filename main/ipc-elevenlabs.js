// ═══════════════════════════════════════════════
// main/ipc-elevenlabs.js — ElevenLabs IPC (렌더러에 키 노출 방지)
// requestId 기반 취소 지원
// ═══════════════════════════════════════════════
const { httpsPostBuffer } = require('./http-helpers');

const _activeElevenLabsRequests = new Map();

function registerElevenLabsIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys) {
  ipcMain.handle('cancel-elevenlabs-request', (event, requestId) => {
    assertTrustedSender(event);
    const rid = requestId || 'default';
    const entry = _activeElevenLabsRequests.get(rid);
    if (!entry) return { ok: true, cancelled: false };
    entry.cancelled = true;
    try { if (entry.controller) entry.controller.abort(); } catch (_) {}
    return { ok: true, cancelled: true };
  });

  ipcMain.handle('call-elevenlabs-tts', async (event, text, voiceId, speed, requestId) => {
    assertTrustedSender(event);
    text = asString(text, 5000);
    voiceId = asString(voiceId, 100);
    speed = Math.min(Math.max(parseFloat(speed) || 1.0, 0.25), 4.0);
    const keys = readEncryptedKeys();
    if (!keys.elevenlabs) return { error: 'ElevenLabs API 키가 설정되지 않았습니다.', status: 401 };

    const controller = new AbortController();
    const rid = requestId || 'default';
    const entry = { controller, cancelled: false };
    _activeElevenLabsRequests.set(rid, entry);

    try {
      const body = JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        speed: speed
      });
      const res = await httpsPostBuffer({
        hostname: 'api.elevenlabs.io',
        path: '/v1/text-to-speech/' + encodeURIComponent(voiceId),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': keys.elevenlabs,
          'Content-Length': Buffer.byteLength(body)
        }
      }, body, 120000, undefined, controller.signal);
      if (entry.cancelled || res.cancelled) return { cancelled: true, status: 499 };
      if (res.error) return { error: res.error, status: 0 };
      if (res.statusCode === 401) return { error: 'ElevenLabs API 키가 유효하지 않습니다.', status: 401 };
      if (res.statusCode >= 400) return { error: 'ElevenLabs 오류: ' + res.statusCode, status: res.statusCode };
      return { audioBase64: res.body.toString('base64'), status: 200 };
    } catch (e) { return { error: e.message, status: 0 }; }
    finally {
      const current = _activeElevenLabsRequests.get(rid);
      if (current === entry) _activeElevenLabsRequests.delete(rid);
    }
  });

  ipcMain.handle('upload-elevenlabs-voice', async (event, payload) => {
    assertTrustedSender(event);
    const keys = readEncryptedKeys();
    if (!keys.elevenlabs) return { ok: false, error: 'ElevenLabs API 키가 설정되지 않았습니다.' };
    if (!payload || !payload.bytes || !payload.name) return { ok: false, error: '파일 데이터가 없습니다.' };
    try {
      const fileBuffer = Buffer.from(payload.bytes);
      if (fileBuffer.length > 20 * 1024 * 1024) return { ok: false, error: '파일이 너무 큽니다 (20MB 이하)' };
      const boundary = '----ELBoundary' + Date.now();
      const voiceName = '내 목소리 - ' + new Date().toLocaleDateString('ko');
      const parts = [];
      parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="name"\r\n\r\n' + voiceName);
      parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="description"\r\n\r\nIssue YouTube Tool custom voice');
      const fileHeader = '--' + boundary + '\r\nContent-Disposition: form-data; name="files"; filename="' + (payload.name || 'voice.mp3') + '"\r\nContent-Type: ' + (payload.type || 'audio/mpeg') + '\r\n\r\n';
      const tail = '\r\n--' + boundary + '--\r\n';
      const bodyParts = Buffer.concat([
        Buffer.from(parts.join('\r\n') + '\r\n'),
        Buffer.from(fileHeader),
        fileBuffer,
        Buffer.from(tail)
      ]);
      const res = await httpsPostBuffer({
        hostname: 'api.elevenlabs.io',
        path: '/v1/voices/add',
        method: 'POST',
        headers: {
          'xi-api-key': keys.elevenlabs,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': bodyParts.length
        }
      }, bodyParts, 120000);
      if (res.error) return { ok: false, error: res.error };
      if (res.statusCode === 401) return { ok: false, error: 'ElevenLabs API 키가 유효하지 않습니다.' };
      if (res.statusCode >= 400) return { ok: false, error: 'ElevenLabs 업로드 오류: ' + res.statusCode };
      const data = JSON.parse(res.body.toString('utf8'));
      return { ok: true, voiceId: data.voice_id };
    } catch (e) { return { ok: false, error: e.message || '업로드 실패' }; }
  });
}

module.exports = { registerElevenLabsIPC };
