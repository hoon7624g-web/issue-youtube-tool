// ═══════════════════════════════════════════════════
// admin-styles.js — 스타일 관리 공유 모듈
// 의존: admin-utils.js (ACTIONS, $, esc, toast, oM, cM, D, ps, gid, uc),
//       rD (호스트 정의)
// ═══════════════════════════════════════════════════

function rS() {
  var root = $('t-sty');
  root.textContent = '';
  // ★ innerHTML → DOM API 전환
  var head = _el('div', { className: 'page-head' });
  var headLeft = _el('div');
  headLeft.appendChild(_el('div', { className: 'page-title', textContent: '스타일 관리' }));
  headLeft.appendChild(_el('div', { className: 'page-desc', textContent: '스크립트 생성에 사용되는 스타일 프리셋' }));
  head.appendChild(headLeft);
  var addBtn = _el('button', { className: 'btn btn-p', dataset: { action: 'add-style' } });
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l1.setAttribute('x1','12');l1.setAttribute('y1','5');l1.setAttribute('x2','12');l1.setAttribute('y2','19');
  var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l2.setAttribute('x1','5');l2.setAttribute('y1','12');l2.setAttribute('x2','19');l2.setAttribute('y2','12');
  svg.appendChild(l1); svg.appendChild(l2);
  addBtn.appendChild(svg);
  addBtn.appendChild(document.createTextNode('스타일 추가'));
  head.appendChild(addBtn);
  root.appendChild(head);

  var tblWrap = _el('div', { className: 'tbl-w' });
  var table = _el('table');
  var thead = _el('thead');
  var hRow = _el('tr');
  ['스타일명', '설명', '프롬프트', '상태'].forEach(function(t) { hRow.appendChild(_el('th', { textContent: t })); });
  hRow.appendChild(_el('th', { style: 'width:100px', textContent: '관리' }));
  thead.appendChild(hRow);
  table.appendChild(thead);

  var tbody = _el('tbody');
  D.sty.forEach(function(s) {
    var tr = _el('tr');
    tr.appendChild(_el('td', { textContent: s.name }));
    tr.appendChild(_el('td', { style: 'max-width:200px', textContent: s.desc }));
    tr.appendChild(_el('td', { style: 'max-width:200px;font-size:12px;color:var(--t3)', textContent: (s.prompt || '').substring(0, 50) + (s.prompt && s.prompt.length > 50 ? '...' : '') }));
    var tdToggle = _el('td');
    var label = _el('label', { className: 'tg' });
    var cb = _el('input', { type: 'checkbox', dataset: { onChange: 'toggle-style', sid: s.id } });
    if (s.on) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(_el('span', { className: 'tg-t' }));
    label.appendChild(_el('span', { className: 'tg-th' }));
    tdToggle.appendChild(label);
    tr.appendChild(tdToggle);
    var tdAct = _el('td');
    var actDiv = _el('div', { className: 'tbl-a' });
    actDiv.appendChild(_el('button', { className: 'btn btn-g btn-sm', textContent: '수정', dataset: { action: 'edit-style', sid: s.id } }));
    actDiv.appendChild(_el('button', { className: 'btn btn-d btn-sm', textContent: '삭제', dataset: { action: 'delete-style', sid: s.id } }));
    tdAct.appendChild(actDiv);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tblWrap.appendChild(table);
  root.appendChild(tblWrap);
}

function oSt(id) {
  var s = id ? D.sty.find(function(x) { return x.id === id; }) : null;
  var editing = !!s;
  // ★ HTML 문자열 → DOM 노드 전환
  var wrap = _el('div');
  var header = _el('div', { className: 'md-h' });
  header.appendChild(_el('div', { className: 'md-t', textContent: editing ? '스타일 수정' : '스타일 추가' }));
  header.appendChild(_el('button', { className: 'md-x', textContent: '×', dataset: { action: 'close-modal' } }));
  wrap.appendChild(header);

  var body = _el('div', { className: 'md-b' });
  var f1 = _el('div', { className: 'field' });
  f1.appendChild(_el('label', { textContent: '스타일명' }));
  f1.appendChild(_el('input', { className: 'inp', id: 'mSN', value: s ? s.name : '' }));
  body.appendChild(f1);
  var f2 = _el('div', { className: 'field' });
  f2.appendChild(_el('label', { textContent: '설명' }));
  f2.appendChild(_el('input', { className: 'inp', id: 'mSD', value: s ? s.desc : '' }));
  body.appendChild(f2);
  var f3 = _el('div', { className: 'field' });
  f3.appendChild(_el('label', { textContent: '프롬프트 규칙' }));
  var ta = _el('textarea', { className: 'inp', id: 'mSP', placeholder: 'LLM에 전달할 프롬프트...' });
  ta.value = s ? (s.prompt || '') : '';
  f3.appendChild(ta);
  body.appendChild(f3);
  wrap.appendChild(body);

  var footer = _el('div', { className: 'md-f' });
  footer.appendChild(_el('button', { className: 'btn btn-o', textContent: '취소', dataset: { action: 'close-modal' } }));
  footer.appendChild(_el('button', { className: 'btn btn-p', textContent: '저장', dataset: { action: 'save-style', sid: editing ? s.id : '' } }));
  wrap.appendChild(footer);
  oM(wrap);
}

function sSt(id) {
  var n = $('mSN').value.trim();
  if (!n) { toast('스타일명을 입력하세요', 'err'); return; }

  var o = {
    name: n,
    desc: $('mSD').value.trim(),
    prompt: $('mSP').value.trim(),
    on: true
  };

  if (id) {
    var i = D.sty.findIndex(function(s) { return s.id === id; });
    if (i > -1) { o.id = id; o.on = D.sty[i].on; D.sty[i] = o; }
  } else {
    o.id = gid();
    D.sty.push(o);
  }

  ps('sty'); cM(); rS(); rD(); uc();
  toast(id ? '스타일 수정 완료' : '스타일 추가 완료');
}

function dSt(id) {
  if (!confirm('삭제하시겠습니까?')) return;
  D.sty = D.sty.filter(function(s) { return s.id !== id; });
  ps('sty'); rS(); rD(); uc();
  toast('스타일 삭제 완료');
}

function tSt(id, v) {
  var s = D.sty.find(function(x) { return x.id === id; });
  if (s) s.on = v;
  ps('sty'); rD();
  toast(v ? '활성화' : '비활성화');
}

// ── 이벤트 위임 액션 등록 ──
ACTIONS['add-style'] = function() { oSt(null); };
ACTIONS['edit-style'] = function(el) { oSt(el.dataset.sid); };
ACTIONS['delete-style'] = function(el) { dSt(el.dataset.sid); };
ACTIONS['save-style'] = function(el) { sSt(el.dataset.sid || null); };
ACTIONS['toggle-style'] = function(el) { tSt(el.dataset.sid, el.checked); };
