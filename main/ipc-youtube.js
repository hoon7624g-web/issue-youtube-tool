// ═══════════════════════════════════════════════
// main/ipc-youtube.js — YouTube Data API (Main Process)
// v3.6.0 — httpsGet 통합 (settled guard + timeout destroy 일관성)
// ★ P2-fix: abort 지원 — 빠른 재검색 시 이전 요청 취소로 쿼터 절약
// ═══════════════════════════════════════════════
const log = require('electron-log');
const { httpsGet } = require('./http-helpers');

async function ytApiFetch(endpoint, params, signal) {
  const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const url = 'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + qs;
  const r = await httpsGet(url, {}, 15000, signal);
  if (r.cancelled) return { status: 499, data: {}, cancelled: true };
  if (r.error) throw new Error(r.error);
  try {
    return { status: r.statusCode, data: JSON.parse(r.body) };
  } catch (e) {
    throw new Error('YouTube API 응답 파싱 실패');
  }
}

let _activeYtAC = null;

function registerYouTubeIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys) {
  ipcMain.handle('yt-fetch', async (event, endpoint, params) => {
    assertTrustedSender(event);
    endpoint = asString(endpoint, 50);
    // ★ P2-18: endpoint allowlist (방어 심화)
    const ALLOWED_ENDPOINTS = new Set(['search', 'videos', 'channels', 'videoCategories']);
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
      return { status: 400, data: { error: '허용되지 않는 API 엔드포인트입니다' } };
    }
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      return { status: 400, data: { error: '잘못된 요청 형식입니다' } };
    }
    // 안전한 파라미터만 허용
    const allowed = ['part', 'q', 'type', 'order', 'publishedAfter', 'maxResults', 'regionCode', 'relevanceLanguage', 'id', 'videoDuration'];
    const safe = {};
    for (const k of allowed) {
      if (typeof params[k] === 'string' || typeof params[k] === 'number') {
        safe[k] = String(params[k]);
      }
    }
    // 키는 main process에서 주입
    const keys = readEncryptedKeys();
    if (!keys.youtube) return { status: 400, data: { error: 'YouTube API 키가 설정되지 않았습니다' } };
    safe.key = keys.youtube;

    // ★ search 요청만 이전 요청 취소 (videos/channels은 병렬 호출이므로 취소하면 안 됨)
    let signal = null;
    if (endpoint === 'search') {
      if (_activeYtAC) { try { _activeYtAC.abort(); } catch (_) {} }
      _activeYtAC = new AbortController();
      signal = _activeYtAC.signal;
    }

    try {
      const result = await ytApiFetch(endpoint, safe, signal);
      if (result.cancelled) return { status: 499, data: { error: 'cancelled' } };
      return result;
    } catch (e) {
      if (signal && signal.aborted) return { status: 499, data: { error: 'cancelled' } };
      log.error('[YT-IPC]', e.message);
      return { status: 500, data: { error: e.message } };
    }
  });
}

module.exports = { registerYouTubeIPC };
