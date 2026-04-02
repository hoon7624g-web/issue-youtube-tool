// ═══════════════════════════════════════════════
// main.js — Electron Main Process (v3.6.0)
// 역할: 윈도우 생성 + 모듈 조립 + 자막/이슈링크/업데이트
// LLM/키/보안 로직은 main/ 하위 모듈로 분리
// ═══════════════════════════════════════════════
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const log = require('electron-log');

// ── 분리된 모듈 ──
const { createTrustedSenderGuard, hardenChildWindow, asString, isValidVideoId, isTrustedAppUrl } = require('./main/security');
const { readEncryptedKeys, registerKeyIPC, KEY_FILE, SESSION_FILE } = require('./main/keys');
const { registerLLMIPC, registerLLMStreamIPC } = require('./main/ipc-llm');
const { registerTTSIPC } = require('./main/ipc-tts');
const { registerElevenLabsIPC } = require('./main/ipc-elevenlabs');
const { registerSubtitleIPC, getFailCacheCleanupInterval } = require('./main/subtitle');
const { registerYouTubeIPC } = require('./main/ipc-youtube');
const { registerPexelsIPC } = require('./main/ipc-pexels');
const { registerKeyTestIPC } = require('./main/ipc-keytest');
const { registerFFmpegIPC } = require('./main/ipc-ffmpeg');
const { registerRemotionIPC } = require('./main/ipc-remotion');
const { httpsGet } = require('./main/http-helpers');

const assertTrustedSender = createTrustedSenderGuard(__dirname);

// ═══════════════════════════════════════════════
// 자동 업데이트 (electron-updater)
// ═══════════════════════════════════════════════
let autoUpdater;
try { autoUpdater = require('electron-updater').autoUpdater; }
catch (e) { log.warn('[Update] electron-updater not installed'); autoUpdater = null; }

if (autoUpdater) {
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
}

let mainWindow;
let updateStatus = { checking: false, available: false, downloaded: false, version: '', error: null };

// ═══════════════════════════════════════════════
// 윈도우 생성
// ═══════════════════════════════════════════════
const ALLOWED_HOSTS = new Set([
  'www.youtube.com', 'youtube.com', 'youtu.be',
  'www.perplexity.ai', 'perplexity.ai',
  'www.issuelink.co.kr', 'issuelink.co.kr',
  'www.storyblocks.com', 'storyblocks.com',
  'www.pexels.com', 'pexels.com',
  'aistudio.google.com', 'console.anthropic.com', 'platform.openai.com',
  'elevenlabs.io', 'www.elevenlabs.io',
  'console.cloud.google.com', 'cloud.google.com', 'github.com'
]);

function isAllowedUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname); }
  catch(e) { return false; }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: '유튜브도사 영상 제작 솔루션',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });

  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isTrustedAppUrl(url, __dirname)) return;
    if (isAllowedUrl(url)) { e.preventDefault(); shell.openExternal(url); return; }
    e.preventDefault();
  });
}

// ── semver 비교 (macOS 업데이트 체크용) ──
function _isNewerVersion(latest, current) {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// ═══════════════════════════════════════════════
// 앱 시작
// ═══════════════════════════════════════════════
app.whenReady().then(() => {
  createWindow();
  if (autoUpdater && app.isPackaged && process.platform !== 'darwin') {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(err => { log.warn('[Update]', err.message); }); }, 2000);
    setInterval(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 4 * 60 * 60 * 1000);
  }
  // ── macOS: GitHub Releases 기반 수동 업데이트 알림 ──
  if (app.isPackaged && process.platform === 'darwin') {
    const checkMacUpdate = async () => {
      const currentVer = app.getVersion();
      const res = await httpsGet('https://api.github.com/repos/shyun-create/issue-youtube-tool/releases/latest', {
        'User-Agent': 'youtube-dosa-updater',
        'Accept': 'application/vnd.github.v3+json'
      }, 10000);
      if (res.error || res.statusCode < 200 || res.statusCode >= 300) {
        log.warn('[Update:macOS] 체크 실패:', res.error || ('HTTP ' + res.statusCode));
        return;
      }
      try {
        const data = JSON.parse(res.body || '{}');
        const latestVer = (data.tag_name || '').replace(/^v/, '');
        if (latestVer && latestVer !== currentVer && _isNewerVersion(latestVer, currentVer)) {
          log.info('[Update:macOS] 새 버전 발견:', latestVer, '(현재:', currentVer + ')');
          updateStatus = { checking: false, available: true, downloaded: false, version: latestVer, error: null, macDownloadUrl: data.html_url || '' };
          sendUpdateStatus();
        }
      } catch(e) { log.warn('[Update:macOS] 파싱 실패:', e.message); }
    };
    setTimeout(checkMacUpdate, 5000);
    setInterval(checkMacUpdate, 6 * 60 * 60 * 1000); // 6시간마다
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ═══════════════════════════════════════════════
// 공용 PC 모드 — 앱 종료 시 동기 삭제 (beforeunload IPC 경쟁 상태 방지)
// ═══════════════════════════════════════════════
let _sessionOnlyMode = false;
const fs = require('fs');

ipcMain.handle('set-session-only-mode', (event, enabled) => {
  assertTrustedSender(event);
  _sessionOnlyMode = !!enabled;
  return { ok: true };
});

app.on('before-quit', () => {
  // ★ v3.6.0: lazy init된 interval 정리
  const _interval = getFailCacheCleanupInterval();
  if (_interval) clearInterval(_interval);
  if (!_sessionOnlyMode) return;
  log.info('[SessionOnly] 공용 PC 모드 — 종료 전 데이터 동기 삭제');
  try { if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE); } catch(e) { log.warn('[SessionOnly] KEY_FILE 삭제 실패:', e.message); }
  try { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); } catch(e) { log.warn('[SessionOnly] SESSION_FILE 삭제 실패:', e.message); }
});

// ═══════════════════════════════════════════════
// 업데이트 이벤트
// ═══════════════════════════════════════════════
function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', updateStatus);
}

if (autoUpdater) {
  autoUpdater.on('checking-for-update', () => { updateStatus.checking = true; sendUpdateStatus(); });
  autoUpdater.on('update-available', (info) => { updateStatus = { checking: false, available: true, downloaded: false, version: info.version, error: null }; sendUpdateStatus(); });
  autoUpdater.on('update-not-available', () => { updateStatus = { checking: false, available: false, downloaded: false, version: '', error: null }; sendUpdateStatus(); });
  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) { mainWindow.setProgressBar(Math.round(progress.percent) / 100); mainWindow.webContents.send('update-progress', Math.round(progress.percent)); }
  });
  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = { checking: false, available: true, downloaded: true, version: info.version, error: null };
    if (mainWindow) mainWindow.setProgressBar(-1);
    sendUpdateStatus();
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info', title: '업데이트 준비 완료',
        message: `새 버전 ${info.version}이 다운로드되었습니다.`,
        detail: '앱을 종료하면 자동으로 업데이트가 설치됩니다.\n지금 재시작하시겠습니까?',
        buttons: ['지금 재시작', '나중에'], defaultId: 0, cancelId: 1,
      }).then(({ response }) => { if (response === 0) autoUpdater.quitAndInstall(false, true); });
    }
  });
  autoUpdater.on('error', (err) => {
    updateStatus = { checking: false, available: false, downloaded: false, version: '', error: err.message };
    if (mainWindow) mainWindow.setProgressBar(-1);
    sendUpdateStatus();
  });
}

// ═══════════════════════════════════════════════
// IPC 등록 — 키/세션 + LLM + 업데이트 + 기타
// ═══════════════════════════════════════════════
registerKeyIPC(ipcMain, assertTrustedSender);
registerLLMIPC(ipcMain, assertTrustedSender, asString, isValidVideoId, readEncryptedKeys);
registerLLMStreamIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys, isValidVideoId);
registerSubtitleIPC(ipcMain, assertTrustedSender, asString, isValidVideoId, hardenChildWindow);
registerTTSIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys);
registerElevenLabsIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys);
registerYouTubeIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys);
registerPexelsIPC(ipcMain, assertTrustedSender, asString, readEncryptedKeys);
registerKeyTestIPC(ipcMain, assertTrustedSender, readEncryptedKeys);
registerFFmpegIPC(ipcMain, assertTrustedSender, () => mainWindow);
registerRemotionIPC(ipcMain, assertTrustedSender, () => mainWindow);

ipcMain.handle('get-update-status', (event) => { assertTrustedSender(event); return updateStatus; });
ipcMain.handle('check-for-update', (event) => { assertTrustedSender(event); if (autoUpdater) autoUpdater.checkForUpdates().catch(() => {}); return { ok: true }; });
ipcMain.handle('install-update', (event) => { assertTrustedSender(event); if (autoUpdater && updateStatus.downloaded) autoUpdater.quitAndInstall(false, true); return { ok: true }; });
// macOS: 자동 업데이트 불가 → GitHub 릴리즈 페이지 열기
ipcMain.handle('open-update-page', (event) => {
  assertTrustedSender(event);
  const url = updateStatus.macDownloadUrl || 'https://github.com/shyun-create/issue-youtube-tool/releases/latest';
  shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('open-index', (event) => {
  assertTrustedSender(event);
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
});

// ═══════════════════════════════════════════════
// Perplexity 내장 브라우저
// ═══════════════════════════════════════════════
let perplexityWin = null;
ipcMain.handle('open-perplexity', (event, query) => {
  assertTrustedSender(event);
  query = asString(query || '', 500);
  const url = 'https://www.perplexity.ai/search?q=' + encodeURIComponent(query);
  if (perplexityWin && !perplexityWin.isDestroyed()) { perplexityWin.loadURL(url); perplexityWin.focus(); return; }
  perplexityWin = new BrowserWindow({
    width: 1000, height: 750, title: 'Perplexity 팩트체크', parent: mainWindow,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, partition: 'persist:perplexity' }
  });
  perplexityWin.setMenuBarVisibility(false);
  hardenChildWindow(perplexityWin, ['https://www.perplexity.ai', 'https://perplexity.ai']);
  perplexityWin.loadURL(url);
  perplexityWin.on('closed', () => { perplexityWin = null; });
});

// ═══════════════════════════════════════════════
// API 키 발급 가이드 (로컬 HTML)
// ═══════════════════════════════════════════════
let apiGuideWin = null;
ipcMain.handle('open-api-guide', (event) => {
  assertTrustedSender(event);
  const guidePath = path.join(__dirname, 'api-key-guide', 'index.html');
  if (apiGuideWin && !apiGuideWin.isDestroyed()) { apiGuideWin.focus(); return; }
  apiGuideWin = new BrowserWindow({
    width: 860, height: 750, title: 'API 키 발급 가이드', parent: mainWindow,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  apiGuideWin.setMenuBarVisibility(false);
  apiGuideWin.loadFile(guidePath);
  apiGuideWin.on('closed', () => { apiGuideWin = null; });
});

// ═══════════════════════════════════════════════
// 이슈링크 크롤링 (Node.js https)
// ═══════════════════════════════════════════════
ipcMain.handle('get-issuelink', async (event) => {
  assertTrustedSender(event);
  const https = require('https');
  try {
    // ── 리다이렉트 최대 3회 추적하는 fetch 함수 ──
    // ★ v3.5.8: settled guard + tooLarge + timeout 시 req.destroy 추가
    function fetchWithRedirects(url, maxRedirects) {
      maxRedirects = maxRedirects || 3;
      return new Promise((resolve, reject) => {
        let settled = false;
        const _resolve = (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
        const _reject = (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); };

        let req;
        const timer = setTimeout(() => { if (req) req.destroy(); _reject(new Error('timeout 15s')); }, 15000);
        const opts = typeof url === 'string' ? url : url;
        const reqOpts = {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        };
        req = https.get(opts, reqOpts, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
            try {
              const redirectUrl = new URL(res.headers.location, opts);
              if (redirectUrl.protocol !== 'https:' || !(redirectUrl.hostname === 'issuelink.co.kr' || redirectUrl.hostname.endsWith('.issuelink.co.kr'))) {
                _reject(new Error('Untrusted redirect: ' + redirectUrl.hostname)); return;
              }
              res.resume(); // 이전 응답 drain
              if (settled) return;
              clearTimeout(timer);
              // ★ Fix #1: _resolve/_reject로 연결하여 settled guard 일관성 유지
              fetchWithRedirects(redirectUrl.href, maxRedirects - 1).then(_resolve).catch(_reject);
            } catch(e) { _reject(new Error('Invalid redirect URL')); }
            return;
          }
          let body = '';
          let tooLarge = false;
          res.on('data', (c) => {
            if (tooLarge) return;
            body += c;
            if (body.length > 5 * 1024 * 1024) {
              tooLarge = true;
              req.destroy();
              _reject(new Error('Response too large'));
            }
          });
          res.on('end', () => { if (!tooLarge) _resolve(body); });
        });
        req.on('error', (e) => { _reject(e); });
      });
    }

    const html = await fetchWithRedirects('https://www.issuelink.co.kr', 3);
    const keywords = [];

    // ── 다중 정규식 전략: 사이트 변경에 대응 ──
    const patterns = [
      /class="[^"]*btn-danger[^"]*"[^>]*>([^<]+)/g,                    // 기존 Bootstrap btn-danger
      /class="[^"]*hot[_-]?keyword[^"]*"[^>]*>([^<]+)/g,               // hot-keyword, hot_keyword 클래스
      /class="[^"]*badge[^"]*danger[^"]*"[^>]*>([^<]+)/g,              // badge-danger 변형
      /class="[^"]*keyword[_-]?item[^"]*"[^>]*>([^<]+)/g,             // keyword-item 클래스
      /<(?:a|span|div|button)[^>]*class="[^"]*(?:hot|issue|keyword|rank)[^"]*(?:tag|item|badge)[^"]*"[^>]*>([^<]{2,25})<\/(?:a|span|div|button)>/gi,
    ];
    const stopWords = ['로그인', '회원가입', '전체보기', '더보기', '마이페이지', '이용약관', '개인정보처리방침'];

    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(html)) !== null && keywords.length < 10) {
        const text = match[1].trim();
        if (!text || text.length >= 30) continue;
        if (stopWords.some(w => text.indexOf(w) !== -1)) continue;
        if (!keywords.some(k => k.keyword === text)) keywords.push({ keyword: text });
      }
      if (keywords.length >= 5) break; // 5개 이상 찾으면 충분
    }

    log.info('[IssueLink] HTML ' + html.length + '자, 키워드 ' + keywords.length + '개 추출');
    return { hotKeywords: keywords, posts: [] };
  } catch(e) {
    log.error('[IssueLink] 크롤링 실패:', e.message);
    return { hotKeywords: [], posts: [], error: e.message };
  }
});

// ═══════════════════════════════════════════════
// 자막 추출 → main/subtitle.js로 분리 완료
// registerSubtitleIPC()로 등록됨 (상단 참조)
// ═══════════════════════════════════════════════
