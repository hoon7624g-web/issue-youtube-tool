// ═══════════════════════════════════════════════════════════
// admin-app.js — admin-web 인라인 스크립트 외부화
// v3.5.5 — CSP unsafe-inline 제거를 위해 분리
// ═══════════════════════════════════════════════════════════

// ── Block 1: Fallback 정의 ──
if (typeof cfg === 'undefined') {
  function cfg() {
    return { proxy: false };
  }
}
if (typeof hasKey === 'undefined') {
  function hasKey() {
    return false;
  }
}
if (typeof getSession === 'undefined') {
  function getSession() {
    return null;
  }
}
if (typeof setSession === 'undefined') {
  function setSession() {}
}
if (typeof clearSession === 'undefined') {
  function clearSession() {}
}
if (typeof getToken === 'undefined') {
  function getToken() {
    return '';
  }
}
if (typeof getUser === 'undefined') {
  function getUser() {
    return null;
  }
}
if (typeof proxyFetch === 'undefined') {
  function proxyFetch() {
    return Promise.reject(new Error('프록시 미연결'));
  }
}
if (typeof PROXY_BASE === 'undefined') {
  var PROXY_BASE = '';
}

// ── Block 2: Admin 세션/로그인/레이아웃 ──
// ── Admin 세션 관리 (sessionStorage — 탭 종료 시 자동 소멸) ──
function getAdminToken() {
  return sessionStorage.getItem('yt_admin_token') || '';
}
function setAdminToken(t) {
  sessionStorage.setItem('yt_admin_token', t);
}
function getAdminUser() {
  try {
    return JSON.parse(sessionStorage.getItem('yt_admin_user') || 'null');
  } catch (e) {
    return null;
  }
}
function setAdminUser(u) {
  sessionStorage.setItem('yt_admin_user', JSON.stringify(u));
}
function clearAdmin() {
  sessionStorage.removeItem('yt_admin_token');
  sessionStorage.removeItem('yt_admin_user');
}

function adminFetch(endpoint, options) {
  options = options || {};
  options.headers = options.headers || {};
  var token = getAdminToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  return fetch(PROXY_BASE + endpoint, options).then(function (r) {
    if (r.status === 403) {
      return r
        .clone()
        .json()
        .then(function (d) {
          if (d.code === 'NOT_ADMIN') {
            toast('관리자 권한이 없는 계정입니다.', 'err');
          } else {
            toast('관리자 인증 실패.', 'err');
          }
          throw new Error('ADMIN_UNAUTHORIZED');
        });
    }
    if (r.status === 401) {
      clearAdmin();
      showAdminLogin();
      throw new Error('SESSION_EXPIRED');
    }
    return r;
  });
}

// ── Layout helpers ──
function hideChrome() {
  var h = document.querySelector('.header');
  if (h) h.style.display = 'none';
  var s = document.querySelector('.side');
  if (s) s.style.display = 'none';
  var m = document.querySelector('.main');
  if (m) {
    m.style.gridColumn = '1/-1';
    m.style.display = 'flex';
    m.style.alignItems = 'center';
    m.style.justifyContent = 'center';
    m.style.minHeight = '100vh';
  }
  var layout = document.querySelector('.layout');
  if (layout) layout.style.gridTemplateColumns = '1fr';
}
function showChrome() {
  var h = document.querySelector('.header');
  if (h) h.style.display = '';
  var s = document.querySelector('.side');
  if (s) s.style.display = '';
  var m = document.querySelector('.main');
  if (m) {
    m.style.gridColumn = '';
    m.style.display = '';
    m.style.alignItems = '';
    m.style.justifyContent = '';
    m.style.minHeight = '';
  }
  var layout = document.querySelector('.layout');
  if (layout) layout.style.gridTemplateColumns = '';
}

function showAdminLogin() {
  hideChrome();
  var dash = $('t-dash');
  dash.classList.add('on');
  dash.textContent = '';
  // ★ innerHTML → DOM API 전환 (로그인 폼)
  var wrap = _el('div', {
    style: 'max-width:400px;width:100%;text-align:center;padding:40px 20px',
  });
  wrap.appendChild(_el('div', { style: 'font-size:48px;margin-bottom:16px', textContent: '🔐' }));
  wrap.appendChild(
    _el('h2', {
      style: 'font-size:20px;font-weight:700;margin-bottom:8px',
      textContent: '관리자 로그인',
    })
  );
  wrap.appendChild(
    _el('p', {
      style: 'font-size:13px;color:var(--t3);margin-bottom:24px',
      textContent: '관리자 계정으로 로그인하세요',
    })
  );
  var f1 = _el('div', { className: 'field' });
  f1.appendChild(
    _el('label', {
      style: 'text-align:left;display:block;font-size:12px;font-weight:600;margin-bottom:4px',
      textContent: '이메일',
    })
  );
  f1.appendChild(
    _el('input', {
      className: 'inp',
      id: 'adminEmail',
      type: 'email',
      placeholder: 'admin@example.com',
    })
  );
  wrap.appendChild(f1);
  var f2 = _el('div', { className: 'field' });
  f2.appendChild(
    _el('label', {
      style: 'text-align:left;display:block;font-size:12px;font-weight:600;margin-bottom:4px',
      textContent: '비밀번호',
    })
  );
  f2.appendChild(
    _el('input', { className: 'inp', id: 'adminPw', type: 'password', placeholder: '비밀번호' })
  );
  wrap.appendChild(f2);
  wrap.appendChild(
    _el('div', {
      id: 'adminErr',
      style:
        'color:var(--red);font-size:12px;margin-bottom:12px;display:none;padding:8px 12px;background:var(--red-bg);border-radius:var(--r)',
    })
  );
  wrap.appendChild(
    _el('button', {
      className: 'btn btn-p',
      style: 'width:100%',
      id: 'adminBtn',
      textContent: '로그인',
      dataset: { action: 'verify-admin' },
    })
  );
  wrap.appendChild(
    _el('p', { style: 'margin-top:20px;font-size:11px;color:var(--t4)', textContent: '유튜브도사' })
  );
  dash.appendChild(wrap);
  var pwEl = $('adminPw');
  if (pwEl)
    pwEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') verifyAdmin();
    });
  setTimeout(function () {
    var k = $('adminEmail');
    if (k) k.focus();
  }, 200);
}

function verifyAdmin() {
  var email = $('adminEmail').value.trim();
  var pw = $('adminPw').value;
  var errEl = $('adminErr');
  var btn = $('adminBtn');
  if (!email || !pw) {
    errEl.textContent = '이메일과 비밀번호를 입력하세요';
    errEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = '로그인 중...';
  errEl.style.display = 'none';
  fetch(PROXY_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: pw }),
  })
    .then(function (r) {
      return r.json().then(function (d) {
        return { status: r.status, data: d };
      });
    })
    .then(function (res) {
      if (res.status !== 200) throw new Error(res.data.error || '로그인 실패');
      if (!res.data.user || res.data.user.role !== 'admin')
        throw new Error('관리자 권한이 없는 계정입니다');
      setAdminToken(res.data.access_token);
      setAdminUser(res.data.user);
      toast(res.data.user.name + '님 환영합니다');
      showChrome();
      initAdmin();
    })
    .catch(function (e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '로그인';
      clearAdmin();
    });
}

function initAdmin() {
  var u = getAdminUser();
  if (u && $('adminName')) $('adminName').textContent = u.name || u.email || '';
  rD();
  rS();
  rU();
  rUsage();
  rSt();
  uc();
}

// ── Init ──
document.addEventListener('DOMContentLoaded', function () {
  if (!getAdminToken()) {
    showAdminLogin();
  } else {
    adminFetch('/admin/stats')
      .then(function (r) {
        if (!r.ok) throw new Error('invalid');
        return r.json();
      })
      .then(function () {
        showChrome();
        initAdmin();
      })
      .catch(function () {
        clearAdmin();
        showAdminLogin();
      });
  }
});

// ── Host actions ──
ACTIONS['admin-logout'] = function () {
  clearAdmin();
  location.reload();
};
ACTIONS['verify-admin'] = function () {
  verifyAdmin();
};

// ── Block 3: Dashboard/Usage/Settings ──
// ═══ 대시보드 ═══
function rD() {
  $('t-dash').innerHTML =
    '<div class="page-head"><div><div class="page-title">대시보드</div><div class="page-desc">전체 운영 현황을 한눈에 확인하세요</div></div><button class="btn btn-o" data-action="refresh-dash">🔄 새로고침</button></div><div class="stats" id="dashStats"><div class="stat"><div class="stat-label">로딩 중...</div></div></div><div class="card" id="dashApi"></div>';
  adminFetch('/admin/stats')
    .then(function (r) {
      return r.json();
    })
    .then(function (s) {
      $('dashStats').innerHTML =
        '<div class="stat stat-acc" style="cursor:pointer" data-action="go-tab" data-tab="usr"><div class="stat-label">전체 회원</div><div class="stat-value">' +
        s.total +
        '</div><div class="stat-sub">등록된 모든 사용자</div></div>' +
        '<div class="stat stat-yel" style="cursor:pointer" data-action="go-tab" data-tab="usr"><div class="stat-label">승인 대기</div><div class="stat-value">' +
        s.pending +
        '</div><div class="stat-sub">승인이 필요한 사용자</div></div>' +
        '<div class="stat stat-grn" style="cursor:pointer" data-action="go-tab" data-tab="usr"><div class="stat-label">승인 완료</div><div class="stat-value">' +
        s.approved +
        '</div><div class="stat-sub">이용 중인 사용자</div></div>' +
        '<div class="stat stat-blu" style="cursor:pointer" data-action="go-tab" data-tab="sty"><div class="stat-label">스크립트 스타일</div><div class="stat-value">' +
        D.sty.length +
        '</div><div class="stat-sub">활성 ' +
        D.sty.filter(function (x) {
          return x.on;
        }).length +
        '개</div></div>';
      $('dashApi').innerHTML =
        '<div class="card-title">API 연동 상태 (v3.4)</div>' +
        '<div style="padding:10px 14px;background:rgba(6,182,212,.04);border:1px solid rgba(6,182,212,.15);border-radius:var(--r);font-size:12px;color:var(--t2);line-height:1.6;margin-bottom:12px">💡 YouTube/AI/TTS/ElevenLabs는 <strong>수강생 개인 키</strong>로 직접 호출합니다. 회사 서버는 인증과 무료 API만 경유합니다. 이슈링크는 Electron에서 직접 크롤링합니다.</div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px">서버 경유 (회사 관리)</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">로그인/인증</span> <span style="color:var(--grn)">● 운영 중</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">Google Trends</span> <span style="color:var(--grn)">● 무료</span></div></div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px">앱 내 직접 처리</div>' +
        '<div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:12px">' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">이슈링크</span> <span style="color:var(--grn)">● Electron 직접 크롤링</span></div></div>' +
        '<div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px">수강생 직접 호출 (관리 불필요)</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">YouTube</span> <span style="color:var(--t4)">● 개인 키</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">AI (3종)</span> <span style="color:var(--t4)">● 개인 키</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">Google AI Studio</span> <span style="color:var(--t4)">● 개인 키</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">TTS</span> <span style="color:var(--t4)">● 개인 키</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">ElevenLabs</span> <span style="color:var(--t4)">● 개인 키</span></div>' +
        '<div style="padding:10px;background:var(--bg1);border-radius:var(--r);font-size:12px"><span style="font-weight:600">Pexels</span> <span style="color:var(--t4)">● 개인 키</span></div></div>';
    })
    .catch(function (e) {
      if (e.message === 'ADMIN_UNAUTHORIZED') return;
      var statsEl = $('dashStats');
      statsEl.textContent = '';
      var errDiv = _el('div', { className: 'stat' });
      var errLabel = _el('div', {
        className: 'stat-label',
        style: 'color:var(--red)',
        textContent: '통계 로드 실패',
      });
      var errSub = _el('div', { className: 'stat-sub', textContent: e.message });
      errDiv.appendChild(errLabel);
      errDiv.appendChild(errSub);
      statsEl.appendChild(errDiv);
    });
}
ACTIONS['refresh-dash'] = function () {
  rD();
  rU();
};

// ═══ 사용량 모니터링 ═══
var usageDays = 7;
function rUsage() {
  $('t-usage').innerHTML =
    '<div class="page-head"><div><div class="page-title">사용량 모니터링</div><div class="page-desc">서버 경유 API 호출 통계 (로그인/Trends)</div></div><div style="display:flex;gap:8px;align-items:center"><select class="inp" style="width:130px" data-on-change="usage-days"><option value="1">오늘</option><option value="7" selected>최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select><button class="btn btn-o" data-action="refresh-usage">새로고침</button></div></div><div class="card" style="margin-bottom:16px;border-color:rgba(6,182,212,.2);background:rgba(6,182,212,.04)"><div style="font-size:13px;color:var(--t2);line-height:1.6">💡 <strong>YouTube, AI, TTS, ElevenLabs는 수강생 개인 키로 직접 호출합니다.</strong><br>이 페이지에는 서버를 경유하는 API(로그인, Google Trends)만 표시됩니다.</div></div><div id="usageContent"><div style="padding:40px;text-align:center;color:var(--t3)">로딩 중...</div></div>';
  loadUsage();
}
function loadUsage() {
  adminFetch('/admin/usage?days=' + usageDays)
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      renderUsage(d);
    })
    .catch(function (e) {
      if (e.message === 'ADMIN_UNAUTHORIZED' || e.message === 'SESSION_EXPIRED') return;
      var uc = $('usageContent');
      uc.textContent = '';
      var errCard = _el('div', {
        className: 'card',
        style: 'color:var(--red)',
        textContent: '사용량 로드 실패: ' + e.message,
      });
      uc.appendChild(errCard);
    });
}
function renderUsage(d) {
  var epNames = {
    trends: 'Google Trends',
    gas: 'GAS 이슈링크',
    login: '로그인',
    signup: '회원가입',
  };
  var epColors = { trends: '#0F6E56', gas: '#854F0B', login: '#185FA5', signup: '#534AB7' };
  var html = '<div class="stats" style="margin-bottom:16px">';
  html +=
    '<div class="stat stat-acc"><div class="stat-label">총 호출</div><div class="stat-value">' +
    d.totalCalls.toLocaleString() +
    '</div><div class="stat-sub">최근 ' +
    d.period.days +
    '일</div></div>';
  var errCount = 0;
  Object.values(d.endpoints).forEach(function (ep) {
    errCount += ep.errors;
  });
  html +=
    '<div class="stat ' +
    (errCount > 0 ? 'stat-red' : 'stat-grn') +
    '"><div class="stat-label">에러</div><div class="stat-value">' +
    errCount +
    '</div><div class="stat-sub">' +
    (errCount > 0 ? '확인 필요' : '정상') +
    '</div></div>';
  var avgMs = 0;
  var totalMs = 0;
  var totalCount = 0;
  Object.values(d.endpoints).forEach(function (ep) {
    totalMs += ep.avgMs * ep.count;
    totalCount += ep.count;
  });
  if (totalCount > 0) avgMs = Math.round(totalMs / totalCount);
  html +=
    '<div class="stat stat-blu"><div class="stat-label">평균 응답</div><div class="stat-value">' +
    avgMs +
    'ms</div><div class="stat-sub">전체 평균</div></div>';
  html +=
    '<div class="stat stat-grn"><div class="stat-label">회사 비용</div><div class="stat-value">$0</div><div class="stat-sub">수강생 개인 키 사용</div></div></div>';
  var serverEps = ['trends', 'gas', 'login', 'signup', 'auth'];
  var sortedEps = Object.entries(d.endpoints).sort(function (a, b) {
    return b[1].count - a[1].count;
  });
  var serverRows = sortedEps.filter(function (e) {
    return serverEps.indexOf(e[0]) !== -1;
  });
  html +=
    '<div class="card"><div class="card-title">서버 경유 API 사용량</div><div class="tbl-w"><table><thead><tr><th>API</th><th style="text-align:right">호출 수</th><th style="text-align:right">에러</th><th style="text-align:right">평균 응답</th><th>상태</th></tr></thead><tbody>';
  serverRows.forEach(function (entry) {
    var ep = entry[0];
    var info = entry[1];
    var errPct = info.count > 0 ? Math.round((info.errors / info.count) * 100) : 0;
    var statusBadge =
      errPct > 10
        ? '<span class="badge badge-acc">경고 ' + errPct + '%</span>'
        : errPct > 0
          ? '<span class="badge badge-yel">주의 ' + errPct + '%</span>'
          : '<span class="badge badge-grn">정상</span>';
    html +=
      '<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
      (epColors[ep] || '#888') +
      ';margin-right:6px"></span>' +
      (epNames[ep] || ep) +
      '</td>';
    html +=
      '<td style="text-align:right;font-family:var(--mono);font-weight:600">' +
      info.count.toLocaleString() +
      '</td>';
    html +=
      '<td style="text-align:right;font-family:var(--mono);color:' +
      (info.errors > 0 ? 'var(--red)' : 'var(--t3)') +
      '">' +
      info.errors +
      '</td>';
    html += '<td style="text-align:right;font-family:var(--mono)">' + info.avgMs + 'ms</td>';
    html += '<td>' + statusBadge + '</td></tr>';
  });
  if (!serverRows.length)
    html +=
      '<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:20px">아직 사용 데이터가 없습니다</td></tr>';
  html += '</tbody></table></div></div>';
  if (d.daily.length > 1) {
    html +=
      '<div class="card"><div class="card-title">일별 호출 추이</div><div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding:8px 0">';
    var maxDay = Math.max.apply(
      null,
      d.daily.map(function (x) {
        return x.total;
      })
    );
    d.daily.forEach(function (day) {
      var h = maxDay > 0 ? Math.max(4, Math.round((day.total / maxDay) * 100)) : 4;
      html +=
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="font-size:10px;font-family:var(--mono);color:var(--t3)">' +
        day.total +
        '</div><div style="width:100%;max-width:40px;height:' +
        h +
        'px;background:var(--acc);border-radius:4px 4px 0 0;opacity:0.8"></div><div style="font-size:10px;color:var(--t4)">' +
        day.date.substring(5) +
        '</div></div>';
    });
    html += '</div></div>';
  }
  // ── p50/p95 응답 시간 차트 ──
  if (d.percentiles && Object.keys(d.percentiles).length) {
    var pEps = Object.entries(d.percentiles).sort(function (a, b) {
      return b[1].p95 - a[1].p95;
    });
    var maxP95 = Math.max.apply(
      null,
      pEps.map(function (e) {
        return e[1].p95;
      })
    );
    html += '<div class="card"><div class="card-title">엔드포인트별 응답 시간 (p50 / p95)</div>';
    html += '<div style="display:flex;flex-direction:column;gap:10px;padding:8px 0">';
    pEps.forEach(function (entry) {
      var ep = entry[0];
      var p = entry[1];
      var w50 = maxP95 > 0 ? Math.max(2, Math.round((p.p50 / maxP95) * 100)) : 2;
      var w95 = maxP95 > 0 ? Math.max(2, Math.round((p.p95 / maxP95) * 100)) : 2;
      var epLabel = epNames[ep] || ep;
      html += '<div style="display:flex;align-items:center;gap:10px">';
      html +=
        '<div style="width:100px;font-size:12px;color:var(--t2);text-align:right;flex-shrink:0">' +
        epLabel +
        '</div>';
      html += '<div style="flex:1;display:flex;flex-direction:column;gap:2px">';
      html +=
        '<div style="display:flex;align-items:center;gap:6px"><div style="height:14px;width:' +
        w95 +
        '%;background:rgba(239,68,68,.15);border-radius:3px;position:relative"><div style="height:100%;width:' +
        Math.round((w50 / w95) * 100) +
        '%;background:var(--acc);border-radius:3px;min-width:2px"></div></div><span style="font-size:11px;font-family:var(--mono);color:var(--t3);white-space:nowrap">p50:' +
        p.p50 +
        'ms p95:' +
        p.p95 +
        'ms</span></div>';
      html += '</div></div>';
    });
    html +=
      '<div style="display:flex;gap:16px;margin-top:4px;font-size:11px;color:var(--t4)"><span><span style="display:inline-block;width:10px;height:10px;background:var(--acc);border-radius:2px;vertical-align:middle;margin-right:3px"></span>p50 (중앙값)</span><span><span style="display:inline-block;width:10px;height:10px;background:rgba(239,68,68,.15);border-radius:2px;vertical-align:middle;margin-right:3px"></span>p95 (상위 5%)</span></div>';
    html += '</div></div>';
  }
  if (d.topUsers.length) {
    html +=
      '<div class="card"><div class="card-title">상위 사용자 (호출 수 기준)</div><div class="tbl-w"><table><thead><tr><th>#</th><th>이름</th><th>이메일</th><th style="text-align:right">호출 수</th></tr></thead><tbody>';
    d.topUsers.forEach(function (u, i) {
      html +=
        '<tr><td style="font-family:var(--mono);color:var(--t3)">' +
        (i + 1) +
        '</td><td>' +
        esc(u.name || '-') +
        '</td><td style="font-family:var(--mono);font-size:12px">' +
        esc(u.email) +
        '</td><td style="text-align:right;font-family:var(--mono);font-weight:600">' +
        u.count.toLocaleString() +
        '</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }
  html +=
    '<div class="card"><div class="card-title">Rate Limit 설정 현황 (서버 경유 API)</div><div id="rateLimitTable"><div style="padding:12px;color:var(--t3);font-size:12px">로딩 중...</div></div></div>';
  $('usageContent').innerHTML = html;
  adminFetch('/admin/rate-config')
    .then(function (r) {
      return r.json();
    })
    .then(function (configs) {
      var filtered = configs.filter(function (c) {
        return _serverEps.indexOf(c.endpoint) !== -1;
      });
      var thtml =
        '<div class="tbl-w"><table><thead><tr><th>API</th><th style="text-align:right">제한</th><th>기간</th><th style="text-align:right">변경</th></tr></thead><tbody>';
      filtered.forEach(function (c) {
        var windowLabel =
          c.window_seconds >= 3600
            ? c.window_seconds / 3600 + '시간'
            : c.window_seconds / 60 + '분';
        thtml +=
          '<tr><td>' +
          (epNames[c.endpoint] || c.endpoint) +
          '</td><td style="text-align:right;font-family:var(--mono)">' +
          c.max_requests +
          '회</td><td>1인/' +
          windowLabel +
          '당</td><td style="text-align:right"><button class="btn btn-o btn-sm" data-action="go-tab" data-tab="set">설정 →</button></td></tr>';
      });
      thtml += '</tbody></table></div>';
      var el = document.getElementById('rateLimitTable');
      if (el) el.innerHTML = thtml;
    })
    .catch(function () {
      var el = document.getElementById('rateLimitTable');
      if (el) {
        el.textContent = '';
        el.appendChild(
          _el('div', { style: 'font-size:12px;color:var(--t3)', textContent: '설정 로드 실패' })
        );
      }
    });
}
ACTIONS['usage-days'] = function (el) {
  usageDays = parseInt(el.value);
  loadUsage();
};
ACTIONS['refresh-usage'] = function () {
  loadUsage();
};

// ═══ 설정 ═══
var _rateConfigs = [];
var _epLabels = {
  gas: 'GAS (이슈링크)',
  trends: 'Google Trends',
  login: '로그인 Brute Force',
  signup: '회원가입',
};
var _serverEps = ['gas', 'trends', 'login', 'signup'];

function rSt() {
  $('t-set').innerHTML =
    '<div class="page-head"><div><div class="page-title">설정</div><div class="page-desc">서버 Rate Limit 및 운영 설정</div></div></div>' +
    '<div class="card" style="margin-bottom:20px;border-left:4px solid #FF4757"><div class="card-title">🎬 웨비나 데모 모드</div><div style="font-size:12px;color:var(--t3);margin-bottom:16px;line-height:1.6">웨비나 시연 시 특정 계정의 Rate Limit을 일시적으로 면제합니다. Admin 계정은 기본적으로 면제됩니다.</div>' +
    '<div id="demoBypassList" style="margin-bottom:12px"><div style="font-size:12px;color:var(--t4)">로딩 중...</div></div>' +
    '<div style="display:flex;gap:8px;align-items:center"><select class="inp" id="demoUserSelect" style="flex:1;font-size:13px"><option value="">유저 선택...</option></select>' +
    '<select class="inp" id="demoHours" style="width:100px;font-size:13px"><option value="1">1시간</option><option value="3" selected>3시간</option><option value="6">6시간</option><option value="12">12시간</option><option value="24">24시간</option></select>' +
    '<button class="btn btn-p btn-sm" data-action="activate-demo">활성화</button></div></div>' +
    '<div id="rateLimitSection"><div style="padding:20px;text-align:center;color:var(--t3)">설정을 불러오는 중...</div></div>' +
    '<div class="card" style="margin-top:20px"><div class="card-title">API 구조 안내 (v3.4)</div><div style="font-size:12px;color:var(--t3);line-height:1.7"><strong>서버 경유 (Rate Limit 관리 대상):</strong> 로그인/회원가입, Google Trends<br><strong>앱 내 직접 처리:</strong> 이슈링크 (Electron 크롤링)<br><strong>수강생 직접 호출 (관리 불필요):</strong> YouTube, Claude/Gemini/ChatGPT, Google AI Studio, Google TTS, ElevenLabs, Pexels<br><br>회사 부담 API 비용: <strong>0원</strong></div></div>' +
    '<div style="margin-top:20px"><button class="btn btn-o" data-action="reset-all">전체 로컬 데이터 초기화</button></div>';
  loadRateConfig();
  loadDemoBypass();
}

function loadDemoBypass() {
  adminFetch('/admin/users')
    .then(function (r) {
      return r.json();
    })
    .then(function (users) {
      var sel = $('demoUserSelect');
      if (!sel) return;
      sel.textContent = '';
      var defaultOpt = _el('option', { textContent: '유저 선택...', value: '' });
      sel.appendChild(defaultOpt);
      users.forEach(function (u) {
        var opt = _el('option', {
          value: u.id,
          textContent:
            esc(u.full_name || u.name || u.email) +
            ' (' +
            esc(u.email) +
            ')' +
            (u.role === 'admin' ? ' [Admin]' : ''),
        });
        sel.appendChild(opt);
      });
    })
    .catch(function () {});
  adminFetch('/admin/demo-bypass')
    .then(function (r) {
      if (!r.ok) throw new Error('not available');
      return r.json();
    })
    .then(function (list) {
      var container = $('demoBypassList');
      if (!container) return;
      container.textContent = '';
      if (!list || !Array.isArray(list) || !list.length) {
        container.appendChild(
          _el('div', {
            style: 'font-size:12px;color:var(--t4)',
            textContent: '현재 데모 모드 유저 없음 (Admin은 기본 면제)',
          })
        );
        return;
      }
      list.forEach(function (b) {
        var exp = new Date(b.expires_at);
        var remain = Math.max(0, Math.round((exp - Date.now()) / 60000));
        var row = _el('div', {
          style:
            'display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,71,87,.06);border-radius:8px;margin-bottom:6px',
        });
        var uid = _el('span', {
          style: 'font-size:12px;flex:1',
          textContent: b.user_id.substring(0, 8) + '... ',
        });
        var note = _el('span', { style: 'color:var(--t4)', textContent: b.note || '' });
        uid.appendChild(note);
        row.appendChild(uid);
        row.appendChild(
          _el('span', {
            style: 'font-size:11px;color:var(--acc);font-weight:600',
            textContent: remain + '분 남음',
          })
        );
        var deactBtn = _el('button', {
          className: 'btn btn-o btn-sm',
          style: 'font-size:11px',
          textContent: '해제',
        });
        deactBtn.dataset.action = 'deactivate-demo';
        deactBtn.dataset.uid = b.user_id;
        row.appendChild(deactBtn);
        container.appendChild(row);
      });
    })
    .catch(function () {
      var container = $('demoBypassList');
      if (container) {
        container.textContent = '';
        container.appendChild(
          _el('div', {
            style: 'font-size:12px;color:var(--t4)',
            textContent: 'demo_bypass 테이블 대기 중',
          })
        );
      }
    });
}

function loadRateConfig() {
  adminFetch('/admin/rate-config')
    .then(function (r) {
      return r.json();
    })
    .then(function (configs) {
      _rateConfigs = configs;
      var filtered = configs.filter(function (c) {
        return _serverEps.indexOf(c.endpoint) !== -1;
      });
      var html =
        '<div class="card"><div class="card-title">Rate Limit 설정 (서버 경유 API만)</div><div style="font-size:12px;color:var(--t3);margin-bottom:16px">서버를 경유하는 API의 호출 제한을 설정합니다.</div>';
      html += '<div style="display:grid;gap:16px">';
      filtered.forEach(function (c) {
        var label = _epLabels[c.endpoint] || c.endpoint;
        html +=
          '<div style="padding:16px;background:var(--bg1);border-radius:var(--r);border:1px solid var(--bdr)" id="rc-' +
          c.endpoint +
          '">';
        html +=
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:14px;font-weight:600;color:var(--t1)">' +
          label +
          '</div><span style="font-size:11px;color:var(--t3)">' +
          c.endpoint +
          '</span></div>';
        html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">';
        html +=
          '<div style="flex:1;min-width:160px"><label style="font-size:11px;color:var(--t3);display:block;margin-bottom:4px">최대 요청 수</label><div style="display:flex;align-items:center;gap:8px"><input type="range" min="1" max="200" value="' +
          c.max_requests +
          '" data-on-input="rate-range" data-ep="' +
          c.endpoint +
          '" data-field="max_requests" style="flex:1"><span style="font-family:var(--mono);font-size:13px;font-weight:600;min-width:40px" id="rate-label-' +
          c.endpoint +
          '">' +
          c.max_requests +
          '회</span></div></div>';
        html +=
          '<div style="min-width:120px"><label style="font-size:11px;color:var(--t3);display:block;margin-bottom:4px">시간 윈도우</label><select class="inp" style="font-size:12px;padding:6px 8px" data-ep="' +
          c.endpoint +
          '" data-field="window_seconds"><option value="1800"' +
          (c.window_seconds === 1800 ? ' selected' : '') +
          '>30분</option><option value="3600"' +
          (c.window_seconds === 3600 ? ' selected' : '') +
          '>1시간</option><option value="7200"' +
          (c.window_seconds === 7200 ? ' selected' : '') +
          '>2시간</option><option value="86400"' +
          (c.window_seconds === 86400 ? ' selected' : '') +
          '>24시간</option></select></div>';
        html +=
          '<button class="btn btn-p btn-sm" data-action="save-rate" data-ep="' +
          c.endpoint +
          '">저장</button>';
        html += '</div></div>';
      });
      html += '</div></div>';
      $('rateLimitSection').innerHTML = html;
    })
    .catch(function (e) {
      var rlSec = $('rateLimitSection');
      rlSec.textContent = '';
      var rlErr = _el('div', { className: 'card', style: 'border-color:var(--red)' });
      rlErr.appendChild(
        _el('div', {
          style: 'color:var(--red);font-size:14px;font-weight:600',
          textContent: 'Rate Limit 설정 로드 실패',
        })
      );
      rlErr.appendChild(
        _el('div', {
          style: 'font-size:12px;color:var(--t3);margin-top:4px',
          textContent: e.message,
        })
      );
      var retryBtn = _el('button', {
        className: 'btn btn-o',
        style: 'margin-top:8px',
        textContent: '다시 시도',
      });
      retryBtn.dataset.action = 'retry-rate';
      rlErr.appendChild(retryBtn);
      rlSec.appendChild(rlErr);
    });
}

ACTIONS['rate-range'] = function (el) {
  var lbl = document.getElementById('rate-label-' + el.dataset.ep);
  if (lbl) lbl.textContent = el.value + '회';
};
ACTIONS['save-rate'] = function (el) {
  var ep = el.dataset.ep;
  var section = document.getElementById('rc-' + ep);
  if (!section) return;
  var rangeEl = section.querySelector('input[data-field="max_requests"]');
  var windowEl = section.querySelector('select[data-field="window_seconds"]');
  var maxReq = parseInt(rangeEl.value);
  var windowSec = parseInt(windowEl.value);
  el.disabled = true;
  el.textContent = '저장 중...';
  adminFetch('/admin/rate-config', {
    method: 'POST',
    body: JSON.stringify({ endpoint: ep, max_requests: maxReq, window_seconds: windowSec }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d.error) {
        toast(d.error, 'err');
      } else {
        toast((_epLabels[ep] || ep) + ' Rate Limit 저장 완료');
      }
      el.disabled = false;
      el.textContent = '저장';
    })
    .catch(function (e) {
      toast('저장 실패: ' + e.message, 'err');
      el.disabled = false;
      el.textContent = '저장';
    });
};
ACTIONS['retry-rate'] = function () {
  loadRateConfig();
};
ACTIONS['activate-demo'] = function () {
  var uid = $('demoUserSelect').value;
  if (!uid) {
    toast('유저를 선택하세요', 'err');
    return;
  }
  var hours = parseInt($('demoHours').value) || 3;
  adminFetch('/admin/demo-bypass', {
    method: 'POST',
    body: JSON.stringify({ user_id: uid, hours: hours, note: '웨비나 데모' }),
  })
    .then(function (r) {
      if (!r.ok) throw new Error('서버 준비 중');
      return r.json();
    })
    .then(function (d) {
      if (d.error) {
        toast('데모 모드 서버 준비 중입니다.', 'err');
      } else {
        toast(hours + '시간 데모 모드 활성화');
        loadDemoBypass();
      }
    })
    .catch(function () {
      toast('데모 모드 서버 준비 중입니다.', 'err');
    });
};
ACTIONS['deactivate-demo'] = function (el) {
  adminFetch('/admin/demo-bypass', {
    method: 'DELETE',
    body: JSON.stringify({ user_id: el.dataset.uid }),
  })
    .then(function (r) {
      if (!r.ok) throw new Error('서버 준비 중');
      return r.json();
    })
    .then(function () {
      toast('데모 모드 해제');
      loadDemoBypass();
    })
    .catch(function () {
      toast('데모 모드 서버 준비 중입니다.', 'err');
    });
};
