// ═══════════════════════════════════════
// ui.js — UI 관리 (ES Module)
// ═══════════════════════════════════════
import { $, esc, fmt, toast, safeUrl, el, STEPS, PROG_MSG, friendlyError, confirmModal } from './utils.js';
import { S, sSet, sGo, sNext, sResetAll, loadProgress } from './state.js';
import { K } from './constants.js';
import { Api, smartDedup } from './api.js';
import { CONFIG } from '../config.js';
import { DeviceNotice } from './components.js';
import {
  getApiKeys, clearSession, authLogin, authSignup, hasApiKeys, clearRefreshInterval,
  resolveProvider
} from '../client-proxy.js';
import { runStep, runAction } from './router.js';
import { shared } from './shared.js';
import { mountThumbnailTab } from './thumbnail/thumbnail-tab.js';

// ── 영상 리스트 렌더링 (DOM 기반) ──
export function renderVidList(vs) {
  const vl = $('vl');
  vl.textContent = '';
  vs.forEach((v, idx) => {
    const sc = v.score >= 90 ? 'var(--grn)' : v.score >= 70 ? 'var(--yel)' : 'var(--red)';
    const r = v.subs > 0 ? (v.views / v.subs).toFixed(1) : '-';

    const card = document.createElement('div');
    card.className = 'vc';
    card.dataset.id = v.id;

    // 썸네일
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'vt';
    if (v.thumb) {
      const safeSrc = safeUrl(v.thumb);
      if (safeSrc) {
        const img = document.createElement('img');
        img.src = safeSrc;
        thumbDiv.appendChild(img);
      } else {
        thumbDiv.textContent = '\u25B6';
      }
    } else {
      thumbDiv.textContent = '\u25B6';
    }
    card.appendChild(thumbDiv);

    // 정보
    const info = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:5px;line-height:1.4;letter-spacing:-.2px';
    h3.textContent = v.title || '';
    info.appendChild(h3);

    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap';
    const chSpan = document.createElement('span');
    chSpan.style.cssText = 'font-size:12px;color:var(--t2);font-weight:500';
    chSpan.textContent = v.ch || '';
    metaRow.appendChild(chSpan);
    // 상위 3개 추천 배지
    if (idx < 3 && v.score >= 70) { const b = document.createElement('span'); b.className = 'bdg ba'; b.style.cssText = 'font-size:10px;padding:2px 8px'; b.textContent = '추천'; metaRow.appendChild(b); }
    if (v.news) { const b = document.createElement('span'); b.className = 'bdg by'; b.textContent = '뉴스'; metaRow.appendChild(b); }
    if (v.planned) { const b = document.createElement('span'); b.className = 'bdg'; b.style.cssText = 'background:rgba(139,92,246,.1);color:#8B5CF6'; b.textContent = '기획형'; metaRow.appendChild(b); }
    if (parseFloat(r) > 10) { const b = document.createElement('span'); b.className = 'bdg bg2'; b.textContent = '언더독'; metaRow.appendChild(b); }
    if (v.durText) { const b = document.createElement('span'); b.className = 'bdg'; b.style.cssText = 'background:rgba(107,114,128,.1);color:#6B7280;font-family:var(--mono)'; b.textContent = v.durText; metaRow.appendChild(b); }
    if (v.durSec >= 1200) { const b = document.createElement('span'); b.className = 'bdg'; b.style.cssText = 'background:rgba(220,38,38,.1);color:#DC2626;font-size:10px'; b.textContent = '20분+ 분석 시간 김'; metaRow.appendChild(b); }
    info.appendChild(metaRow);

    // P1-7: 추천 이유 한 줄 (전체 카드에 표시)
    const reasons = [];
    if (parseFloat(r) > 10) reasons.push('구독 대비 조회수 강함');
    else if (parseFloat(r) > 3) reasons.push('조회수 성장성 양호');
    if (v.planned) reasons.push('기획형 주제');
    if (!v.news && v.score >= 80) reasons.push('비뉴스 고득점');
    if (v.news) reasons.push('시의성 있는 뉴스');
    if (reasons.length) {
        const reasonEl = document.createElement('div');
        reasonEl.style.cssText = 'font-size:11px;color:var(--acc);margin-bottom:4px;font-weight:500';
        reasonEl.textContent = '\uD83D\uDCA1 ' + reasons.join(' · ');
        info.appendChild(reasonEl);
      }

    const statRow = document.createElement('div');
    statRow.style.cssText = 'display:flex;gap:12px;font-size:12px;color:var(--t3)';
    statRow.appendChild(Object.assign(document.createElement('span'), { textContent: '\u25B6 ' + fmt(v.views) }));
    statRow.appendChild(Object.assign(document.createElement('span'), { textContent: '구독 ' + fmt(v.subs) }));
    statRow.appendChild(Object.assign(document.createElement('span'), { textContent: '구독 대비 ' + r + '배' }));
    info.appendChild(statRow);
    card.appendChild(info);

    // 점수
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'vs';
    scoreDiv.style.cssText = 'background:' + sc + '12;color:' + sc;
    scoreDiv.textContent = String(v.score);
    scoreDiv.title = v.scoreReason || '조회수 × 구독자 대비 성장성 기반';
    card.appendChild(scoreDiv);

    vl.appendChild(card);
  });
  vl.onclick = e => {
    const c2 = e.target.closest('.vc'); if (!c2) return;
    const v = S.search.vids.find(x => { return x.id === c2.dataset.id; });
    sSet({ [K.VIDEO_SV]: v }); sNext();
  };
}

let _currentSearchId = 0;
export function filterDuration(dur) {
  document.querySelectorAll('[data-dur]').forEach(x => { x.classList.remove('on'); });
  const btn = document.querySelector('[data-dur="' + dur + '"]'); if (btn) btn.classList.add('on');
  sSet({ [K.SEARCH_FILTER_DURATION]: dur });
  const vl = $('vl');
  vl.textContent = '';
  const ldDiv = el('div', { className: 'ld' });
  ldDiv.appendChild(el('div', { className: 'sp' }));
  ldDiv.appendChild(document.createTextNode((dur === 'long' ? '롱폼' : dur === 'short' ? '숏폼' : '전체') + ' 영상을 검색하고 있습니다...'));
  vl.appendChild(ldDiv);
  const searchKws = S.search.skw;
  const searchId = ++_currentSearchId;
  Api.getVids(smartDedup(searchKws.map(k => { return k.label; })), dur, S.search.filterPeriod || '7d').then(vs => {
    if (searchId !== _currentSearchId) return;
    sSet({ [K.SEARCH_VIDS]: vs }); renderVidList(vs);
  }).catch(e => {
    if (searchId !== _currentSearchId) return;
    $('vl').textContent = '';
    const errCard = document.createElement('div');
    errCard.className = 'cd';
    errCard.style.cssText = 'text-align:center;padding:24px';
    const errMsg = document.createElement('div');
    errMsg.style.cssText = 'font-size:14px;color:var(--red);margin-bottom:10px';
    errMsg.textContent = '영상 검색 실패: ' + friendlyError(e);
    errCard.appendChild(errMsg);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn bp';
    retryBtn.textContent = '다시 시도';
    retryBtn.addEventListener('click', () => { filterDuration(S.search.filterDuration || 'long'); });
    errCard.appendChild(retryBtn);
    $('vl').appendChild(errCard);
  });
}

// ── 사이드바 ──
// P1-5: 단계 그룹핑 (탐색 / AI 작업 / 마무리)
const STEP_GROUPS = [
  { label: '\uD83D\uDD0D 탐색', steps: [2, 3, 4], auto: false },
  { label: '\uD83E\uDD16 AI 작업', steps: [5, 6, 7], auto: true },
  { label: '\uD83C\uDFAC 마무리', steps: [8, 9, 10], auto: false }
];

export function buildSb() {
  const nav = $('sideNav');
  nav.textContent = '';

  STEP_GROUPS.forEach(group => {
    const groupHeader = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:10px 12px 4px;margin-top:4px' });
    groupHeader.appendChild(el('span', { style: 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t4)', textContent: group.label }));
    if (group.auto) {
      groupHeader.appendChild(el('span', { style: 'font-size:8px;padding:1px 6px;border-radius:4px;background:rgba(37,99,235,.08);color:var(--blu);font-weight:600;letter-spacing:.5px', textContent: '자동' }));
    }
    nav.appendChild(groupHeader);

    group.steps.forEach(stepNum => {
      const stepDef = STEPS.find(s => s.n === stepNum);
      if (!stepDef) return;
      const nv = el('div', { className: 'nv' });
      nv.dataset.s = String(stepDef.n);
      nv.appendChild(el('span', { className: 'sn', textContent: String(stepNum - 1) }));
      nv.appendChild(document.createTextNode(stepDef.l));
      nav.appendChild(nv);
    });
  });

  const extras = el('div', { style: 'border-top:1px solid var(--bdr);margin-top:12px;padding-top:12px' });
  const menuItems = [
    { id: 'btnThumbnail', icon: '🖼️', label: '썸네일', hint: '썸네일 생성기' },
    { id: 'btnHistory', icon: '📂', label: '히스토리', hint: 'ZIP 다운로드 시 저장' },
    { id: 'btnApiKeySetting', icon: '⚙️', label: 'API 키 설정', hint: '' },
    { id: 'btnMySettings', icon: '🎤', label: '내 설정', hint: '' }
  ];
  menuItems.forEach(m => {
    const nv = el('div', { className: 'nv', id: m.id, style: 'cursor:pointer;font-size:13px;color:var(--t3)' });
    nv.appendChild(el('span', { className: 'sn', style: 'background:var(--bg2);color:var(--t3)', textContent: m.icon }));
    const labelWrap = el('div', { style: 'display:flex;flex-direction:column;gap:1px' });
    labelWrap.appendChild(document.createTextNode(m.label));
    if (m.hint) {
      labelWrap.appendChild(el('span', { style: 'font-size:9px;color:var(--t4);line-height:1', textContent: m.hint }));
    }
    nv.appendChild(labelWrap);
    extras.appendChild(nv);
  });

  // 단축키 안내
  const shortcutHint = el('div', { style: 'margin-top:12px;padding:8px 12px;font-size:10px;color:var(--t4);line-height:1.6;border-top:1px solid var(--bdr)' });
  shortcutHint.appendChild(el('div', { style: 'font-weight:600;margin-bottom:2px', textContent: '\u2328\uFE0F 단축키' }));
  shortcutHint.appendChild(el('div', { textContent: 'Ctrl+\u2192/\u2190  단계 이동' }));
  shortcutHint.appendChild(el('div', { textContent: 'Ctrl+Enter  실행' }));
  extras.appendChild(shortcutHint);

  // P2-17: 기기 종속성 안내
  extras.appendChild(DeviceNotice());

  nav.appendChild(extras);

  nav.onclick = e => {
    const target = e.target.closest('.nv'); if (!target) return;
    if (target.id === 'btnThumbnail') {
      document.querySelectorAll('.pnl').forEach(p => p.classList.remove('on'));
      const tp = $('pThumbnail');
      if (tp) { tp.classList.add('on'); mountThumbnailTab(tp); }
      document.querySelectorAll('.nv').forEach(n => n.classList.remove('ac'));
      target.classList.add('ac');
      return;
    }
    if (target.id === 'btnHistory') {
      document.querySelectorAll('.nv').forEach(n => n.classList.remove('ac'));
      target.classList.add('ac');
      runAction('openHistory'); return;
    }
    if (target.id === 'btnApiKeySetting') {
      document.querySelectorAll('.nv').forEach(n => n.classList.remove('ac'));
      target.classList.add('ac');
      runAction('openApiKeySettings'); return;
    }
    if (target.id === 'btnMySettings') {
      document.querySelectorAll('.nv').forEach(n => n.classList.remove('ac'));
      target.classList.add('ac');
      runAction('openMySettings'); return;
    }
    if (!target.classList.contains('lk') && target.dataset.s) {
      const stepN = parseInt(target.dataset.s);
      // ★ 특수 패널(썸네일/히스토리/API키/내설정)이 열려 있으면 sGo가 same-step을 무시하므로 직접 복원
      const isSpecialPanelOpen = ['btnThumbnail', 'btnHistory', 'btnApiKeySetting', 'btnMySettings'].some(id => {
        const btn = $(id); return btn && btn.classList.contains('ac');
      });
      if (isSpecialPanelOpen && stepN === S.nav.step) {
        syncSb(); showP();
      } else {
        sGo(stepN);
      }
    }
  };
}

export function syncSb() {
  // ★ 스텝 이동 시 하단 메뉴 active 해제
  ['btnThumbnail', 'btnHistory', 'btnApiKeySetting', 'btnMySettings'].forEach(id => {
    const el = $(id); if (el) el.classList.remove('ac');
  });
  document.querySelectorAll('.nv[data-s]').forEach(el => {
    const n = parseInt(el.dataset.s); el.className = 'nv';
    if (n === S.nav.step) el.classList.add('ac');
    else if (n < S.nav.step) el.classList.add('dn');
    else if (n > S.nav.mx) el.classList.add('lk');
  });
  if (S.nav.step === 1) { $('app').classList.add('no-sb'); $('sidebar').style.display = 'none'; }
  else { $('app').classList.remove('no-sb'); $('sidebar').style.display = ''; }
  if (S.auth.user) $('uName').textContent = S.auth.user.name;
  // API badges
  const ab = $('apiBadges'); if (ab) {
    const keys = getApiKeys();
    // 2-5: 필수/선택 분리 요약
    const _resolvedLlm = resolveProvider(keys);
    const reqItems = [
      { label: 'YouTube', ok: !!keys.youtube },
      { label: _resolvedLlm === 'gemini' ? 'Gemini' : (_resolvedLlm === 'chatgpt' ? 'ChatGPT' : 'Claude'), ok: !!(keys.claude || keys.gemini || keys.openai) },
      { label: 'AI Studio', ok: !!(keys.googleAiStudio || keys.gemini) },
    ];
    const optItems = [];
    if (keys.tts) optItems.push('TTS');
    if (keys.elevenlabs) optItems.push('ElevenLabs');
    if (keys.pexels) optItems.push('Pexels');
    if (keys.perplexity) optItems.push('Perplexity');

    const reqOk = reqItems.filter(i => i.ok).length;
    const reqTotal = reqItems.length;
    ab.textContent = '';

    // 필수 상태 배지
    const reqBadge = el('span', {
      className: 'bdg',
      style: 'font-size:9px;padding:2px 8px;cursor:default;background:' + (reqOk === reqTotal ? 'rgba(13,146,84,.1)' : 'rgba(201,42,42,.1)') + ';color:' + (reqOk === reqTotal ? 'var(--grn)' : 'var(--red)'),
      textContent: reqOk === reqTotal ? '✓ 필수 준비 완료' : '필수 ' + reqOk + '/' + reqTotal + ' 미완료'
    });
    reqBadge.title = reqItems.map(i => (i.ok ? '✓' : '✕') + ' ' + i.label).join('\n');
    ab.appendChild(reqBadge);

    // 선택 기능 배지 (있을 때만)
    if (optItems.length) {
      const optBadge = el('span', {
        className: 'bdg',
        style: 'font-size:9px;padding:2px 8px;background:rgba(37,99,235,.06);color:var(--blu)',
        textContent: '+ ' + optItems.length + '개 선택 기능'
      });
      optBadge.title = optItems.join(', ');
      ab.appendChild(optBadge);
    }

    if (window.electronAPI && window.electronAPI.isElectron) {
      ab.appendChild(el('span', {
        className: 'bdg',
        style: 'font-size:9px;padding:2px 6px;background:rgba(13,146,84,.1);color:var(--grn)',
        textContent: '● Electron'
      }));
    }
  }
  const step = parseInt(S.nav.step) || 1;
  const pct = Math.round(Math.max(0, (step - 2)) / 8 * 100);
  const pf = $('progFill'); if (pf) pf.style.width = pct + '%';
  const pt = $('progText'); if (pt) pt.textContent = Math.max(0, step - 1) + '/9';
  const ps = $('progStatus'); if (ps) ps.textContent = PROG_MSG[Math.max(0, step - 2)] || '';
}

// ── 패널 전환 ──
export function showP() {
  document.querySelectorAll('audio').forEach(a => { a.pause(); a.currentTime = 0; });
  if (shared.previewAudio) { shared.previewAudio.pause(); shared.previewAudio = null; }
  if (shared.previewAnimId) { clearInterval(shared.previewAnimId); shared.previewAnimId = null; }
  document.querySelectorAll('.pnl').forEach(p => { p.classList.remove('on'); });
  const p = $('p' + S.nav.step); if (p) p.classList.add('on');
  runStep(S.nav.step);
}

export function restoreProgress() { return loadProgress(); }

export function buildPanels() {
  const main = $('main');
  main.textContent = '';
  STEPS.forEach(s => { main.appendChild(el('div', { className: 'pnl', id: 'p' + s.n })); });
  main.appendChild(el('div', { className: 'pnl', id: 'pThumbnail' }));
  renderLogin();
}

// ── 로그인 UI ──
export function renderLogin() {
  const p = $('p1'); if (!p) return;
  let mode = 'login';

  const LOGO_SRC = document.querySelector('.logo-icon img') ? document.querySelector('.logo-icon img').src : '';

  function _field(labelText, id, type, placeholder) {
    const f = el('div', { className: 'field' });
    f.appendChild(el('label', { textContent: labelText }));
    const inp = el('input', { className: 'inp', id: id });
    if (type) inp.type = type;
    inp.placeholder = placeholder || '';
    f.appendChild(inp);
    return f;
  }

  function _errBox(id) {
    return el('div', { id: id, style: 'color:var(--red);font-size:12px;margin-bottom:12px;display:none;padding:8px 12px;background:var(--red-bg);border-radius:var(--r)' });
  }

  function _linkBtn(id, text) {
    return el('button', { id: id, style: 'background:none;border:none;color:var(--acc);font-size:13px;cursor:pointer;font-family:var(--f);font-weight:500', textContent: text });
  }

  function render() {
    p.textContent = '';
    const wrap = el('div', { className: 'login-wrap' });
    const box = el('div', { className: 'login-card' });

    if (mode === 'login') {
      // 로고
      if (LOGO_SRC) {
        const logoWrap = el('div', { className: 'login-icon' });
        const logoIcon = el('div', { className: 'logo-icon' });
        const logoImg = el('img'); logoImg.src = LOGO_SRC; logoImg.width = 40; logoImg.height = 40;
        logoIcon.appendChild(logoImg);
        logoWrap.appendChild(logoIcon);
        box.appendChild(logoWrap);
      }

      box.appendChild(el('h2', { className: 'login-title', textContent: '유튜브도사 영상 제작 솔루션' }));
      box.appendChild(el('p', { className: 'login-sub', textContent: '수강생 전용' }));

      // 2-4: 앱 소개 feature 카드
      const feats = el('div', { className: 'login-features' });
      [
        { icon: '\uD83D\uDD0D', label: '이슈 키워드 발굴' },
        { icon: '\uD83D\uDCDD', label: 'AI 대본 생성' },
        { icon: '\u2705', label: '팩트 검증' },
        { icon: '\uD83C\uDFA4', label: 'AI 음성 합성' },
      ].forEach(f => {
        const feat = el('div', { className: 'login-feat' });
        feat.appendChild(el('span', { className: 'login-feat-icon', textContent: f.icon }));
        feat.appendChild(document.createTextNode(f.label));
        feats.appendChild(feat);
      });
      box.appendChild(feats);

      box.appendChild(_field('이메일', 'lEmail', 'email', 'example@email.com'));
      box.appendChild(_field('비밀번호', 'lPw', 'password', '비밀번호'));
      box.appendChild(_errBox('lerr'));

      const lbtn = el('button', { className: 'btn bp btn-lg', id: 'lbtn', style: 'width:100%;padding:14px;font-size:15px', textContent: '로그인' });
      lbtn.addEventListener('click', () => {
        lbtn.disabled = true; lbtn.textContent = '로그인 중...'; $('lerr').style.display = 'none';
        Api.login($('lEmail').value, $('lPw').value).then(u => {
          sSet({ [K.AUTH_USER]: u });
          const result = restoreProgress();
          if (result && result.restored) {
            syncSb(); showP();
            const stepName = (STEPS.find(s => s.n === S.nav.step) || {}).l || S.nav.step + '단계';
            if (result.needsRerun) {
              toast(stepName + '까지 복원됨 · 일부 데이터 누락으로 재실행이 필요합니다');
              sSet({ [K.NAV_STEP]: 5, [K.NAV_MX]: 5 });
              syncSb(); showP();
            } else if (result.capped) {
              toast(stepName + '까지 복원됨 · 음성/풋티지 결과는 다시 생성이 필요합니다');
            } else {
              toast(stepName + '까지 복원되었습니다 · 이어서 진행하세요');
            }
          }
          else { sSet({ [K.NAV_STEP]: 2, [K.NAV_MX]: 2 }); syncSb(); showP(); }
        }).catch(e => { const errMsg = friendlyError(e); let errText = errMsg;
          if (errMsg.includes('승인 대기')) errText = errMsg + '\n\n승인 완료 후 카카오톡 또는 이메일로 안내드립니다.';
          $('lerr').textContent = errText; $('lerr').style.display = 'block'; lbtn.disabled = false; lbtn.textContent = '로그인'; });
      });
      box.appendChild(lbtn);

      const switchP = el('p', { style: 'margin-top:16px;text-align:center' });
      const toSignup = _linkBtn('toSignup', '계정이 없으신가요? 가입하기');
      toSignup.addEventListener('click', () => { mode = 'signup'; render(); });
      switchP.appendChild(toSignup);
      box.appendChild(switchP);

      wrap.appendChild(box); p.appendChild(wrap);
      $('lPw').addEventListener('keydown', e => { if (e.key === 'Enter') lbtn.click(); });
      setTimeout(() => { const f = $('lEmail'); if (f) f.focus(); }, 200);

    } else {
      box.appendChild(el('h2', { className: 'login-title', textContent: '회원가입' }));
      box.appendChild(el('p', { className: 'login-sub', textContent: '가입 후 관리자 승인이 완료되면 이용할 수 있습니다' }));
      box.appendChild(_field('이름', 'sName', null, '홍길동'));
      box.appendChild(_field('이메일', 'sEmail', 'email', 'example@email.com'));
      box.appendChild(_field('비밀번호', 'sPw', 'password', '8자 이상, 영문+숫자 포함'));
      box.appendChild(_field('연락처', 'sPhone', null, '010-0000-0000'));
      box.appendChild(_field('기수', 'sCohort', null, '예: 시즌2-4기'));
      box.appendChild(_errBox('serr'));

      const sokBox = el('div', { id: 'sok', style: 'color:var(--grn);font-size:12px;margin-bottom:12px;display:none;padding:8px 12px;background:var(--grn-bg);border-radius:var(--r)' });
      box.appendChild(sokBox);

      const sbtn = el('button', { className: 'btn bp btn-lg', id: 'sbtn', style: 'width:100%;padding:14px;font-size:15px', textContent: '가입 신청' });
      sbtn.addEventListener('click', () => {
        sbtn.disabled = true; sbtn.textContent = '가입 중...'; $('serr').style.display = 'none'; $('sok').style.display = 'none';
        const pw = $('sPw').value;
        if (pw.length < CONFIG.PW_MIN_LENGTH) {
          $('serr').textContent = '비밀번호는 ' + CONFIG.PW_MIN_LENGTH + '자 이상이어야 합니다';
          $('serr').style.display = 'block'; sbtn.disabled = false; sbtn.textContent = '가입 신청'; return;
        }
        if ((CONFIG.PW_REQUIRE_ALPHA && !/[a-zA-Z]/.test(pw)) || (CONFIG.PW_REQUIRE_DIGIT && !/[0-9]/.test(pw))) {
          $('serr').textContent = '비밀번호에 영문과 숫자를 모두 포함해주세요';
          $('serr').style.display = 'block'; sbtn.disabled = false; sbtn.textContent = '가입 신청'; return;
        }
        authSignup($('sEmail').value, pw, $('sName').value, $('sPhone').value, $('sCohort').value).then(r => {
          const sokEl = $('sok');
          sokEl.textContent = '';
          sokEl.style.display = 'block';
          sokEl.appendChild(el('div', { style: 'font-weight:600;margin-bottom:4px', textContent: '\u2713 ' + r.message }));
          sokEl.appendChild(el('div', { style: 'font-size:11px;color:var(--t2);line-height:1.5', textContent: '관리자 승인 완료 시 카카오톡 또는 이메일로 안내드립니다. 운영 시간 내 순차 승인되며, 승인 전에는 로그인이 되지 않으니 잠시만 기다려주세요.' }));
          const goLoginBtn = el('button', { className: 'btn bp', style: 'margin-top:10px;font-size:13px', textContent: '로그인 화면으로 이동' });
          goLoginBtn.addEventListener('click', () => { mode = 'login'; render(); });
          sokEl.appendChild(goLoginBtn);
          sbtn.textContent = '가입 완료';
        }).catch(e => { $('serr').textContent = friendlyError(e); $('serr').style.display = 'block'; sbtn.disabled = false; sbtn.textContent = '가입 신청'; });
      });
      box.appendChild(sbtn);

      const switchP = el('p', { style: 'margin-top:16px;text-align:center' });
      const toLogin = _linkBtn('toLogin', '이미 계정이 있으신가요? 로그인');
      toLogin.addEventListener('click', () => { mode = 'login'; render(); });
      switchP.appendChild(toLogin);
      box.appendChild(switchP);

      wrap.appendChild(box); p.appendChild(wrap);
      setTimeout(() => { const f = $('sName'); if (f) f.focus(); }, 200);
    }
  }
  render();
}

// ── 다크모드 토글 ──
export function toggleTheme() {
  const html = document.documentElement;
  const appEl = $('app');
  // 3-5: transition 클래스를 토글 시에만 적용
  if (appEl) appEl.classList.add('theme-transitioning');
  const isDark = html.getAttribute('data-theme') === 'dark';
  if (isDark) { html.removeAttribute('data-theme'); localStorage.setItem('yt_theme', 'light'); }
  else { html.setAttribute('data-theme', 'dark'); localStorage.setItem('yt_theme', 'dark'); }
  const btn = $('themeToggle'); if (btn) btn.classList.toggle('on', !isDark);
  if (appEl) setTimeout(() => { appEl.classList.remove('theme-transitioning'); }, 400);
}

// ── 새 프로젝트 ──
export function newProject() {
  if (S.voice.voiceResult && S.voice.voiceResult.url) try { URL.revokeObjectURL(S.voice.voiceResult.url); } catch(e) {}
  if (S.script.results) S.script.results.forEach(r => { if (r && r.voiceResult && r.voiceResult.url) try { URL.revokeObjectURL(r.voiceResult.url); } catch(e) {} });
  sResetAll(true);
  sSet({ [K.NAV_STEP]: 2, [K.NAV_MX]: 2 });
  try { localStorage.removeItem('yt_a_progress'); } catch(e) {}
  shared.pexelsDL = [];
  shared.resultPage = 0;
  const p2 = $('p2'); if (p2) p2.removeAttribute('data-ok');
  syncSb(); showP();
  toast('새 프로젝트를 시작합니다');
}

// ── 로그아웃 ──
export async function doLogout() {
  const ok = await confirmModal(
    '로그아웃하시겠습니까?\n\n삭제되는 항목:\n• 로그인 세션\n• 현재 진행 중인 작업\n\n유지되는 항목:\n• API 키 (별도 삭제 필요)\n• 히스토리 (ZIP 기록)',
    { confirmText: '로그아웃', cancelText: '취소', danger: false }
  );
  if (!ok) return;
  if (S.voice.voiceResult && S.voice.voiceResult.url) try { URL.revokeObjectURL(S.voice.voiceResult.url); } catch(e) {}
  // results 배열 안의 voiceResult blob URL도 정리
  if (S.script.results) S.script.results.forEach(r => { if (r && r.voiceResult && r.voiceResult.url) try { URL.revokeObjectURL(r.voiceResult.url); } catch(e) {} });
  clearRefreshInterval();
  sResetAll(false);
  sSet({ [K.NAV_STEP]: 1, [K.NAV_MX]: 1 });
  try { localStorage.removeItem('yt_a_progress'); clearSession(); } catch(e) {}
  shared.pexelsDL = [];
  shared.resultPage = 0;
  $('uName').textContent = '';
  buildSb(); buildPanels(); syncSb(); showP();
}

// ── window 노출 제거 완료: router.js / import 기반으로 전환 ──

// ── 헤더 버튼 이벤트 바인딩 (inline onclick 제거 대응) ──
const _themeBtn = $('themeToggle');
if (_themeBtn) _themeBtn.addEventListener('click', toggleTheme);
const _logoutBtn = $('logoutBtn');
if (_logoutBtn) _logoutBtn.addEventListener('click', doLogout);
