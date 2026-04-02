// ═══════════════════════════════════════
// state.js — v3.6.0 상태 관리 (ES Module)
// ═══════════════════════════════════════
import { $, confirmModal } from './utils.js';
import { K } from './constants.js';

export const NS_DEFAULTS = {
  nav: { step: 1, mx: 1 },
  auth: { user: null },
  search: { skw: [], vids: [], filterDuration: 'long', filterPeriod: '7d' },
  video: { sv: null, transcript: '' },
  analysis: { ana: null },
  script: { sty: 's1', scr: null, scrDual: null, es: '', scriptHistory: [], fcs: [], factCheckedBy: null, selectedScripts: [], results: [], currentProcessingIdx: 0 },
  footage: { ekw: [] },
  voice: { selVoice: 'vc4', voiceSpeed: 1.0, vdone: false, voiceResult: null, elVoiceId: null }
};

export const STEP_NS = {
  2: ['search'], 3: ['search', 'video'], 4: ['video'],
  5: ['analysis'], 6: ['script'], 7: ['script'],
  8: ['footage'], 9: ['voice']
};

export const S = JSON.parse(JSON.stringify(NS_DEFAULTS));

function _cloneDefaults(ns) { return JSON.parse(JSON.stringify(NS_DEFAULTS[ns])); }

const _cb = {};
export function sOn(k, f) { if (!_cb[k]) _cb[k] = []; _cb[k].push(f); }

export function sSet(u) {
  for (const k in u) {
    const p = k.split('.');
    if (p.length === 2 && S[p[0]] && p[1] in NS_DEFAULTS[p[0]]) {
      S[p[0]][p[1]] = u[k];
    } else {
      // P2-16: strict mode — 유효하지 않은 키는 dev에서 throw, prod에서 warn
      const msg = '[sSet] invalid key: "' + k + '" — check NS_DEFAULTS for valid keys';
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        throw new Error(msg);
      } else if (typeof console !== 'undefined') {
        console.warn(msg);
      }
    }
  }
  for (const k in u) {
    if (_cb[k]) _cb[k].forEach(f => { const p = k.split('.'); f(S[p[0]][p[1]]); });
  }
  // ★ P1-10: wildcard listener를 rAF로 디바운싱 (스트리밍 중 수백 번 직렬화 방지)
  _scheduleWildcard();
  _saveLs();
}

let _wildcardPending = false;
function _scheduleWildcard() {
  if (!_cb['*'] || _wildcardPending) return;
  _wildcardPending = true;
  // ★ v3.5.8: rAF → setTimeout(0)
  // rAF는 백그라운드 탭에서 실행이 10초 이상 지연되어 스트리밍 UI가 멈출 수 있음.
  // setTimeout(0)은 백그라운드에서도 ~1초 간격으로 실행되므로 체감 멈춤 방지.
  // 디바운싱 효과는 _wildcardPending 플래그로 유지됨.
  setTimeout(() => {
    _wildcardPending = false;
    if (_cb['*']) _cb['*'].forEach(f => { f(S); });
  }, 0);
}

// 3-2: debounce 적용 — 고빈도 sSet에서 불필요한 I/O 방지
let _saveLsTimer = null;
let _saveBlocked = false;
let _savePending = false;
export function setSaveBlocked(blocked) {
  _saveBlocked = !!blocked;
  if (!_saveBlocked && _savePending) {
    _savePending = false;
    _saveLs();
  }
}
function _saveLs() {
  if (_saveBlocked) {
    _savePending = true;
    return;
  }
  if (_saveLsTimer) clearTimeout(_saveLsTimer);
  _saveLsTimer = setTimeout(_saveLsNow, 300);
}
function _saveLsFlush() { if (_saveLsTimer) { clearTimeout(_saveLsTimer); _saveLsTimer = null; } _saveLsNow(); }
function _saveLsNow() {
  _saveLsTimer = null;
  _savePending = false;
  try {
    localStorage.setItem('yt_a_progress', JSON.stringify({
      _v: '3.6', nav: S.nav,
      search: { skw: S.search.skw, filterDuration: S.search.filterDuration, filterPeriod: S.search.filterPeriod }, video: { sv: S.video.sv },
      analysis: { ana: S.analysis.ana },
      script: { sty: S.script.sty, scr: S.script.scr, scrDual: S.script.scrDual, es: S.script.es },
      voice: { selVoice: S.voice.selVoice }
    }));
  } catch(e) { console.warn('[LS] save failed:', e.message); }
}

export async function sGo(n) {
  n = parseInt(n); if (isNaN(n) || n < 1 || n > S.nav.mx) return;
  if (n === S.nav.step) return;
  if (n < S.nav.step) {
    const ok = await confirmModal('이전 단계로 돌아가면 이후 작업(대본, 팩트체크 등)이 초기화됩니다.\n계속하시겠습니까?', { confirmText: '돌아가기', cancelText: '취소', danger: true });
    if (!ok) return;
    const resetted = {};
    for (let s = n + 1; s <= S.nav.step; s++) {
      (STEP_NS[s] || []).forEach(ns => {
        if (!resetted[ns]) { Object.assign(S[ns], _cloneDefaults(ns)); resetted[ns] = true; }
      });
    }
    if (n <= 2) { const p2 = $('p2'); if (p2) p2.removeAttribute('data-ok'); }
    S.nav.step = n; S.nav.mx = n;
    if (_cb[K.NAV_STEP]) _cb[K.NAV_STEP].forEach(f => { f(n); });
    if (_cb['*']) _cb['*'].forEach(f => { f(S, {}); });
    _saveLsFlush();
  } else {
    sSet({ [K.NAV_STEP]: n });
  }
}

export function sNext() { const n = S.nav.step + 1; sSet({ [K.NAV_STEP]: n, [K.NAV_MX]: Math.max(S.nav.mx, n) }); }
export function sPrev() { if (S.nav.step > 2) sGo(S.nav.step - 1); }

// ── 안전 복원 상한: fcs/ekw/voiceResult/scrDual은 저장되지 않으므로 Step 6까지만 ──
const MAX_SAFE_RESTORE_STEP = 6;

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('yt_a_progress'));
    if (!saved) return false;
    if (saved._v && saved._v.startsWith('3.') && saved.nav && saved.nav.step > 1 && saved.video && saved.video.sv) {
      ['nav','search','video','analysis','script','voice'].forEach(ns => {
        if (saved[ns]) Object.assign(S[ns], saved[ns]);
      });
      S.voice.vdone = false; S.voice.voiceResult = null;

      // 저장 범위를 넘는 단계는 안전 상한으로 제한
      const originalStep = S.nav.step;
      if (S.nav.step > MAX_SAFE_RESTORE_STEP) {
        S.nav.step = MAX_SAFE_RESTORE_STEP;
        S.nav.mx = MAX_SAFE_RESTORE_STEP;
      }
      if (S.nav.mx > MAX_SAFE_RESTORE_STEP) {
        S.nav.mx = MAX_SAFE_RESTORE_STEP;
      }
      // P2-14: 대본 복원 누락 상태 감지
      const hasLongform = !!(S.script.scr && typeof S.script.scr.content === 'string' && S.script.scr.content.length);
      const hasDualLongform = !!(S.script.scrDual && S.script.scrDual.longform && typeof S.script.scrDual.longform.content === 'string' && S.script.scrDual.longform.content.length);
      const needsRerun = (S.nav.step >= 6 && !hasLongform && !hasDualLongform);
      return { restored: true, capped: originalStep > MAX_SAFE_RESTORE_STEP, originalStep: originalStep, needsRerun: needsRerun };
    }
    // v3 이전 레거시 포맷은 더 이상 지원하지 않음 (v3.5.5~)
  } catch(e) {}
  return false;
}

export function sResetAll(keepAuth) {
  // ★ P0-6: 음성 생성 blob URL 일괄 해제 (메모리 누수 방지)
  try {
    (S.script.results || []).forEach(r => {
      if (r && r.voiceResult && r.voiceResult.url) {
        try { URL.revokeObjectURL(r.voiceResult.url); } catch(e) {}
      }
    });
  } catch(e) {}
  Object.keys(NS_DEFAULTS).forEach(ns => {
    if (keepAuth && ns === 'auth') return;
    Object.assign(S[ns], _cloneDefaults(ns));
  });
}

// sK/sK2/sK3 헬퍼는 v3.5.5에서 제거됨. sSet({[K.A]: val}) 직접 사용.


