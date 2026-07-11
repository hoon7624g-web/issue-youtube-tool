// ═══════════════════════════════════════════════════════════
// client-proxy-auth.js — 인증, 세션, API 키, 쓰로틀링
// v3.6.0 — client-proxy.js에서 분리
// ═══════════════════════════════════════════════════════════
import { toast, isOnline } from './js/utils.js';
import { runAction } from './js/router.js';
import { CONFIG } from './config.js';

// ── 설정값 re-export ──
// ★ P1-fix: snapshot const → runtime getter 전환 (fetchServerConfig() 이후에도 최신값 반환)
// 정적 값 (런타임에 절대 안 바뀜) — const 유지
export const PROXY_BASE = CONFIG.PROXY_BASE;
export const TTS_CHUNK_SIZE = CONFIG.TTS_CHUNK_SIZE;
export const TTS_CHUNK_MIN_BREAK = CONFIG.TTS_CHUNK_MIN_BREAK;

// 동적 값 (서버에서 갱신 가능) — getter 함수로 전환
// 하위 호환: 기존 코드가 const로 import했다면 함수 호출로 변경 필요
// 단, 현재 외부 소비자 없음 (모두 CONFIG.xxx 직접 참조 중)
export function getDefaultGeminiModel() { return CONFIG.DEFAULT_GEMINI_MODEL; }
export function getDefaultClaudeModel() { return CONFIG.DEFAULT_CLAUDE_MODEL; }
export function getDefaultOpenAIModel() { return CONFIG.DEFAULT_OPENAI_MODEL; }
export function getMaxPromptChars() { return CONFIG.MAX_PROMPT_CHARS; }
export function getMaxPromptCharsPro() { return CONFIG.MAX_PROMPT_CHARS_PRO; }
export function getMaxOutputTokens() { return CONFIG.MAX_OUTPUT_TOKENS; }
export function getMaxOutputTokensShort() { return CONFIG.MAX_OUTPUT_TOKENS_SHORT; }

// ★ CONFIG 자체도 re-export — 소비자가 직접 참조할 수 있도록
export { CONFIG } from './config.js';

// ── 토큰 갱신 인터벌 (로그아웃 시 정리용) ──
let _refreshIntervalId = null;

// ── fetch timeout / abort 헬퍼 ──
const FETCH_TIMEOUT = {
  PROXY: 20000,
  AUTH: 15000,
  REFRESH: 15000,
  KEY_TEST: 10000,
};

function _isAbortError(e) {
  return !!(e && (e.name === 'AbortError' || /abort/i.test(String(e.message || ''))));
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT.PROXY, externalSignal) {
  const controller = new AbortController();
  const signal = externalSignal || options.signal;
  let timedOut = false;
  let timer = null;
  let removeAbort = () => {};

  const onAbort = () => {
    try { controller.abort(signal && signal.reason ? signal.reason : new Error('aborted')); } catch (_) {}
  };

  if (signal) {
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => {
        try { signal.removeEventListener('abort', onAbort); } catch (_) {}
      };
    }
  }

  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      try { controller.abort(new Error('timeout')); } catch (_) {}
    }, timeoutMs);
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new Error('요청 시간 초과');
    if (_isAbortError(e) && signal && signal.aborted) throw new Error('사용자가 작업을 취소했습니다.');
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    removeAbort();
  }
}


// ── 클라이언트 쓰로틀링 ──
// ★ Fix #10: sessionStorage 기반 — 페이지 새로고침 시에도 throttle 카운터 유지
// sessionStorage는 탭 단위로 유지되고 탭 닫으면 자동 삭제 (앱 재시작 시 리셋)
const _THROTTLE_STORAGE_KEY = 'yt_api_throttle';
function _loadThrottleCalls() {
  try {
    const raw = sessionStorage.getItem(_THROTTLE_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr.filter(t => typeof t === 'number' && now - t < CONFIG.API_RATE_WINDOW);
  } catch (_) { return []; }
}
function _saveThrottleCalls(calls) {
  try { sessionStorage.setItem(_THROTTLE_STORAGE_KEY, JSON.stringify(calls)); } catch (_) {}
}
let _apiCalls = _loadThrottleCalls();
export function checkThrottle() {
  const now = Date.now();
  _apiCalls = _apiCalls.filter(t => { return now - t < CONFIG.API_RATE_WINDOW; });
  if (_apiCalls.length >= CONFIG.API_RATE_LIMIT) {
    const waitSec = Math.ceil((CONFIG.API_RATE_WINDOW - (now - _apiCalls[0])) / 1000);
    throw new Error('API 호출 한도 초과 (분당 ' + CONFIG.API_RATE_LIMIT + '회). ' + waitSec + '초 후 다시 시도해주세요.');
  }
  _apiCalls.push(now);
  _saveThrottleCalls(_apiCalls); // ★ Fix #10: 새로고침 후에도 유지
}

// ── 세션 관리 (safeStorage 암호화 + 메모리 캐시) ──
let _sessionCache = null;

export function initSession() {
  if (window.electronAPI && window.electronAPI.getSession) {
    return window.electronAPI.getSession().then(async (s) => {
      if (s && s.access_token) { _sessionCache = s; _startRefreshInterval(); return s; }
      // 레거시 마이그레이션 (localStorage → safeStorage)
      try {
        const legacy = JSON.parse(localStorage.getItem('yt_session'));
        if (legacy && legacy.access_token) {
          _sessionCache = legacy;
          // ★ P2-fix: await 후 성공 시에만 레거시 삭제 (마이그레이션 실패 시 데이터 유실 방지)
          try {
            const ok = await window.electronAPI.setSession(legacy);
            if (ok) localStorage.removeItem('yt_session');
          } catch (_) { /* safeStorage 실패 — 레거시 유지 */ }
          _startRefreshInterval();
          return legacy;
        }
      } catch(e) {}
      return null;
    }).catch(() => { return null; });
  }
  // 웹 환경
  try { const s = JSON.parse(localStorage.getItem('yt_session')); if (s && s.access_token) { _sessionCache = s; _startRefreshInterval(); return Promise.resolve(s); } } catch(e) {}
  return Promise.resolve(null);
}

export function getSession() { return _sessionCache; }

// ★ v3.6.2 P2-2: setSession 실패 알림 콜백 (UI에서 토스트 표시용)
let _onSessionStorageFail = null;
export function onSessionStorageFail(cb) { _onSessionStorageFail = cb; }

export function setSession(s) {
  _sessionCache = s;
  if (window.electronAPI && window.electronAPI.setSession) {
    // ★ v3.6.2 P2-2: Electron에서는 fail-closed (localStorage fallback 제거)
    // safeStorage 불가 시 세션은 메모리에만 보관되고 앱 재시작 시 재로그인 필요.
    // 이 정책은 fail-closed 원칙(safeStorage 불가 시 저장 차단)과 일치한다.
    window.electronAPI.setSession(s).then(ok => {
      if (!ok) {
        console.warn('[Session] safeStorage 저장 실패 — 메모리 전용 모드 (앱 종료 시 재로그인 필요)');
        if (_onSessionStorageFail) _onSessionStorageFail();
      }
    }).catch((e) => {
      console.warn('[Session] IPC 저장 실패:', e && e.message);
      if (_onSessionStorageFail) _onSessionStorageFail();
    });
  } else {
    // 웹 환경 (개발/테스트 전용 — localStorage 평문 저장)
    try { localStorage.setItem('yt_session', JSON.stringify(s)); } catch(e) {}
  }
}

export function clearSession() {
  _sessionCache = null;
  if (window.electronAPI && window.electronAPI.clearSession) {
    window.electronAPI.clearSession();
  }
  // 레거시 yt_session 키 정리 (마이그레이션 잔재 + 웹 환경)
  try { localStorage.removeItem('yt_session'); } catch(e) {}
}

export function getToken() { const s = getSession(); return s ? s.access_token : ''; }
export function getUser() { const s = getSession(); return s ? s.user : null; }

// ── API 키 관리 (safeStorage 암호화 + 메모리 캐시) ──
// ★ v3.6.2 P0-1: Electron에서는 비밀 키 문자열이 _keyCache에 절대 들어가지 않는다.
//   - Electron: _keyCache = { youtube: true, claude: true, llmProvider: 'claude', ... }
//   - 웹(개발): _keyCache = { youtube: 'AIza...', claude: 'sk-ant-...', ... } (기존 동작)
let _keyCache = null;
let _keyCacheReady = false;

// ★ v3.6.2 P0-1: 환경 분기 — 렌더러 키 보유 여부 판정에 사용
function _isElectronStrict() {
  return !!(window.electronAPI && window.electronAPI.getApiKeyStatus);
}

export function initApiKeys() {
  if (_isElectronStrict()) {
    // Electron: 비밀 키 문자열 미수신 — 상태(bool)만 받는다
    return window.electronAPI.getApiKeyStatus().then(status => {
      const hasAny = status && Object.keys(status).some(k => status[k] === true);
      if (hasAny) {
        _keyCache = status;
        _keyCacheReady = true;
        return status;
      }
      // 레거시 마이그레이션 (localStorage → safeStorage)
      try {
        const legacy = JSON.parse(localStorage.getItem('yt_api_keys'));
        if (legacy && Object.keys(legacy).length > 0) {
          return window.electronAPI.migrateApiKeys(legacy).then(ok => {
            if (ok) {
              localStorage.removeItem('yt_api_keys');
              return window.electronAPI.getApiKeyStatus().then(s => {
                _keyCache = s || status || {};
                _keyCacheReady = true;
                return _keyCache;
              }).catch(() => {
                _keyCache = status || {};
                _keyCacheReady = true;
                return _keyCache;
              });
            }
            _keyCache = status || {};
            _keyCacheReady = true;
            return _keyCache;
          });
        }
      } catch(e) {}
      _keyCache = status || {};
      _keyCacheReady = true;
      return _keyCache;
    }).catch(() => { _keyCacheReady = true; _keyCache = {}; return {}; });
  }
  // 웹 환경 (개발/테스트 전용 — 평문 키 보관)
  try { const k = JSON.parse(localStorage.getItem('yt_api_keys')); if (k) { _keyCache = k; } } catch(e) {}
  _keyCacheReady = true;
  return Promise.resolve(_keyCache || {});
}

export function getApiKeys() {
  if (!_keyCacheReady && !_isElectronStrict()) {
    try { const k = JSON.parse(localStorage.getItem('yt_api_keys')); if (k) _keyCache = k; } catch(e) {}
  }
  return _keyCache || {};
}

// ★ v3.6.2 P0-1: 저장된 키가 있는지 환경 무관하게 판정
//   Electron: keys[k] === true
//   웹:       typeof keys[k] === 'string' && keys[k].trim()
export function isKeySaved(keyName) {
  const k = getApiKeys();
  const v = k[keyName];
  return v === true || (typeof v === 'string' && !!v.trim());
}

// ★ P1-fix: import 후 렌더러 캐시 강제 재로드
export async function reloadApiKeys() {
  _keyCache = null;
  _keyCacheReady = false;
  return await initApiKeys();
}

// ★ v3.6.2 P0-1: setApiKeys는 변경된 필드만 보내면 된다 (main이 merge)
//   Electron: 빈 필드는 미전송 → main이 기존 값 유지
//   웹:        전체 객체를 localStorage에 그대로 저장
export function setApiKeys(keys) {
  if (_isElectronStrict()) {
    return window.electronAPI.setApiKeys(keys).then(ok => {
      if (!ok) {
        console.warn('[Keys] safeStorage 저장 실패 — 저장 중단');
        return { ok: false, method: 'safeStorage_unavailable', error: 'OS 보안 저장소를 사용할 수 없어 API 키를 저장할 수 없습니다.' };
      }
      // ★ 저장 후 캐시는 status snapshot으로 재로드 (평문 보관 금지)
      return window.electronAPI.getApiKeyStatus().then(status => {
        _keyCache = status || {};
        _keyCacheReady = true;
        return { ok: true, method: 'safeStorage' };
      }).catch(() => ({ ok: true, method: 'safeStorage' }));
    }).catch(e => {
      console.warn('[Keys] IPC 저장 실패:', e && e.message);
      return { ok: false, method: 'ipc_error', error: 'API 키 저장 중 오류가 발생했습니다. 앱을 다시 실행해주세요.' };
    });
  }
  _keyCache = keys;
  try { localStorage.setItem('yt_api_keys', JSON.stringify(keys)); } catch(e) {}
  return Promise.resolve({ ok: true, method: 'localStorage' });
}

export function hasApiKeys() {
  const hasLlm = isKeySaved('claude') || isKeySaved('gemini') || isKeySaved('openai');
  return isKeySaved('youtube') && hasLlm;
}

export function cfg() {
  const k = getApiKeys();
  return { hasEl: !!k.elevenlabs, hasPx: !!k.pexels, hasPp: !!k.perplexity };
}

export function hasKey(k) {
  const keys = getApiKeys();
  if (k === 'llm') return !!(keys.claude || keys.gemini || keys.openai);
  if (k === 'yt') return !!keys.youtube;
  if (k === 'tts') return !!keys.tts;
  if (k === 'pexels') return !!keys.pexels;
  return false;
}

export function hasYtKey() { return !!getApiKeys().youtube; }

// ── proxyFetch ──
export async function proxyFetch(endpoint, options) {
  if (!isOnline()) throw new Error('인터넷 연결을 확인해주세요');
  options = options || {};
  options.headers = options.headers || {};
  const token = getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  // 3-6: Electron/dev 식별 헤더 (null origin 검증용)
  options.headers['X-App-Client'] = (window.electronAPI && window.electronAPI.isElectron) ? 'electron' : 'dev';
  const r = await fetchWithTimeout(PROXY_BASE + endpoint, options, FETCH_TIMEOUT.PROXY, options.signal);
  if (r.status === 401) {
    const isAuthEndpoint = endpoint === '/api/me' || endpoint.indexOf('/auth/') === 0;
    if (!isAuthEndpoint) {
      const ok = await refreshToken();
      if (ok) {
        options.headers['Authorization'] = 'Bearer ' + getToken();
        return fetchWithTimeout(PROXY_BASE + endpoint, options, FETCH_TIMEOUT.PROXY, options.signal);
      }
    }
    clearSession(); toast('세션이 만료되었습니다. 다시 로그인해주세요.', 'err');
    runAction('doLogout');
    throw new Error('AUTH_REQUIRED');
  }
  if (r.status === 403) {
    // ★ v3.5.8: 프록시/WAF가 HTML 에러 페이지를 반환할 수 있으므로 JSON 파싱 보호
    let d = {};
    try {
      d = await r.clone().json();
    } catch (_) {
      const text = await r.text().catch(() => '');
      d = { error: text.substring(0, 200) || 'Forbidden' };
    }
    if (d.code === 'APPROVAL_PENDING') { toast('관리자 승인 대기 중입니다.', 'err'); throw new Error('APPROVAL_PENDING'); }
    throw new Error(d.error || 'Forbidden');
  }
  return r;
}

// ── 토큰 갱신 ──
let _refreshing = null;
async function _doRefresh() {
  const sess = getSession();
  if (!sess || !sess.refresh_token) return false;
  try {
    const r = await fetchWithTimeout(PROXY_BASE + '/auth/refresh', {
      method: 'POST', headers: _authHeaders(),
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    }, FETCH_TIMEOUT.REFRESH);
    const d = await r.json();
    if (r.status === 200 && d.access_token) {
      setSession({ access_token: d.access_token, refresh_token: d.refresh_token || sess.refresh_token, user: sess.user });
      return true;
    }
    return false;
  } catch (_) { return false; }
}
function refreshToken() {
  if (_refreshing) return _refreshing;
  _refreshing = _doRefresh().finally(() => { _refreshing = null; });
  return _refreshing;
}
export function clearRefreshInterval() {
  if (_refreshIntervalId) { clearInterval(_refreshIntervalId); _refreshIntervalId = null; }
}

function _startRefreshInterval() {
  clearRefreshInterval();
  _refreshIntervalId = setInterval(() => { if (getToken()) refreshToken(); }, 45 * 60 * 1000);
}

// ── 공통 헤더 (3-6: null origin 검증용) ──
function _authHeaders() {
  return { 'Content-Type': 'application/json', 'X-App-Client': (window.electronAPI && window.electronAPI.isElectron) ? 'electron' : 'dev' };
}

// ── 로그인 / 회원가입 ──
export async function authLogin(email, password) {
  const r = await fetchWithTimeout(PROXY_BASE + '/auth/login', {
    method: 'POST', headers: _authHeaders(),
    body: JSON.stringify({ email, password })
  }, FETCH_TIMEOUT.AUTH);
  const d = await r.json();
  if (r.status !== 200) throw new Error(d.error || '로그인 실패');
  if (d.user && d.user.approval_status !== '승인완료') throw new Error('관리자 승인 대기 중입니다.');
  setSession({ access_token: d.access_token, refresh_token: d.refresh_token, user: d.user });
  _startRefreshInterval();
  return d.user;
}

export async function authSignup(email, password, name, phone, cohort) {
  const r = await fetchWithTimeout(PROXY_BASE + '/auth/signup', {
    method: 'POST', headers: _authHeaders(),
    body: JSON.stringify({ email, password, name, phone, cohort })
  }, FETCH_TIMEOUT.AUTH);
  const d = await r.json();
  if (r.status !== 200) throw new Error(d.error || '회원가입 실패');
  return d;
}
