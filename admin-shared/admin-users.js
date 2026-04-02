// ═══════════════════════════════════════════════════
// admin-users.js — 사용자 관리 공유 모듈
// 의존: admin-utils.js (ACTIONS, $, esc, toast, D, uc),
//       adminFetch (호스트 정의), rD (호스트 정의)
// ═══════════════════════════════════════════════════

var usrFilter = 'all';
var usrSearch = '';
var selectedUsers = {};

function rU() {
  var root = $('t-usr');
  root.textContent = '';
  // ★ innerHTML → DOM API 전환
  var head = _el('div', { className: 'page-head' });
  var headLeft = _el('div');
  headLeft.appendChild(_el('div', { className: 'page-title', textContent: '회원 관리' }));
  headLeft.appendChild(_el('div', { className: 'page-desc', textContent: '관리자 전용 패널' }));
  head.appendChild(headLeft);
  head.appendChild(_el('button', { className: 'btn btn-o', textContent: '🔄 새로고침', dataset: { action: 'refresh-users' } }));
  root.appendChild(head);

  var filterCard = _el('div', { className: 'card' });
  var filterRow = _el('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' });
  filterRow.appendChild(_el('input', { className: 'inp inp-s', id: 'usrSearch', placeholder: '이름, 이메일, 기수 검색...', style: 'flex:1;min-width:200px', dataset: { onInput: 'usr-search' } }));
  var sel = _el('select', { className: 'inp', id: 'usrFilter', style: 'width:140px', dataset: { onChange: 'usr-filter' } });
  [{ v: 'all', t: '전체 보기' }, { v: '대기중', t: '승인 대기' }, { v: '승인완료', t: '승인 완료' }].forEach(function(o) { sel.appendChild(_el('option', { value: o.v, textContent: o.t })); });
  filterRow.appendChild(sel);
  filterRow.appendChild(_el('button', { className: 'btn btn-p', id: 'bulkApproveBtn', style: 'display:none', textContent: '✓ 선택 승인 (0명)', dataset: { action: 'bulk-approve' } }));
  filterCard.appendChild(filterRow);
  root.appendChild(filterCard);

  var usrList = _el('div', { className: 'card', id: 'usrList' });
  usrList.appendChild(_el('div', { style: 'padding:40px;text-align:center;color:var(--t3)', textContent: '로딩 중...' }));
  root.appendChild(usrList);
  loadUsers();
}

function loadUsers() {
  adminFetch('/admin/users').then(function(r) { return r.json(); }).then(function(users) {
    D.usr = users;
    if ($('usrC')) $('usrC').textContent = users.length;
    filterUsers();
  }).catch(function(e) {
    if (e.message === 'ADMIN_UNAUTHORIZED' || e.message === 'SESSION_EXPIRED') return;
    var el = $('usrList'); el.textContent = '';
    el.appendChild(_el('div', { style: 'padding:40px;text-align:center;color:var(--red)', textContent: '회원 목록 로드 실패: ' + e.message }));
  });
}

function filterUsers() {
  var list = D.usr;
  if (usrFilter !== 'all') list = list.filter(function(u) { return u.approval_status === usrFilter; });
  if (usrSearch) {
    var q = usrSearch.toLowerCase();
    list = list.filter(function(u) {
      return (u.full_name || u.name || '').toLowerCase().indexOf(q) !== -1 ||
             (u.email || '').toLowerCase().indexOf(q) !== -1 ||
             (u.cohort || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  renderUserTable(list);
}

function renderUserTable(list) {
  var usrList = $('usrList');
  usrList.textContent = '';
  // ★ innerHTML → DOM API 전환 — 유저 데이터(이름/이메일/기수) XSS 방지
  if (!list.length) {
    usrList.appendChild(_el('div', { style: 'padding:40px;text-align:center;color:var(--t3)', textContent: '검색 결과가 없습니다' }));
    return;
  }
  var pending = list.filter(function(u) { return u.approval_status === '대기중'; });
  var countRow = _el('div', { style: 'font-size:12px;color:var(--t3);margin-bottom:12px' });
  countRow.appendChild(document.createTextNode(list.length + '명의 회원'));
  if (pending.length) {
    countRow.appendChild(document.createTextNode(' · '));
    countRow.appendChild(_el('span', { style: 'color:var(--yel);font-weight:600', textContent: '승인 대기 ' + pending.length + '명' }));
  }
  usrList.appendChild(countRow);

  var tblWrap = _el('div', { className: 'tbl-w' });
  var table = _el('table');
  var thead = _el('thead');
  var headRow = _el('tr');
  var thChk = _el('th', { style: 'width:32px' });
  thChk.appendChild(_el('input', { type: 'checkbox', dataset: { onChange: 'toggle-all' } }));
  headRow.appendChild(thChk);
  ['이름', '이메일', '연락처', '기수', '승인 상태', '가입일'].forEach(function(t) { headRow.appendChild(_el('th', { textContent: t })); });
  headRow.appendChild(_el('th', { style: 'width:130px', textContent: '작업' }));
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = _el('tbody');
  list.forEach(function(u) {
    var tr = _el('tr');
    var tdChk = _el('td');
    tdChk.appendChild(_el('input', { type: 'checkbox', dataset: { uid: u.id, onChange: 'toggle-select' } }));
    tr.appendChild(tdChk);
    tr.appendChild(_el('td', { textContent: u.full_name || u.name || '-' }));
    tr.appendChild(_el('td', { style: 'font-family:var(--mono);font-size:12px', textContent: u.email || '' }));
    tr.appendChild(_el('td', { style: 'font-size:12px', textContent: u.phone || '-' }));
    var tdCohort = _el('td');
    tdCohort.appendChild(_el('span', { className: 'tag', textContent: u.cohort || '-' }));
    tr.appendChild(tdCohort);
    var tdStatus = _el('td');
    tdStatus.appendChild(_el('span', { className: 'badge ' + (u.approval_status === '승인완료' ? 'badge-grn' : 'badge-acc'), textContent: u.approval_status === '승인완료' ? '승인완료' : '대기중' }));
    tr.appendChild(tdStatus);
    tr.appendChild(_el('td', { style: 'font-size:12px;color:var(--t3)', textContent: u.created_at ? new Date(u.created_at).toLocaleDateString('ko') : '' }));
    var tdAct = _el('td');
    var actDiv = _el('div', { className: 'tbl-a' });
    if (u.approval_status === '대기중') {
      actDiv.appendChild(_el('button', { className: 'btn btn-p btn-sm', textContent: '승인', dataset: { action: 'approve-user', uid: u.id } }));
      actDiv.appendChild(_el('button', { className: 'btn btn-d btn-sm', textContent: '삭제', dataset: { action: 'delete-user', uid: u.id } }));
    } else {
      actDiv.appendChild(_el('button', { className: 'btn btn-o btn-sm', textContent: '승인 취소', dataset: { action: 'reject-user', uid: u.id } }));
      actDiv.appendChild(_el('button', { className: 'btn btn-d btn-sm', textContent: '삭제', dataset: { action: 'delete-user', uid: u.id } }));
    }
    tdAct.appendChild(actDiv);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tblWrap.appendChild(table);
  usrList.appendChild(tblWrap);
  updateBulkBtn();
}

function updateBulkBtn() {
  var count = Object.keys(selectedUsers).length;
  var btn = $('bulkApproveBtn');
  if (btn) {
    btn.style.display = count > 0 ? 'inline-flex' : 'none';
    btn.textContent = '✓ 선택 승인 (' + count + '명)';
  }
}

function approveUser(uid) {
  adminFetch('/admin/approve', { method: 'POST', body: JSON.stringify({ user_id: uid }) })
    .then(function(r) { return r.json(); })
    .then(function(d) { toast(d.message || '승인 완료'); rU(); rD(); })
    .catch(function(e) { toast('승인 실패: ' + e.message, 'err'); });
}

function rejectUser(uid) {
  confirmAdmin('승인을 취소하시겠습니까?', function() {
    adminFetch('/admin/reject', { method: 'POST', body: JSON.stringify({ user_id: uid }) })
      .then(function(r) { return r.json(); })
      .then(function(d) { toast(d.message || '승인 취소'); rU(); rD(); })
      .catch(function(e) { toast('실패: ' + e.message, 'err'); });
  });
}

function deleteUser() {
  toast('회원 삭제는 Supabase Dashboard에서 직접 처리하세요.', 'err');
}

function bulkApprove() {
  var ids = Object.keys(selectedUsers);
  if (!ids.length) return;
  confirmAdmin(ids.length + '명을 승인하시겠습니까?', function() {
    var done = 0;
    ids.forEach(function(uid) {
      adminFetch('/admin/approve', { method: 'POST', body: JSON.stringify({ user_id: uid }) })
        .then(function() {
          done++;
          if (done === ids.length) { toast(done + '명 승인 완료'); selectedUsers = {}; rU(); rD(); }
        });
    });
  });
}

// ── 이벤트 위임 액션 등록 ──
ACTIONS['refresh-users'] = function() { rU(); };
ACTIONS['usr-search'] = function(el) { usrSearch = el.value; filterUsers(); };
ACTIONS['usr-filter'] = function(el) { usrFilter = el.value; filterUsers(); };
ACTIONS['toggle-all'] = function(el) {
  document.querySelectorAll('[data-uid]').forEach(function(cb) {
    cb.checked = el.checked;
    if (el.checked) selectedUsers[cb.dataset.uid] = true;
    else delete selectedUsers[cb.dataset.uid];
  });
  updateBulkBtn();
};
ACTIONS['toggle-select'] = function(el) {
  if (el.checked) selectedUsers[el.dataset.uid] = true;
  else delete selectedUsers[el.dataset.uid];
  updateBulkBtn();
};
ACTIONS['approve-user'] = function(el) { approveUser(el.dataset.uid); };
ACTIONS['reject-user'] = function(el) { rejectUser(el.dataset.uid); };
ACTIONS['delete-user'] = function() { deleteUser(); };
ACTIONS['bulk-approve'] = function() { bulkApprove(); };
