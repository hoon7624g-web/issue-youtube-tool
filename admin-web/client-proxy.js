// ═══════════════════════════════════════════════════════════
// client-proxy.js — admin-web 전용
// 이 파일은 admin-web에서만 사용됩니다.
// 수강생 앱은 src/client-proxy-*.js를 사용합니다.
// v3.5.5 — 레거시 수강생 앱 코드 제거, admin 전용만 유지
// ═══════════════════════════════════════════════════════════

var PROXY_BASE = 'https://wotseowsskgobnusiacg.supabase.co/functions/v1/proxy';

// ── 세션 관리 (index.html의 typeof 체크용 fallback) ──
// index.html에 본 정의가 있으므로, 여기는 스크립트 로드 순서 안전망
function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem('yt_admin_session') || 'null');
  } catch (e) {
    return null;
  }
}
function setSession(s) {
  sessionStorage.setItem('yt_admin_session', JSON.stringify(s));
}
function clearSession() {
  sessionStorage.removeItem('yt_admin_session');
}
function getToken() {
  return sessionStorage.getItem('yt_admin_token') || '';
}
function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('yt_admin_user') || 'null');
  } catch (e) {
    return null;
  }
}

// ── proxyFetch (index.html fallback) ──
function proxyFetch(endpoint, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  return fetch(PROXY_BASE + endpoint, options);
}
