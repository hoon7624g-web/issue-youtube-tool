// ═══════════════════════════════════════════════════
// admin-utils.js — 유튜브도사 Admin 공유 유틸리티
// 의존: PROXY_BASE (client-proxy.js), adminFetch (호스트 정의)
// ═══════════════════════════════════════════════════

// ── 전역 액션 레지스트리 (이벤트 위임) ──
var ACTIONS = {};

// ── DOM ──
function $(id) { return document.getElementById(id); }
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
// DOM 헬퍼 (innerHTML 대체용 — 강화 버전)
function _el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    if (attrs.className) node.className = attrs.className;
    if (attrs.style) node.style.cssText = attrs.style;
    if (attrs.textContent !== undefined) node.textContent = attrs.textContent;
    if (attrs.id) node.id = attrs.id;
    if (attrs.value !== undefined) node.value = attrs.value;
    if (attrs.type) node.type = attrs.type;
    if (attrs.placeholder) node.placeholder = attrs.placeholder;
    if (attrs.disabled) node.disabled = true;
    if (attrs.checked) node.checked = true;
    if (attrs.selected) node.selected = true;
    if (attrs.htmlFor) node.htmlFor = attrs.htmlFor;
    if (attrs.colSpan) node.colSpan = attrs.colSpan;
    if (attrs.href) node.href = attrs.href;
    if (attrs.target) node.target = attrs.target;
    if (attrs.rel) node.rel = attrs.rel;
    if (attrs.dataset) { for (var k in attrs.dataset) node.dataset[k] = attrs.dataset[k]; }
  }
  if (children) {
    children.forEach(function(c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  }
  return node;
}

// ── 토스트 ──
function toast(m, t) {
  var w = $('tw');
  var d = document.createElement('div');
  d.className = 'tst tst-' + (t || 'ok');
  var icon = document.createElement('span');
  icon.className = 'tst-i';
  icon.textContent = t === 'err' ? '✕' : '✓';
  d.appendChild(icon);
  d.appendChild(document.createTextNode(esc(m)));
  w.appendChild(d);
  setTimeout(function() { d.remove(); }, 3500);
}

// ── 모달 (DOM 안전 빌더) ──
function oM(h) {
  var md = $('md');
  if (typeof h === 'string') {
    // ★ 레거시 HTML 문자열 → 안전한 DOM 변환 (DOMParser 사용)
    md.textContent = '';
    var parser = new DOMParser();
    var doc = parser.parseFromString('<div>' + h + '</div>', 'text/html');
    var nodes = doc.body.firstChild.childNodes;
    while (nodes.length) md.appendChild(document.adoptNode(nodes[0]));
  } else if (h && h.nodeType) {
    md.textContent = '';
    md.appendChild(h);
  }
  $('mo').classList.add('open');
  _bindModalActions();
}
function cM() { $('mo').classList.remove('open'); }

// ── confirm() 대체 (모달 기반) ──
function confirmAdmin(message, onConfirm) {
  var wrap = _el('div', { style: 'padding:24px;text-align:center' });
  var icon = _el('div', { style: 'font-size:32px;margin-bottom:12px', textContent: '\u26A0\uFE0F' });
  wrap.appendChild(icon);
  var msg = _el('div', { style: 'font-size:14px;color:var(--t1);line-height:1.7;margin-bottom:20px;white-space:pre-line' });
  msg.textContent = message;
  wrap.appendChild(msg);
  var btnRow = _el('div', { style: 'display:flex;gap:10px;justify-content:center' });
  var cancelBtn = _el('button', { className: 'btn btn-o', style: 'padding:8px 20px', textContent: '취소' });
  cancelBtn.dataset.action = 'close-modal';
  var confirmBtn = _el('button', { className: 'btn btn-p', style: 'padding:8px 20px;background:var(--red);color:#fff;border:none', textContent: '확인' });
  confirmBtn.addEventListener('click', function() { cM(); onConfirm(); });
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  wrap.appendChild(btnRow);
  oM(wrap);
}

// ── 데이터 & localStorage ──
var SK = 'yt_a_';
function ld(k, fb) {
  try { var d = localStorage.getItem(SK + k); return d ? JSON.parse(d) : fb; }
  catch (e) { return fb; }
}
function sv(k, d) { localStorage.setItem(SK + k, JSON.stringify(d)); }
function gid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5); }

var D = {
  sty: ld('sty', [
    { id: 's1', name: '충격 이슈형', desc: '빠른 전개, 강한 훅, 커뮤니티 말투', prompt: '- 첫 문장은 반드시 충격적인 한 줄로 시작 (예: "이거 실화냐", "방금 터졌습니다")\n- 문장은 5~10자로 극단적으로 짧게 끊기\n- "ㄷㄷ", "레전드", "실화냐", "역대급" 같은 커뮤니티 표현 적극 사용\n- 말투: ~했다고 합니다, ~인 거죠, ~라고 하네요\n- 감탄사 많이: 와, 헐, 대박, 미쳤다\n- 중간에 "근데 여기서 반전" 같은 전환 장치 넣기\n- 마지막에 "이거 어떻게 생각하세요? 댓글로 알려주세요" 같은 참여 유도', on: true },
    { id: 's2', name: '정보 요약형', desc: '팩트 중심, 깔끔한 정리, 뉴스 톤', prompt: '- 첫 문장은 핵심 팩트 한 줄 요약으로 시작 (예: "OO가 OO했습니다")\n- 감정 표현 최소화, 사실 위주로 전달\n- 말투: ~입니다, ~했습니다 (뉴스 앵커 톤)\n- 숫자/날짜/이름 등 구체적 정보 강조\n- 구조: 팩트 → 배경 → 의미 → 전망\n- 불필요한 수식어 제거, 간결하게\n- 마지막에 "더 자세한 내용은 팔로우하고 확인하세요" 같은 CTA', on: true },
    { id: 's3', name: '스토리텔링형', desc: '이야기식 전개, 궁금증 유발, 반전 구조', prompt: '- 첫 문장은 궁금증을 유발하는 질문이나 상황 묘사로 시작 (예: "만약 이런 일이 당신에게 일어났다면?")\n- 이야기하듯 편안한 구어체 사용\n- 말투: ~했거든요, ~인데요, ~잖아요\n- 시간순으로 이야기 전개\n- 중간에 "근데 여기서 문제가 생겼어요" 같은 서스펜스\n- 감정 이입 유도: "이 사람 입장에서 생각해보세요"\n- 마지막에 반전이나 교훈으로 마무리\n- "이 이야기가 도움이 됐다면 팔로우 부탁드려요"', on: true }
  ]),
  usr: [],
  set: ld('set', { yt: '', llm: '', llmP: 'claude', pplx: '', el: '', gas: '' })
};

function ps(k) {
  sv(k === 'kw' ? 'kw' : k === 'sty' ? 'sty' : k === 'usr' ? 'usr' : 'set', D[k]);
}
function uc() {
  var el1 = $('styC'); if (el1) el1.textContent = D.sty.length;
  var el2 = $('usrC'); if (el2) el2.textContent = D.usr.length;
}

// ── 사이드바 탭 전환 ──
function goTab(t) {
  document.querySelectorAll('.side-item[data-t]').forEach(function(x) { x.classList.remove('active'); });
  var el = document.querySelector('.side-item[data-t="' + t + '"]');
  if (el) el.classList.add('active');
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('on'); });
  var panel = $('t-' + t);
  if (panel) panel.classList.add('on');
}

// ── 다크모드 토글 ──
function toggleTheme() {
  var html = document.documentElement;
  var isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) { html.removeAttribute('data-theme'); localStorage.setItem('yt_theme', 'light'); }
  else { html.setAttribute('data-theme', 'dark'); localStorage.setItem('yt_theme', 'dark'); }
  var btn = $('themeToggle');
  if (btn) btn.classList.toggle('on', !isDark);
}

// 다크모드 초기화
(function() {
  var saved = localStorage.getItem('yt_theme');
  if (saved === 'dark' || ((!saved) && window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    setTimeout(function() { var btn = $('themeToggle'); if (btn) btn.classList.add('on'); }, 0);
  }
})();

// ── 모달 내부 액션 바인딩 (모달 열릴 때마다 호출) ──
function _bindModalActions() {
  var md = $('md');
  if (!md) return;
  md.querySelectorAll('[data-action]').forEach(function(el) {
    if (el._bound) return;
    el._bound = true;
    el.addEventListener('click', function(e) {
      var action = el.dataset.action;
      if (ACTIONS[action]) ACTIONS[action](el, e);
    });
  });
}

// ═══════════════════════════════════════════════════
// 이벤트 위임 — data-action 클릭, data-action-input 입력
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  // ── 사이드바 탭 이벤트 위임 ──
  document.querySelectorAll('.side-item[data-t]').forEach(function(el) {
    el.addEventListener('click', function() { goTab(el.dataset.t); });
  });

  // ── 모달 배경 클릭 닫기 ──
  var mo = $('mo');
  if (mo) {
    mo.addEventListener('click', function(e) {
      if (e.target === mo) cM();
    });
  }

  // ── 글로벌 클릭 이벤트 위임 ──
  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    if (ACTIONS[action]) ACTIONS[action](el, e);
  });

  // ── 글로벌 input 이벤트 위임 ──
  document.addEventListener('input', function(e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.onInput) return;
    var action = el.dataset.onInput;
    if (ACTIONS[action]) ACTIONS[action](el, e);
  });

  // ── 글로벌 change 이벤트 위임 ──
  document.addEventListener('change', function(e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.onChange) return;
    var action = el.dataset.onChange;
    if (ACTIONS[action]) ACTIONS[action](el, e);
  });
});

// ── 공통 액션 등록 ──
ACTIONS['toggle-theme'] = function() { toggleTheme(); };
ACTIONS['close-modal'] = function() { cM(); };
ACTIONS['go-tab'] = function(el) { goTab(el.dataset.tab); };
ACTIONS['reset-all'] = function() {
  confirmAdmin('모든 데이터를 초기화하시겠습니까?', function() {
    Object.keys(localStorage).forEach(function(k) { if (k.startsWith(SK)) localStorage.removeItem(k); });
    location.reload();
  });
};
