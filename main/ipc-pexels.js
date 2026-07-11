// ═══════════════════════════════════════════════
// main/ipc-pexels.js — Pexels Video API (Main Process)
// v3.6.0 — httpsGet 통합 (settled guard + timeout destroy 일관성)
// ═══════════════════════════════════════════════
const log = require('electron-log');
const { httpsGet } = require('./http-helpers');

function registerPexelsIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys) {
  ipcMain.handle('pexels-search', async (event, query) => {
    assertTrustedSender(event);
    query = asString(query, 200);
    const keys = readEncryptedKeys();
    if (!keys.pexels)
      return { status: 400, data: { error: 'Pexels API 키가 설정되지 않았습니다' } };

    const url =
      'https://api.pexels.com/videos/search?query=' +
      encodeURIComponent(query) +
      '&per_page=4&size=small';
    const r = await httpsGet(url, { Authorization: keys.pexels }, 15000);
    if (r.error) {
      log.error('[Pexels-IPC]', r.error);
      return { status: 500, data: { error: r.error } };
    }
    try {
      return { status: r.statusCode, data: JSON.parse(r.body) };
    } catch (e) {
      return { status: 500, data: { error: 'Pexels 응답 파싱 실패' } };
    }
  });
}

module.exports = { registerPexelsIPC };
