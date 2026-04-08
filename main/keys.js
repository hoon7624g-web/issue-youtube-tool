// ═══════════════════════════════════════════════
// main/keys.js — API 키 + 세션 토큰 암호화 저장 (safeStorage)
// v3.6.0 — main.js에서 분리
// ═══════════════════════════════════════════════
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

const KEY_FILE = path.join(app.getPath('userData'), '.api-keys.enc');
const SESSION_FILE = path.join(app.getPath('userData'), '.session.enc');

const ALLOWED_API_KEYS = ['youtube','claude','gemini','openai','tts','elevenlabs','pexels','googleAiStudio','perplexity','llmProvider','geminiVideoModel','claudeModel'];
const ALLOWED_SESSION_KEYS = ['access_token','refresh_token','user','expires_at'];

// ── 메모리 캐시 (파이프라인 중 수십 번의 디스크 I/O 방지) ──
let _keyCache = null;

function readEncryptedKeys() {
  if (_keyCache) return JSON.parse(JSON.stringify(_keyCache));
  try {
    if (!fs.existsSync(KEY_FILE)) return {};
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[Keys] safeStorage encryption not available, cannot read');
      return {};
    }
    const buf = fs.readFileSync(KEY_FILE);
    const json = safeStorage.decryptString(buf);
    _keyCache = JSON.parse(json);
    return JSON.parse(JSON.stringify(_keyCache));
  } catch(e) {
    log.error('[Keys] Failed to read encrypted keys:', e.message);
    return {};
  }
}

function writeEncryptedKeys(keys) {
  // ★ P0-3: 쓰기 성공 시 캐시를 즉시 갱신 (null 무효화 → 디스크 I/O 경쟁 방지)
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[Keys] safeStorage encryption not available, cannot write');
      _keyCache = null;
      return false;
    }
    const json = JSON.stringify(keys);
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(KEY_FILE, encrypted);
    _keyCache = JSON.parse(JSON.stringify(keys)); // ★ Fix #3: deep copy로 캐시 변형 방지
    return true;
  } catch(e) {
    log.error('[Keys] Failed to write encrypted keys:', e.message);
    _keyCache = null; // 실패 시에만 무효화
    return false;
  }
}

// ── IPC 핸들러 등록 ──
function registerKeyIPC(ipcMain, assertTrustedSender) {
  ipcMain.handle('get-api-keys', (event) => {
    assertTrustedSender(event);
    return readEncryptedKeys();
  });

  ipcMain.handle('set-api-keys', (event, keys) => {
    assertTrustedSender(event);
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return false;
    const sanitized = {};
    for (const k of ALLOWED_API_KEYS) {
      if (typeof keys[k] === 'string') {
        const value = keys[k].trim();
        if (value) sanitized[k] = value;
      }
    }
    return writeEncryptedKeys(sanitized);
  });

  ipcMain.handle('clear-api-keys', (event) => {
    assertTrustedSender(event);
    _keyCache = null;
    try { if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE); return true; } catch(e) { return false; }
  });

  ipcMain.handle('migrate-api-keys', (event, legacyKeys) => {
    assertTrustedSender(event);
    if (!legacyKeys || typeof legacyKeys !== 'object' || Array.isArray(legacyKeys)) return false;
    const sanitized = {};
    for (const k of ALLOWED_API_KEYS) {
      if (typeof legacyKeys[k] === 'string') {
        const value = legacyKeys[k].trim();
        if (value) sanitized[k] = value;
      }
    }
    if (Object.keys(sanitized).length === 0) return false;
    const current = readEncryptedKeys();
    if (Object.keys(current).length > 0) return false;
    return writeEncryptedKeys(sanitized);
  });

  // ── 세션 토큰 ──
  ipcMain.handle('get-session', (event) => {
    assertTrustedSender(event);
    try {
      if (!fs.existsSync(SESSION_FILE)) return null;
      if (!safeStorage.isEncryptionAvailable()) return null;
      const buf = fs.readFileSync(SESSION_FILE);
      return JSON.parse(safeStorage.decryptString(buf));
    } catch(e) { return null; }
  });

  ipcMain.handle('set-session', (event, session) => {
    assertTrustedSender(event);
    try {
      if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
      const sanitized = {};
      for (const k of ALLOWED_SESSION_KEYS) {
        if (session[k] !== undefined) sanitized[k] = session[k];
      }
      if (Object.keys(sanitized).length === 0) return false;
      const json = JSON.stringify(sanitized);
      if (json.length > 10000) return false;
      if (!safeStorage.isEncryptionAvailable()) return false;
      fs.writeFileSync(SESSION_FILE, safeStorage.encryptString(json));
      return true;
    } catch(e) { return false; }
  });

  ipcMain.handle('clear-session', (event) => {
    assertTrustedSender(event);
    try { if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE); return true; } catch(e) { return false; }
  });

  // ── 실제 저장 방식 상태 조회 (safeStorage 가용 여부) ──
  ipcMain.handle('get-storage-status', (event) => {
    assertTrustedSender(event);
    const available = safeStorage.isEncryptionAvailable();
    const hasKeys = fs.existsSync(KEY_FILE);
    return {
      encrypted: available,
      hasKeys: hasKeys,
      method: available ? 'safeStorage' : 'unsupported'
    };
  });

  // ── API 키 내보내기 (AES-256-GCM + 사용자 비밀번호) ──
  ipcMain.handle('export-api-keys', async (event, password) => {
    assertTrustedSender(event);
    const { dialog } = require('electron');
    const crypto = require('crypto');
    try {
      if (!password || typeof password !== 'string' || password.length < 4) return { ok: false, error: '비밀번호는 4자 이상이어야 합니다' };

      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'OS 보안 저장소를 사용할 수 없는 환경에서는 API 키 내보내기를 지원하지 않습니다' };
      }
      const keys = readEncryptedKeys();
      if (!keys || Object.keys(keys).length === 0) return { ok: false, error: '저장된 API 키가 없습니다', noKeys: true };
      // AES-256-GCM 암호화
      const salt = crypto.randomBytes(16);
      const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const json = JSON.stringify(keys);
      const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const payload = { v: 1, s: salt.toString('base64'), i: iv.toString('base64'), t: tag.toString('base64'), d: encrypted.toString('base64') };
      // 파일 저장 다이얼로그
      const { canceled, filePath } = await dialog.showSaveDialog(event.sender.getOwnerBrowserWindow(), {
        title: 'API 키 내보내기',
        defaultPath: 'youtube-dosa-keys.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { ok: false, error: '취소됨' };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
      log.info('[Keys] Exported to:', filePath);
      return { ok: true };
    } catch(e) {
      log.error('[Keys] Export failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── API 키 가져오기 ──
  ipcMain.handle('import-api-keys', async (event, password) => {
    assertTrustedSender(event);
    const { dialog } = require('electron');
    const crypto = require('crypto');
    try {
      if (!password || typeof password !== 'string') return { ok: false, error: '비밀번호를 입력해주세요' };
      const { canceled, filePaths } = await dialog.showOpenDialog(event.sender.getOwnerBrowserWindow(), {
        title: 'API 키 가져오기',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (canceled || !filePaths.length) return { ok: false, error: '취소됨' };
      const raw = fs.readFileSync(filePaths[0], 'utf8');
      const payload = JSON.parse(raw);
      if (!payload || payload.v !== 1 || !payload.s || !payload.i || !payload.t || !payload.d) return { ok: false, error: '올바른 키 파일이 아닙니다' };
      // AES-256-GCM 복호화
      const salt = Buffer.from(payload.s, 'base64');
      const iv = Buffer.from(payload.i, 'base64');
      const tag = Buffer.from(payload.t, 'base64');
      const encrypted = Buffer.from(payload.d, 'base64');
      const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      const keys = JSON.parse(decrypted);
      // 유효성 검증 후 저장
      const sanitized = {};
      for (const k of ALLOWED_API_KEYS) {
        if (typeof keys[k] === 'string') {
          const value = keys[k].trim();
          if (value) sanitized[k] = value;
        }
      }
      if (Object.keys(sanitized).length === 0) return { ok: false, error: '유효한 API 키가 없습니다' };

      const saved = writeEncryptedKeys(sanitized);
      if (!saved) {
        log.warn('[Keys] Import: safeStorage 불가 — 가져오기 중단');
        return { ok: false, error: 'OS 보안 저장소를 사용할 수 없어 API 키를 가져올 수 없습니다' };
      }

      log.info('[Keys] Imported', Object.keys(sanitized).length, 'keys');
      return { ok: true, count: Object.keys(sanitized).length };
    } catch(e) {
      // ★ P1-8: Node.js/OpenSSL 버전별 에러 메시지 차이 대응
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('unsupported state') || msg.includes('auth tag') || msg.includes('authenticate data') || msg.includes('decipher') || msg.includes('gcm')) {
        return { ok: false, error: '비밀번호가 올바르지 않습니다' };
      }
      log.error('[Keys] Import failed:', e.message);
      return { ok: false, error: '가져오기 실패: ' + e.message };
    }
  });
}

module.exports = {
  readEncryptedKeys,
  writeEncryptedKeys,
  ALLOWED_API_KEYS,
  KEY_FILE,
  SESSION_FILE,
  registerKeyIPC,
};
