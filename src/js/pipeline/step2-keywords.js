// ═══════════════════════════════════════
// pipeline/step2-keywords.js — 키워드 선택 (ES Module)
// v3.6.0 — XSS 방어: inline onclick/onkeydown 제거
// ═══════════════════════════════════════
import { $, esc, toast , el } from '../utils.js';
import { S, sSet, sNext } from '../state.js';
import { K } from '../constants.js';
import { Api } from '../api.js';
import { hasApiKeys } from '../../client-proxy.js';
import { showApiKeySettings } from './apikeys.js';
import { registerStep } from '../router.js';
import { shared } from '../shared.js';

// ── 키워드 카테고리 분류 (보조 라벨) ──
const _NEWS_KW = ['속보','긴급','사건','사고','정치','대통령','국회','검찰','경찰','재판','판결','선거','외교'];
const _ENTER_KW = ['드라마','영화','아이돌','연예','배우','가수','콘서트','음악','예능','출연'];
const _SOCIAL_KW = ['논란','반응','화제','실검','밈','트렌드','바이럴','댓글','커뮤니티'];
const _SPORTS_KW = ['축구','야구','농구','올림픽','월드컵','경기','선수','감독','우승','리그'];

function _classifyKeyword(text) {
  const t = text.toLowerCase();
  if (_NEWS_KW.some(k => t.includes(k))) return { cls: 'kw-label-news', text: '뉴스' };
  if (_ENTER_KW.some(k => t.includes(k))) return { cls: 'kw-label-enter', text: '엔터' };
  if (_SOCIAL_KW.some(k => t.includes(k))) return { cls: 'kw-label-social', text: '화제' };
  if (_SPORTS_KW.some(k => t.includes(k))) return { cls: 'kw-label-sports', text: '스포츠' };
  return null;
}

// ── 키워드 유사도 감지 (단순 포함 관계) ──
function _findSimilar(keyword, allKeywords) {
  const t = keyword.trim();
  if (t.length < 2) return null;
  for (const other of allKeywords) {
    const o = other.trim();
    if (o === t || o.length < 2) continue;
    if (t.includes(o) || o.includes(t)) return o;
  }
  return null;
}


// ── 선택된 키워드 태그 동기화 ──
function syncSelectedKw() {
  const tags = $('customKwTags'); if (!tags) return;
  const selected = S.search.skw || [];
  tags.textContent = '';
  selected.forEach(kw => {
    const span = el('span', {
      className: 'tag on',
      style: 'padding:6px 12px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px'
    });
    span.dataset.rmkw = kw.id;
    span.appendChild(document.createTextNode(kw.label));
    span.appendChild(el('span', { style: 'opacity:.5;font-size:10px', textContent: '\u2715' }));
    tags.appendChild(span);
  });
  tags.onclick = e => {
    const t = e.target.closest('[data-rmkw]'); if (!t) return;
    const rmId = t.dataset.rmkw;
    const updated = (S.search.skw || []).filter(k => { return k.id !== rmId; });
    sSet({ [K.SEARCH_SKW]: updated });
    const kwEl = document.querySelector('[data-kwid="' + rmId + '"]');
    if (kwEl) kwEl.classList.remove('on');
    syncSelectedKw();
  };
  $('kc').textContent = '선택: ' + selected.length + '개';
  $('knxt').disabled = selected.length === 0;
  // 2-6: 선택 수 가이드
  const guide = $('kwGuide');
  if (guide) {
    if (selected.length === 0) guide.textContent = '💡 보통 1~3개 선택을 추천합니다';
    else if (selected.length > 4) guide.textContent = '⚠️ 키워드가 많으면 검색 결과가 흐려질 수 있어요';
    else guide.textContent = '';
  }
}

// ── 직접 키워드 추가 ──
function addCustomKw() {
  const inp = $('customKwInput'); if (!inp) return;
  const val = inp.value.trim(); if (!val) { toast('키워드를 입력해주세요', 'err'); return; }
  if ((S.search.skw || []).some(k => { return k.label === val; })) { toast('이미 선택된 키워드입니다', 'err'); return; }
  const id = 'custom-' + Date.now();
  shared.ilKw[id] = { id: id, label: val, src: '직접 입력', score: 95, tags: [], period: 'weekly' };
  const kw = shared.ilKw[id];
  const updated = [...(S.search.skw || []), kw];
  sSet({ [K.SEARCH_SKW]: updated });
  inp.value = '';
  toast('"' + val + '" 추가됨');
  syncSelectedKw();
}

// ── Step 2: 키워드 선택 ──
registerStep(2, () => {
  const p = $('p2');
  if (!hasApiKeys()) { showApiKeySettings(); return; }
  if (p.dataset.ok) return; p.dataset.ok = '1';

  p.textContent = '';

  p.appendChild(el('h2', { className: 'pt', textContent: '키워드 선택' }));
  p.appendChild(el('p', { className: 'pd', textContent: '실시간 이슈 키워드를 선택하세요. 여러 개를 선택할 수 있습니다.' }));

  // 이슈링크 + Google Trends 로딩 (2컬럼 그리드)
  const loadGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px' });

  const ilSection = el('div', { id: 'ilSection' });
  const ilLoad = el('div', { className: 'cd', style: 'padding:40px;text-align:center' });
  ilLoad.appendChild(el('div', { className: 'sp', style: 'margin:0 auto 12px' }));
  ilLoad.appendChild(el('div', { style: 'font-size:13px;color:var(--t3)', textContent: '이슈링크 불러오는 중...' }));
  ilSection.appendChild(ilLoad);
  loadGrid.appendChild(ilSection);

  const gtSection = el('div', { id: 'gtSection' });
  const gtLoad = el('div', { className: 'cd', style: 'padding:40px;text-align:center' });
  gtLoad.appendChild(el('div', { className: 'sp', style: 'margin:0 auto 12px' }));
  gtLoad.appendChild(el('div', { style: 'font-size:13px;color:var(--t3)', textContent: '실시간 인기 검색어 불러오는 중...' }));
  gtSection.appendChild(gtLoad);
  loadGrid.appendChild(gtSection);

  p.appendChild(loadGrid);



  // 직접 입력
  const inputRow = el('div', { style: 'margin-top:16px;display:flex;gap:8px;align-items:center' });
  const kwInput = el('input', { className: 'inp flex-1 t-sm', id: 'customKwInput' });
  kwInput.placeholder = '직접 키워드 입력 후 Enter';
  kwInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) addCustomKw(); });
  inputRow.appendChild(kwInput);

  const addBtn = el('button', { className: 'btn bs', style: 'white-space:nowrap', textContent: '+ 추가' });
  addBtn.addEventListener('click', addCustomKw);
  inputRow.appendChild(addBtn);
  p.appendChild(inputRow);

  p.appendChild(el('div', { id: 'customKwTags', className: 'fx-wrap-6', style: 'margin-top:10px' }));

  // 2-6: 키워드 수 가이드
  p.appendChild(el('div', { id: 'kwGuide', style: 'font-size:12px;color:var(--t4);margin-top:8px;min-height:18px', textContent: '\uD83D\uDCA1 보통 1~3개 선택을 추천합니다' }));

  // 하단 네비게이션
  const navRow = el('div', { className: 'fx-between', style: 'margin-top:16px' });
  navRow.appendChild(el('span', { id: 'kc', style: 'font-size:13px;color:var(--t3);font-weight:500', textContent: '선택: 0개' }));
  const nxtBtn = el('button', { className: 'btn bp btn-lg', id: 'knxt', textContent: '다음 단계 \u2192' });
  nxtBtn.disabled = true;
  nxtBtn.addEventListener('click', () => { sNext(); });
  navRow.appendChild(nxtBtn);
  p.appendChild(navRow);

  shared.ilKw = {};

  function setupKwClick(container) {
    container.onclick = e => {
      const t = e.target.closest('[data-kwid]'); if (!t) return;
      t.classList.toggle('on');
      const selected = [];
      document.querySelectorAll('[data-kwid].on').forEach(x => {
        const kwId = x.dataset.kwid;
        const kw = shared.ilKw[kwId];
        if (kw) selected.push(kw);
      });
      (S.search.skw || []).forEach(k => {
        if (k.src === '직접 입력' && !selected.some(s => { return s.id === k.id; })) selected.push(k);
      });
      sSet({ [K.SEARCH_SKW]: selected });
      syncSelectedKw();
    };
  }

  // 4-5: 이슈링크 + Trends 병렬 로딩
  Promise.all([Api.getIssueLink(), Api.getTrends()]).then(([data, keywords]) => {

    // ── 2컬럼 그리드 (이슈링크 왼쪽, 트렌드 오른쪽) ──
    const ilSec = $('ilSection');
    const gtSec = $('gtSection');
    ilSec.textContent = '';
    gtSec.textContent = '';

    const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px', id: 'kwGrid' });

    // ═══ 왼쪽: 이슈링크 (또는 Google News 보조) ═══
    const isGoogleFallback = data.source === 'google_news_fallback';
    const ilCard = el('div', { className: 'cd', style: 'border-color:var(--acc-ring);padding:0;overflow:hidden' });
    const ilHdr = el('div', { style: 'padding:14px 18px;background:rgba(255,71,87,.04);border-bottom:1px solid var(--acc-ring);display:flex;align-items:center;gap:8px' });
    ilHdr.appendChild(el('span', { style: 'width:8px;height:8px;border-radius:50%;background:var(--acc);display:inline-block;animation:pulse 1.5s infinite' }));
    ilHdr.appendChild(el('span', { style: 'font-size:14px;font-weight:700;color:var(--acc)', textContent: isGoogleFallback ? '실시간 뉴스 핫이슈' : '이슈링크 핫이슈' }));
    ilHdr.appendChild(el('span', { style: 'font-size:10px;font-weight:600;color:#fff;background:var(--acc);padding:2px 8px;border-radius:10px;margin-left:auto', textContent: 'LIVE' }));
    if (isGoogleFallback) {
      ilHdr.appendChild(el('span', { style: 'font-size:9px;color:var(--t4);margin-left:4px', textContent: '(Google News)' }));
    }
    ilCard.appendChild(ilHdr);

    const ilList = el('div', { style: 'padding:8px' });
    if (data.hotKeywords.length) {
      data.hotKeywords.forEach((k, i) => {
        shared.ilKw['hot-' + i] = { id: 'hot-' + i, label: k.keyword, src: isGoogleFallback ? '실시간 뉴스' : '이슈링크 핫이슈', score: 100 - i * 5, tags: [], period: 'weekly' };
        const row = el('div', {
          className: 'kw-row'
        });
        row.dataset.kwid = 'hot-' + i;
        // P1-6: 4위 이하는 접힘 처리
        // 순위 번호
        const rank = el('span', {
          className: 'kw-rank ' + (i < 3 ? 'kw-rank-top' : 'kw-rank-off'),
          textContent: String(i + 1)
        });
        row.appendChild(rank);
        // P1-6: 상위 3개에 추천 뱃지
        if (i < 3) {
          row.appendChild(el('span', { style: 'font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(255,71,87,.1);color:var(--acc);font-weight:700;flex-shrink:0', textContent: '\uD83D\uDD25 추천' }));
        }
        // 키워드 텍스트
        row.appendChild(el('span', { className: 'kw-text', textContent: k.keyword }));
        // 카테고리 라벨
        const cat = _classifyKeyword(k.keyword);
        if (cat) row.appendChild(el('span', { className: 'kw-label ' + cat.cls, textContent: cat.text }));
        ilList.appendChild(row);
      });
    } else {
      ilList.appendChild(el('div', { style: 'padding:24px;text-align:center;color:var(--t4);font-size:13px', textContent: '이슈링크 데이터를 불러올 수 없습니다' }));
    }
    ilCard.appendChild(ilList);
    grid.appendChild(ilCard);
    setupKwClick(ilCard);

    // ═══ 줌 실시간 검색어 ═══
    const zumKws = keywords.zum || [];
    const nateKws = keywords.nate || [];
    const googleKws = keywords.google || [];

    if (zumKws.length > 0) {
      const zumCard = el('div', { className: 'cd', style: 'border-color:rgba(37,99,235,.3);padding:0;overflow:hidden' });
      const zumHdr = el('div', { style: 'padding:14px 18px;background:rgba(37,99,235,.04);border-bottom:1px solid rgba(37,99,235,.2);display:flex;align-items:center;gap:8px' });
      zumHdr.appendChild(el('span', { style: 'width:8px;height:8px;border-radius:50%;background:#2563EB;display:inline-block;animation:pulse 1.5s infinite' }));
      zumHdr.appendChild(el('span', { style: 'font-size:14px;font-weight:700;color:#2563EB', textContent: '줌 실시간 검색어' }));
      zumHdr.appendChild(el('span', { style: 'font-size:10px;font-weight:600;color:#fff;background:#2563EB;padding:2px 8px;border-radius:10px;margin-left:auto', textContent: 'LIVE' }));
      zumCard.appendChild(zumHdr);
      const zumList = el('div', { style: 'padding:8px' });
      zumKws.forEach((k, i) => {
        const zid = 'zum-' + i;
        shared.ilKw[zid] = { id: zid, label: k.keyword, src: '줌 실시간', score: 97 - i * 3, tags: [], period: 'daily' };
        const row = el('div', { className: 'kw-row' });
        row.dataset.kwid = zid;
        row.appendChild(el('span', { className: 'kw-rank ' + (i < 3 ? 'kw-rank-gt' : 'kw-rank-off'), textContent: String(i + 1) }));
        if (i < 3) row.appendChild(el('span', { style: 'font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(37,99,235,.1);color:#2563EB;font-weight:700;flex-shrink:0', textContent: '\uD83D\uDD25 추천' }));
        row.appendChild(el('span', { className: 'kw-text', textContent: k.keyword }));
        const zcat = _classifyKeyword(k.keyword);
        if (zcat) row.appendChild(el('span', { className: 'kw-label ' + zcat.cls, textContent: zcat.text }));
        zumList.appendChild(row);
      });
      zumCard.appendChild(zumList);
      grid.appendChild(zumCard);
      setupKwClick(zumCard);
    }

    // ═══ 네이트 실시간 검색어 ═══
    if (nateKws.length > 0) {
      const nateCard = el('div', { className: 'cd', style: 'border-color:rgba(249,115,22,.3);padding:0;overflow:hidden' });
      const nateHdr = el('div', { style: 'padding:14px 18px;background:rgba(249,115,22,.04);border-bottom:1px solid rgba(249,115,22,.2);display:flex;align-items:center;gap:8px' });
      nateHdr.appendChild(el('span', { style: 'width:8px;height:8px;border-radius:50%;background:#F97316;display:inline-block;animation:pulse 1.5s infinite' }));
      nateHdr.appendChild(el('span', { style: 'font-size:14px;font-weight:700;color:#F97316', textContent: '네이트 실시간 검색어' }));
      nateHdr.appendChild(el('span', { style: 'font-size:10px;font-weight:600;color:#fff;background:#F97316;padding:2px 8px;border-radius:10px;margin-left:auto', textContent: 'LIVE' }));
      nateCard.appendChild(nateHdr);
      const nateList = el('div', { style: 'padding:8px' });
      nateKws.forEach((k, i) => {
        const nid = 'nate-' + i;
        shared.ilKw[nid] = { id: nid, label: k.keyword, src: '네이트 실시간', score: 95 - i * 3, tags: [], period: 'daily' };
        const row = el('div', { className: 'kw-row' });
        row.dataset.kwid = nid;
        row.appendChild(el('span', { className: 'kw-rank ' + (i < 3 ? 'kw-rank-gt' : 'kw-rank-off'), textContent: String(i + 1) }));
        if (i < 3) row.appendChild(el('span', { style: 'font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(249,115,22,.1);color:#F97316;font-weight:700;flex-shrink:0', textContent: '\uD83D\uDD25 추천' }));
        row.appendChild(el('span', { className: 'kw-text', textContent: k.keyword }));
        const ncat = _classifyKeyword(k.keyword);
        if (ncat) row.appendChild(el('span', { className: 'kw-label ' + ncat.cls, textContent: ncat.text }));
        nateList.appendChild(row);
      });
      nateCard.appendChild(nateList);
      grid.appendChild(nateCard);
      setupKwClick(nateCard);
    }

    // ═══ 구글 트렌드 ═══
    if (googleKws.length > 0) {
      const googleCard = el('div', { className: 'cd', style: 'border-color:rgba(52,168,83,.3);padding:0;overflow:hidden' });
      const gHdr = el('div', { style: 'padding:14px 18px;background:rgba(52,168,83,.04);border-bottom:1px solid rgba(52,168,83,.2);display:flex;align-items:center;gap:8px' });
      gHdr.appendChild(el('span', { style: 'width:8px;height:8px;border-radius:50%;background:#34A853;display:inline-block;animation:pulse 1.5s infinite' }));
      gHdr.appendChild(el('span', { style: 'font-size:14px;font-weight:700;color:#34A853', textContent: '구글 트렌드' }));
      gHdr.appendChild(el('span', { style: 'font-size:10px;font-weight:600;color:#fff;background:#34A853;padding:2px 8px;border-radius:10px;margin-left:auto', textContent: 'LIVE' }));
      googleCard.appendChild(gHdr);
      const gList = el('div', { style: 'padding:8px' });
      googleKws.forEach((k, i) => {
        const gid = 'gt-' + i;
        shared.ilKw[gid] = { id: gid, label: k.keyword, src: '구글 트렌드', score: 90 - i * 3, tags: [], period: 'daily' };
        const row = el('div', { className: 'kw-row' });
        row.dataset.kwid = gid;
        row.appendChild(el('span', { className: 'kw-rank ' + (i < 3 ? 'kw-rank-gt' : 'kw-rank-off'), textContent: String(i + 1) }));
        if (i < 3) row.appendChild(el('span', { style: 'font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(52,168,83,.1);color:#34A853;font-weight:700;flex-shrink:0', textContent: '\uD83D\uDD25 추천' }));
        row.appendChild(el('span', { className: 'kw-text', textContent: k.keyword }));
        const gcat = _classifyKeyword(k.keyword);
        if (gcat) row.appendChild(el('span', { className: 'kw-label ' + gcat.cls, textContent: gcat.text }));
        gList.appendChild(row);
      });
      googleCard.appendChild(gList);
      grid.appendChild(googleCard);
      setupKwClick(googleCard);
    }

    if (zumKws.length === 0 && nateKws.length === 0 && googleKws.length === 0) {
      const emptyCard = el('div', { className: 'cd', style: 'border-color:var(--bdr);padding:0;overflow:hidden;grid-column:span 3' });
      emptyCard.appendChild(el('div', { style: 'padding:24px;text-align:center;color:var(--t4);font-size:13px', textContent: '실시간 검색어 데이터를 불러올 수 없습니다' }));
      grid.appendChild(emptyCard);
    }

    // 기존 섹션을 그리드로 교체
    // 로딩 그리드를 데이터 그리드로 교체
    const loadGridEl = ilSec.parentElement;
    if (loadGridEl) {
      loadGridEl.replaceWith(grid);
    } else {
      ilSec.textContent = '';
      ilSec.appendChild(grid);
    }

    // ── 선택 시 하이라이트 스타일 (hover + on) — main.css로 이동 완료 ──
  });
});
