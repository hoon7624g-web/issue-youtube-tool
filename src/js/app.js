// ═══════════════════════════════════════
// app.js — 앱 초기화 (Vite entry point)
// ═══════════════════════════════════════
import '../css/main.css';
import { $, toast } from './utils.js';
import { sOn, sNext, sPrev, S } from './state.js';
import { K } from './constants.js';
import { Api } from './api.js';
import { initApiKeys, initSession, patchApi, setupVoiceHandlers } from '../client-proxy.js';
import { fetchServerConfig } from '../config.js';
import { buildSb, syncSb, showP, buildPanels, newProject, doLogout } from './ui.js';
import { registerAction } from './router.js';

// pipeline 모듈 로드 (side-effect: 각 모듈이 registerStep으로 스텝 등록)
import './pipeline/apikeys.js';
import './pipeline/step2-keywords.js';
import './pipeline/step3-4-videos.js';
import './pipeline/step5-analysis.js';
import './pipeline/step6-script.js';
import './pipeline/step7-factcheck.js';
import './pipeline/step8-footage.js';
import './pipeline/step9-voice.js';
import './pipeline/step10-result.js';
import './pipeline/history.js';
import { trackStep } from './telemetry.js';
import { isSessionOnlyMode } from './pipeline/apikeys-form.js';

// ── 네트워크 상태 감지 + 배너 ──
function _toggleOfflineBanner(offline) {
  let banner = document.getElementById('offlineBanner');
  if (offline && !banner) {
    banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText =
      'position:fixed;top:60px;left:0;right:0;z-index:9999;background:#c92a2a;color:#fff;text-align:center;padding:8px;font-size:13px;font-weight:500';
    banner.textContent = '⚠ 오프라인 모드 — 인터넷 연결이 끊겼습니다';
    document.body.prepend(banner);
  } else if (!offline && banner) {
    banner.remove();
  }
}
window.addEventListener('offline', () => {
  _toggleOfflineBanner(true);
  toast('인터넷 연결이 끊겼습니다', 'err');
});
window.addEventListener('online', () => {
  _toggleOfflineBanner(false);
  toast('인터넷이 다시 연결되었습니다');
});
if (!navigator.onLine) _toggleOfflineBanner(true);

// ── 크로스 모듈 액션 등록 ──
registerAction('showP', () => showP());
registerAction('newProject', () => newProject());
registerAction('doLogout', () => doLogout());

// ── 테마 초기화 (즉시) ──
(() => {
  const saved = localStorage.getItem('yt_theme');
  if (
    saved === 'dark' ||
    (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches)
  ) {
    document.documentElement.setAttribute('data-theme', 'dark');
    setTimeout(() => {
      const btn = $('themeToggle');
      if (btn) btn.classList.add('on');
    }, 0);
  }
})();

// ── 앱 부트 ──
function boot() {
  patchApi(Api);
  setupVoiceHandlers();
  buildSb();
  buildPanels();
  sOn(K.NAV_STEP, () => {
    syncSb();
    showP();
    trackStep(S.nav.step, 'enter');
  });
  sOn(K.NAV_MX, syncSb);
  syncSb();
  showP();
}

// ── P0-4: 공용 PC 모드 — 앱 종료 시 모든 사용 흔적 삭제 ──
window.addEventListener('beforeunload', () => {
  if (isSessionOnlyMode()) {
    // API 키 삭제 (Electron safeStorage + localStorage)
    if (window.electronAPI && window.electronAPI.clearApiKeys) {
      window.electronAPI.clearApiKeys();
    }
    // 세션 토큰 삭제
    if (window.electronAPI && window.electronAPI.clearSession) {
      window.electronAPI.clearSession();
    }
    // localStorage 내 모든 앱 데이터 삭제
    try {
      localStorage.removeItem('yt_api_keys');
      localStorage.removeItem('yt_session');
      localStorage.removeItem('yt_a_progress');
      localStorage.removeItem('yt_project_history');
      localStorage.removeItem('yt_a_kw');
      localStorage.removeItem('yt_a_sty');
      // 테마 설정은 개인정보가 아니므로 유지
    } catch (e) {}
    // Blob URL 메모리 정리
    if (S.voice.voiceResult && S.voice.voiceResult.url)
      try {
        URL.revokeObjectURL(S.voice.voiceResult.url);
      } catch (e) {}
    if (S.script.results)
      S.script.results.forEach((r) => {
        if (r && r.voiceResult && r.voiceResult.url)
          try {
            URL.revokeObjectURL(r.voiceResult.url);
          } catch (e) {}
      });
  }
});

// ── 키보드 단축키 ──
document.addEventListener('keydown', (e) => {
  // 입력 필드에서는 무시
  if (
    e.target.tagName === 'INPUT' ||
    e.target.tagName === 'TEXTAREA' ||
    e.target.tagName === 'SELECT'
  )
    return;
  if (e.ctrlKey && e.key === 'ArrowRight') {
    e.preventDefault();
    if (S.nav.step < S.nav.mx) sNext();
  }
  if (e.ctrlKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    sPrev();
  }
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    // 현재 step의 실행 버튼 클릭
    const btn =
      document.querySelector('.pnl.on .btn.bp.btn-lg:not(:disabled)') ||
      document.querySelector('.pnl.on .btn.bp:not(:disabled)');
    if (btn) btn.click();
  }
});

// safeStorage에서 API 키 + 세션 캐시 로드 후 UI 시작
Promise.all([initApiKeys(), initSession()])
  .then(() => {
    // P2-19: 서버에서 최신 모델명 가져오기 (실패해도 부팅 차단하지 않음)
    fetchServerConfig().catch(() => {});
    boot();
  })
  .catch((e) => {
    console.error('[Init] failed:', e);
    boot();
  });
