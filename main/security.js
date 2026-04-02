// ═══════════════════════════════════════════════
// main/security.js — IPC 신뢰 경계 + 입력 검증
// v3.6.0 — main.js에서 분리
// ═══════════════════════════════════════════════
const path = require('path');
const log = require('electron-log');
const { fileURLToPath } = require('url');

function isInsideDir(parentDir, candidatePath) {
  const parent = path.resolve(parentDir) + path.sep;
  const candidate = path.resolve(candidatePath);
  return candidate === path.resolve(parentDir) || candidate.startsWith(parent);
}

function isTrustedAppUrl(rawUrl, appDir) {
  try {
    const u = new URL(rawUrl);
    if (process.env.VITE_DEV_SERVER_URL) {
      const dev = new URL(process.env.VITE_DEV_SERVER_URL);
      if (u.origin === dev.origin) return true;
    }
    if (u.protocol !== 'file:') return false;
    const filePath = fileURLToPath(u);
    return isInsideDir(appDir, filePath);
  } catch (e) {
    return false;
  }
}

function createTrustedSenderGuard(appDir) {
  return function assertTrustedSender(event) {
    const url = event?.senderFrame?.url || '';
    if (isTrustedAppUrl(url, appDir)) return;
    log.warn('[IPC] Untrusted sender blocked:', url);
    throw new Error('UNTRUSTED_SENDER');
  };
}

function hardenChildWindow(win, allowedOrigins) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.session.setPermissionRequestHandler((_wc, _perm, callback) => { callback(false); });
  wc.on('will-navigate', (e, url) => {
    try { if (!allowedOrigins.includes(new URL(url).origin)) e.preventDefault(); }
    catch(err) { e.preventDefault(); }
  });
  wc.on('will-redirect', (e, url) => {
    try { if (!allowedOrigins.includes(new URL(url).origin)) e.preventDefault(); }
    catch(err) { e.preventDefault(); }
  });
}

function asString(v, maxLen) {
  if (typeof v !== 'string') throw new Error('잘못된 입력 형식입니다');
  const s = v.trim();
  if (s.length > maxLen) throw new Error('입력이 너무 깁니다');
  return s;
}

function isValidVideoId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(id);
}

module.exports = {
  isInsideDir,
  isTrustedAppUrl,
  createTrustedSenderGuard,
  hardenChildWindow,
  asString,
  isValidVideoId,
};
