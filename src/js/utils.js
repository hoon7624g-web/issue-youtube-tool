// ═══════════════════════════════════════
// utils.js — 유틸리티 함수 (ES Module)
// ═══════════════════════════════════════

export function $(id) { return document.getElementById(id); }

export function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// AI 응답에서 깨진 문자 정리
// P2-18: keepEmoji 옵션 — 숏폼 대본에서는 이모지 유지 가능
export function cleanAI(s, keepEmoji) {
  if (!s) return '';
  let result = s
    .replace(/[\uFFFD\u25C6\u25C7\u25C8\u25C9\u25CA\u25CB\u25CF\u25B6\u25B7\u25BA\u25BB\u2B1B\u2B1C\u25A0\u25A1\u25A2\u25AA\u25AB\u2588\u2022\u25E6\u2023\u2043]/g, '')  // 깨진 문자/특수 도형/불릿 기호
    .replace(/\u200B/g, '');  // 제로폭 공백
  if (!keepEmoji) {
    result = result
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')  // 이모지 블록 전체
      .replace(/[\u{2600}-\u{27BF}]/gu, '')  // 기타 기호
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')  // 변이 선택자
      .replace(/[\u{E0020}-\u{E007F}]/gu, '');  // 태그 문자
  }
  return result
    .replace(/\*{2,}/g, '')  // 마크다운 볼드 **
    .replace(/^#{1,6}\s/gm, '')  // 마크다운 헤더
    .replace(/^[\s]*[-*]\s(?=\S)/gm, '')  // 마크다운 리스트 기호
    .replace(/^\s+/gm, m => { return m.replace(/[^\n ]/g, ''); })  // 비정상 공백
    .replace(/\n{3,}/g, '\n\n')  // 과도한 줄바꿈
    .trim();
}

// URL 안전성 검증 (href, src에 외부 값 삽입 전 필수)
export function safeUrl(raw, allowedHosts) {
  try {
    const u = new URL(raw);
    if (!['https:', 'blob:', 'data:'].includes(u.protocol)) return '';
    if (allowedHosts && allowedHosts.length && u.protocol === 'https:') {
      const ok = allowedHosts.some(host => {
        return u.hostname === host || u.hostname.endsWith('.' + host);
      });
      if (!ok) return '';
    }
    return u.toString();
  } catch(e) {
    return '';
  }
}

export function fmt(n) {
  return n >= 10000 ? (n / 10000).toFixed(1) + '만'
    : n >= 1000 ? (n / 1000).toFixed(1) + 'K'
    : String(n);
}

export function toast(m, t) {
  const w = $('tw'), d = document.createElement('div');
  d.className = 'tst tst-' + (t || 'ok');
  const icon = document.createElement('span');
  icon.className = 'tst-i';
  icon.textContent = t === 'err' ? '✕' : '✓';
  d.appendChild(icon);
  d.appendChild(document.createTextNode(m));
  w.appendChild(d);
  setTimeout(() => { d.remove(); }, TIMING.TOAST_DURATION);
}

// P3-12: 순수 대기 (retry backoff 등 정확한 지연이 필요한 곳)
export function wait(ms) {
  return new Promise(r => { setTimeout(r, ms); });
}

// P3-12: Mock API용 자연스러운 지연 (0~300ms 랜덤 추가)
export function mockWait(ms) {
  return new Promise(r => { setTimeout(r, ms + Math.random() * 300); });
}

export function b64toBlob(b64, type) {
  const bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: type || 'audio/mp3' });
}

export function fmtB(b) {
  return b >= 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';
}

// ── 영상 분류 ──
export const NEWS_CH = ['KBS','MBC','SBS','JTBC','MBN','TV조선','YTN','연합뉴스','뉴스','채널A','CBS','한국경제TV','매일경제','조선일보','중앙일보','한겨레','경향신문'];
export const BREAKING_KW = ['속보','긴급','실시간','브리핑','단독','생중계','현장','기자회견','발표'];
export const PLANNED_KW = ['분석','정리','이유','비밀','진짜','총정리','심층','비교','논란','정체','충격','반전','전망','예측','해설','요약','팩트','검증','리뷰'];
export function isNews(name) { return NEWS_CH.some(n => { return name.indexOf(n) !== -1; }); }
export function isBreaking(title) { return BREAKING_KW.some(k => { return title.indexOf(k) !== -1; }); }
export function isPlanned(title) { return PLANNED_KW.some(k => { return title.indexOf(k) !== -1; }); }

export function scoreVids(vids) {
  const mx = Math.max.apply(null, vids.map(v => { return v.views; }).concat([1]));
  return vids.map(v => {
    const ratio = v.subs > 0 ? Math.min(v.views / v.subs, 100) / 100 : 0;
    const raw = (v.views / mx * 0.3) + (ratio * 0.4);
    const news = isNews(v.ch), breaking = isBreaking(v.title);
    const newsMulti = news ? 0.25 : (breaking ? 0.5 : 1);
    const planned = isPlanned(v.title);
    const plannedMulti = planned ? 1.3 : 1;
    let subMulti = 1;
    if (v.subs < 10000 && v.views > 50000) subMulti = 2.0;
    else if (v.subs < 50000 && v.views > 30000) subMulti = 1.7;
    else if (v.subs < 100000 && v.views > 50000) subMulti = 1.4;
    else if (v.subs > 500000) subMulti = 0.7;
    v.score = Math.round(raw * newsMulti * plannedMulti * subMulti * 100);
    v.news = news;
    v.planned = planned;
    // 2-2: 점수 근거 생성 (수강생 친화적 문구)
    const reasons = [];
    const r2 = v.subs > 0 ? (v.views / v.subs) : 0;
    if (r2 > 10) reasons.push('구독자 대비 조회수가 ' + r2.toFixed(0) + '배 — 폭발적 성장');
    else if (r2 > 3) reasons.push('구독자 대비 조회수 높음 (' + r2.toFixed(1) + '배)');
    if (news) reasons.push('뉴스 채널이라 참고용으로만 적합');
    if (planned) reasons.push('분석·정리형 기획 콘텐츠 — 벤치마킹에 적합');
    if (subMulti >= 1.7) reasons.push('작은 채널인데 조회수가 높아요 — 콘텐츠 자체가 강함');
    else if (subMulti >= 1.4) reasons.push('중소 채널 대비 조회수 양호');
    else if (subMulti <= 0.7) reasons.push('대형 채널이라 조회수 당연히 높음 — 감점');
    if (!reasons.length) reasons.push('조회수와 구독자 기반으로 산정');
    v.scoreReason = reasons.join(' · ');
    return v;
  }).sort((a, b) => { return b.score - a.score; });
}

export const STEPS = [
  { n: 1, l: '라이선스 인증' }, { n: 2, l: '키워드 선택' }, { n: 3, l: '영상 리스트' },
  { n: 4, l: '영상 선택' }, { n: 5, l: '영상 분석' }, { n: 6, l: '스크립트 생성' },
  { n: 7, l: '팩트 검증' }, { n: 8, l: '풋티지 브리프' }, { n: 9, l: '음성 생성' },
  { n: 10, l: '결과 확인' }
];

export const PROG_MSG = [
  '키워드를 선택해주세요', '키워드 기반으로 영상을 검색합니다', '분석할 영상을 선택하세요',
  '선택한 영상을 확인합니다', 'AI가 영상을 분석합니다', '스타일을 선택하고 대본을 생성합니다',
  '허위사실을 검증합니다', '장면별 풋티지를 추천합니다', 'AI 음성을 생성합니다',
  '모든 작업이 완료되었습니다'
];

// ── JSON 추출 ──
export function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // 마크다운 코드블록 제거 (```json, ```JSON, ``` 등)
  const clean = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
  // 1) 전체 문자열 파싱 시도
  try { return JSON.parse(clean); } catch(e) {}
  // 2) Progressive scanning: 모든 { 와 [ 위치를 수집 → earliest 순으로 depth-matching + JSON.parse 시도
  const candidates = [];
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{' || clean[i] === '[') candidates.push(i);
  }
  for (const s of candidates) {
    const opener = clean[s];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0, end = -1;
    let inStr = false, esc = false;
    for (let i = s; i < clean.length; i++) {
      const ch = clean[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === opener) depth++;
      else if (ch === closer) { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > s) {
      try { return JSON.parse(clean.substring(s, end)); } catch(e) { /* 다음 후보로 */ }
    }
  }
  return null;
}

// ── 취소 가능한 AI 작업 ──
export const _aiCancel = { cancelled: false, token: 0, controller: null };
export function cancelAI() {
  _aiCancel.cancelled = true;
  _aiCancel.token++;
  try { if (_aiCancel.controller) _aiCancel.controller.abort(); } catch(e) {}
  toast('작업을 취소했습니다');
}
// 3-1: CANCEL_BTN을 DOM 빌더로 전환 (innerHTML 제거)
export function buildCancelBtn() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'text-align:center;margin-top:16px';
  const btn = document.createElement('button');
  btn.className = 'btn bs cancelAI-trigger';
  btn.style.cssText = 'font-size:12px;color:var(--t3)';
  btn.textContent = '\u2715 취소';
  wrap.appendChild(btn);
  return wrap;
}
// 하위 호환: 기존 CANCEL_BTN 참조가 남아있을 경우
export const CANCEL_BTN = '';
// cancelAI 바인딩: 이벤트 위임으로 처리 (class 기반)
document.addEventListener('click', e => {
  if (e.target.classList.contains('cancelAI-trigger')) cancelAI();
});

export function withTimeout(taskOrPromise, ms, msg) {
  _aiCancel.cancelled = false;
  const token = ++_aiCancel.token;
  const controller = new AbortController();
  _aiCancel.controller = controller;

  return new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    let checker = null;
    function finish(fn, v) {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (checker) clearInterval(checker);
      if (_aiCancel.controller === controller) _aiCancel.controller = null;
      fn(v);
    }

    let promise;
    try {
      promise = typeof taskOrPromise === 'function' ? taskOrPromise(controller.signal) : taskOrPromise;
    } catch (e) {
      finish(reject, e);
      return;
    }
    Promise.resolve(promise).then(r => {
      if (controller.signal.aborted) {
        finish(reject, new Error('사용자가 작업을 취소했습니다.'));
        return;
      }
      finish(resolve, r);
    }).catch(e => { finish(reject, e); });

    timer = setTimeout(() => {
      try { controller.abort(); } catch(e) {}
      finish(reject, new Error(msg || '요청 시간이 초과되었습니다 (' + (ms / 1000) + '초). 다시 시도해주세요.'));
    }, ms);
    checker = setInterval(() => {
      if (controller.signal.aborted) {
        try { controller.abort(); } catch(e) {}
        finish(reject, new Error('사용자가 작업을 취소했습니다.'));
      }
    }, 300);
  });
}


export function mergeAbortSignals(...signals) {
  const list = signals.flat().filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(list);
  }
  const controller = new AbortController();
  const cleanups = [];
  const abortFrom = (sig) => {
    if (controller.signal.aborted) return;
    try {
      if (sig && 'reason' in sig) controller.abort(sig.reason);
      else controller.abort(new Error('aborted'));
    } catch (e) {
      try { controller.abort(); } catch (_) {}
    }
    cleanups.splice(0).forEach(fn => {
      try { fn(); } catch (_) {}
    });
  };
  for (const sig of list) {
    if (!sig) continue;
    if (sig.aborted) {
      abortFrom(sig);
      break;
    }
    const onAbort = () => { abortFrom(sig); };
    sig.addEventListener('abort', onAbort, { once: true });
    cleanups.push(() => { sig.removeEventListener('abort', onAbort); });
  }
  return controller.signal;
}

// ── 에러 메시지 한글화 ──
export function friendlyError(e) {
  const m = (e && e.message) || String(e || '');
  if (m === 'Failed to fetch' || m.indexOf('NetworkError') !== -1 || m.indexOf('net::') !== -1)
    return '인터넷 연결을 확인해주세요. 네트워크가 불안정하거나 서버에 접속할 수 없습니다.';
  if (m.indexOf('ENOTFOUND') !== -1 || m.indexOf('ECONNREFUSED') !== -1)
    return '인터넷 연결을 확인해주세요. 서버에 접속할 수 없습니다.';
  if (m.indexOf('CERT_HAS_EXPIRED') !== -1 || m.indexOf('UNABLE_TO_VERIFY') !== -1 || m.indexOf('certificate') !== -1)
    return '보안 인증서 문제가 발생했습니다. 네트워크 환경(VPN, 프록시 등)을 확인해주세요.';
  if (m.indexOf('timeout') !== -1 || m.indexOf('시간이 초과') !== -1) return m;
  if (m.indexOf('UNTRUSTED_SENDER') !== -1) return '보안 오류가 발생했습니다. 앱을 재시작해주세요.';
  if (m.indexOf('AUTH_REQUIRED') !== -1) return '로그인이 필요합니다. 다시 로그인해주세요.';
  if (m.indexOf('APPROVAL_PENDING') !== -1) return '관리자 승인 대기 중입니다. 승인 완료 후 안내드립니다.';
  if (m.indexOf('RATE_LIMIT') !== -1 || m.indexOf('한도 초과') !== -1)
    return '요청이 너무 많습니다. 1~2분 후 다시 시도해주세요.';
  if (m.indexOf('NOT_ADMIN') !== -1) return '관리자 권한이 없습니다.';
  if (m.indexOf('model not found') !== -1 || m.indexOf('Model not found') !== -1 || m.indexOf('not found for API') !== -1)
    return 'AI 모델을 찾을 수 없습니다. 앱을 최신 버전으로 업데이트해주세요.';
  if (m.indexOf('billing') !== -1 || m.indexOf('Billing') !== -1 || m.indexOf('payment') !== -1)
    return 'API 결제 설정이 필요합니다. API 키 발급 가이드를 참고해주세요.';
  if (/HTTP\s*401/i.test(m)) return '인증이 만료되었습니다. 로그아웃 후 다시 로그인해주세요.';
  if (/HTTP\s*403/i.test(m)) return '접근 권한이 없습니다. API 키가 올바른지 확인해주세요.';
  if (/HTTP\s*404/i.test(m)) return '요청한 리소스를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.';
  if (/HTTP\s*429/i.test(m)) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
  if (/HTTP\s*5\d\d/i.test(m)) return '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  if (m.indexOf('API key') !== -1 || m.indexOf('api_key') !== -1 || m.indexOf('MISSING_KEY') !== -1)
    return 'API 키가 올바르지 않습니다. 설정에서 키를 확인해주세요.';
  if (m.indexOf('quota') !== -1 || m.indexOf('Quota') !== -1)
    return 'API 무료 한도를 초과했습니다. 내일 오후 4시경에 초기화됩니다. API 콘솔에서 한도를 확인할 수 있습니다.';
  if (m.indexOf('overloaded') !== -1 || m.indexOf('capacity') !== -1)
    return 'AI 서버가 현재 과부하 상태입니다. 1~2분 후 다시 시도해주세요.';
  if (m.indexOf('content_filter') !== -1 || m.indexOf('safety') !== -1)
    return 'AI가 콘텐츠를 생성하지 못했습니다. 다른 키워드나 영상으로 시도해보세요.';
  if (m.indexOf('JSON') !== -1 || m.indexOf('parse') !== -1 || m.indexOf('Unexpected token') !== -1)
    return 'AI 응답을 처리하지 못했습니다. "다시 시도" 버튼을 눌러주세요.';
  if (m.indexOf('INVALID_ARG') !== -1) return '입력값이 올바르지 않습니다. 내용을 확인 후 다시 시도해주세요.';
  if (m.indexOf('Response too large') !== -1) return '응답 데이터가 너무 큽니다. 다시 시도해주세요.';
  if (/[가-힣]/.test(m)) return m;
  return '오류가 발생했습니다. 다시 시도해주세요.';
}

// ── 진행도 트래커 ──
export function createProgress(containerId, title, steps, estimatedSec) {
  const container = document.getElementById(containerId); if (!container) return null;
  const startTime = Date.now();
  let currentStep = 0;
  let completed = false;
  let statusMsg = '';  // P1-9: 마이크로 피드백 메시지
  const totalSteps = Array.isArray(steps) ? steps.length : 0;
  const stepLabels = Array.isArray(steps) ? steps.map(s => String(s || '')) : [];

  function fmtElapsed() {
    const sec = Math.round((Date.now() - startTime) / 1000);
    if (sec < 60) return sec + '초 경과';
    return Math.floor(sec / 60) + '분 ' + (sec % 60) + '초 경과';
  }

  function render() {
    if (!container || !container.parentNode) return;
    container.textContent = '';

    const realPct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;
    const displayPct = completed ? 100 : realPct;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'max-width:480px;margin:0 auto;padding:32px 0';

    // 타이틀
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:24px';
    const h = document.createElement('div');
    h.style.cssText = 'font-size:16px;font-weight:600;color:var(--t1);margin-bottom:8px';
    h.textContent = title || '';
    header.appendChild(h);
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:12px;color:var(--t3);margin-top:4px';
    const elapsed = fmtElapsed();
    const estText = (estimatedSec && !completed) ? ' · 보통 ' + (estimatedSec < 60 ? estimatedSec + '초' : Math.round(estimatedSec / 60) + '분') + ' 소요' : '';
    sub.textContent = completed ? '완료!' : elapsed + ' · ' + currentStep + '/' + totalSteps + ' 단계' + estText + (statusMsg ? ' · ' + statusMsg : '');
    header.appendChild(sub);
    wrap.appendChild(header);

    // 프로그레스 바
    const barOuter = document.createElement('div');
    barOuter.style.cssText = 'height:12px;background:var(--bg3);border-radius:6px;overflow:hidden;margin-bottom:24px;position:relative';
    const barInner = document.createElement('div');
    if (completed) {
      barInner.style.cssText = 'height:100%;background:linear-gradient(90deg,var(--grn),#2ecc71);border-radius:6px;width:100%;transition:width .6s ease-out';
    } else {
      barInner.style.cssText = 'height:100%;background:linear-gradient(90deg,var(--acc),#2563EB);border-radius:6px;width:' + Math.max(displayPct, 5) + '%;transition:width .6s ease-out;background-size:200% 100%;animation:progShimmer 1.5s ease-in-out infinite';
    }
    barOuter.appendChild(barInner);
    wrap.appendChild(barOuter);

    // 스텝 리스트
    const stepBox = document.createElement('div');
    stepBox.style.cssText = 'background:var(--bg);border-radius:var(--r2);padding:12px 16px';
    stepLabels.forEach((s, i) => {
      const icon = i < currentStep ? '✓' : i === currentStep ? '●' : '○';
      const color = i < currentStep ? 'var(--grn)' : i === currentStep ? 'var(--acc)' : 'var(--t4)';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0' + (i < stepLabels.length - 1 ? ';border-bottom:1px solid var(--bdr)' : '');
      const dot = document.createElement('div');
      dot.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + (i < currentStep ? 'rgba(13,146,84,.12)' : i === currentStep ? 'rgba(255,71,87,.12)' : 'var(--bg2)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:' + color;
      dot.textContent = icon;
      row.appendChild(dot);
      const label = document.createElement('div');
      label.style.cssText = 'flex:1;font-size:13px;color:' + (i <= currentStep ? 'var(--t1)' : 'var(--t4)') + ';font-weight:' + (i === currentStep ? '600' : '400');
      label.textContent = s;
      row.appendChild(label);
      if (i < currentStep) {
        const done = document.createElement('span');
        done.style.cssText = 'font-size:11px;color:var(--grn)';
        done.textContent = '완료';
        row.appendChild(done);
      } else if (i === currentStep && !completed) {
        const prog = document.createElement('span');
        prog.style.cssText = 'font-size:11px;color:var(--acc)';
        prog.textContent = '진행 중';
        row.appendChild(prog);
      }
      stepBox.appendChild(row);
    });
    wrap.appendChild(stepBox);

    // 취소 버튼 (DOM 기반)
    wrap.appendChild(buildCancelBtn());

    container.appendChild(wrap);
  }

  // shimmer 애니메이션 → main.css로 이동 완료

  render();

  // 경과 시간만 업데이트 (가짜 % 없음)
  const timer = setInterval(() => {
    if (completed || !container || !container.parentNode) { clearInterval(timer); return; }
    render();
  }, 1000);

  return {
    nextStep: () => {
      if (currentStep < stepLabels.length) currentStep++;
      statusMsg = '';
      render();
    },
    // P1-9: 마이크로 피드백 — 현재 스텝 진행 상태 메시지 업데이트
    updateMessage: (msg) => {
      statusMsg = msg || '';
      render();
    },
    // P1-9: 현재 진행 중인 스텝 라벨 동적 변경
    updateStepLabel: (stepIdx, newLabel) => {
      if (stepIdx >= 0 && stepIdx < stepLabels.length) {
        stepLabels[stepIdx] = newLabel;
        render();
      }
    },
    complete: () => {
      completed = true;
      clearInterval(timer);
      currentStep = stepLabels.length;
      render();
    },
    fail: () => {
      completed = true;
      clearInterval(timer);
    },
    destroy: () => {
      completed = true;
      clearInterval(timer);
    }
  };
}

// ── 공통 DOM 헬퍼 ──
export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(k => {
      if (k === 'style' && typeof attrs[k] === 'string') node.style.cssText = attrs[k];
      else if (k === 'className') node.className = attrs[k];
      else if (k === 'textContent') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (!c) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }
  return node;
}

// ── 풋티지 라벨 색상 ──
export const LABEL_COLORS = { 후킹: '#DC2626', 사건설명: '#2563EB', 인물소개: '#7C3AED', 배경설명: '#059669', 핵심주장: '#D97706', 숫자강조: '#0891B2', 긴장감: '#DC2626', 전환: '#6B7280', 마무리: '#059669' };

// ── window 노출 (인라인 HTML onclick용) ──


// ── 타임아웃 상수 (ms) ──
export const TIMEOUT = {
  ANALYSIS: 600000,
  ANALYSIS_VIDEO: 600000,
  SCRIPT: 600000,
  SCRIPT_SHORTS: 300000,
  FACTCHECK: 180000,
  VOICE: 180000,
  VOICE_PER_CHUNK: 60000,
};

// ── UI 타이밍 상수 (ms) — setTimeout 매직 넘버 중앙화 ──
export const TIMING = {
  TOAST_DURATION: 3500,        // 토스트 자동 닫힘
  TRANSITION_SHORT: 300,       // 짧은 전환 (검증 딜레이, 저장 debounce)
  TRANSITION_MEDIUM: 600,      // 중간 전환 (단계 이동, 결과 표시)
  TRANSITION_LONG: 800,        // 긴 전환 (분석 완료 → 결과 렌더)
  FOCUS_DELAY: 200,            // 포커스 이동 지연
  FALLBACK_DELAY: 2000,        // fallback 전환 대기
  AUTO_HIDE_KEY: 5000,         // API 키 보기 자동 숨김
  MICRO_FEEDBACK: 3000,        // 마이크로 피드백 업데이트 주기
};

// ── 네트워크 상태 확인 ──
export function isOnline() { return navigator.onLine; }

// ── 커스텀 확인 모달 (confirm() 대체) ──
export function confirmModal(message, { confirmText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise(resolve => {
    // 오버레이
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:cmFadeIn .15s ease';
    // 모달 박스
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--white,#fff);border-radius:16px;padding:28px 24px 20px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:cmSlideIn .2s ease';
    // 아이콘
    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:16px;' + (danger ? 'background:var(--red-bg,rgba(201,42,42,.1));color:var(--red,#c92a2a)' : 'background:rgba(37,99,235,.08);color:#2563EB');
    iconEl.textContent = danger ? '⚠' : 'ℹ';
    box.appendChild(iconEl);
    // 메시지
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;line-height:1.7;color:var(--t1,#111);white-space:pre-line;margin-bottom:20px';
    msg.textContent = message;
    box.appendChild(msg);
    // 버튼 행
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn bs';
    cancelBtn.style.cssText = 'padding:10px 20px;font-size:13px;font-weight:500';
    cancelBtn.textContent = cancelText;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn ' + (danger ? 'btn-danger' : 'bp');
    confirmBtn.style.cssText = 'padding:10px 20px;font-size:13px;font-weight:600' + (danger ? ';background:var(--red,#c92a2a);color:#fff;border-color:var(--red,#c92a2a)' : '');
    confirmBtn.textContent = confirmText;
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    // 모달 애니메이션 → main.css로 이동 완료
    document.body.appendChild(overlay);
    confirmBtn.focus();
    // 핸들러
    function close(result) { overlay.remove(); resolve(result); }
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', handler); close(false); }
    });
  });
}

// ── 커스텀 입력 모달 (prompt() 대체) ──
export function promptModal(message, { placeholder = '', confirmText = '확인', cancelText = '취소', inputType = 'password' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:cmFadeIn .15s ease';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--white,#fff);border-radius:16px;padding:28px 24px 20px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2);animation:cmSlideIn .2s ease';
    // 아이콘
    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:16px;background:rgba(37,99,235,.08);color:#2563EB';
    iconEl.textContent = '\uD83D\uDD11';
    box.appendChild(iconEl);
    // 메시지
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;line-height:1.7;color:var(--t1,#111);white-space:pre-line;margin-bottom:16px';
    msg.textContent = message;
    box.appendChild(msg);
    // 입력 필드
    const input = document.createElement('input');
    input.className = 'inp';
    input.type = inputType;
    input.placeholder = placeholder || '';
    input.style.cssText = 'width:100%;margin-bottom:8px;font-size:14px';
    box.appendChild(input);
    // 에러 표시 영역
    const errEl = document.createElement('div');
    errEl.style.cssText = 'font-size:12px;color:var(--red,#c92a2a);margin-bottom:12px;min-height:18px';
    box.appendChild(errEl);
    // 버튼 행
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn bs';
    cancelBtn.style.cssText = 'padding:10px 20px;font-size:13px;font-weight:500';
    cancelBtn.textContent = cancelText;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn bp';
    confirmBtn.style.cssText = 'padding:10px 20px;font-size:13px;font-weight:600';
    confirmBtn.textContent = confirmText;
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
    // 핸들러
    function close(val) { overlay.remove(); resolve(val); }
    cancelBtn.addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => {
      const val = input.value;
      if (!val) { errEl.textContent = '값을 입력해주세요'; input.focus(); return; }
      close(val);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmBtn.click();
      errEl.textContent = '';
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', handler); close(null); }
    });
  });
}
