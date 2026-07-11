// ═══════════════════════════════════════
// router.js — 스텝 라우터 + 액션 레지스트리
// window.lsN / window.showP 등 전역 함수를 모듈 기반으로 전환
// ═══════════════════════════════════════

// ── 스텝 라우터: window['ls' + n]() 대체 ──
const _steps = {};
export function registerStep(n, fn) { _steps[n] = fn; }
export function runStep(n) { if (_steps[n]) _steps[n](); }

// ── 액션 레지스트리: 크로스 모듈 콜백 대체 ──
const _actions = {};
export function registerAction(name, fn) { _actions[name] = fn; }
export function runAction(name, ...args) { if (_actions[name]) return _actions[name](...args); }
