// ═══════════════════════════════════════
// pipeline/step3-4-videos.js — 영상 리스트 & 선택 확인
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, fmt, toast, friendlyError , el } from '../utils.js';
import { S, sSet, sNext, sPrev } from '../state.js';
import { K } from '../constants.js';
import { filterDuration, syncSb } from '../ui.js';
import { registerStep, runAction } from '../router.js';
import { prefetchSubtitle } from '../shared.js';
import { ytFetch, hasYtKey } from '../../client-proxy.js';

// 3-11: showManualUrlInput() 삭제 — URL 입력은 Step 3에 인라인으로 포함됨

// ★ P1-9: YouTube Data API IPC로 영상 정보 조회 (키 있을 때), oEmbed fallback
async function _fetchVideoInfo(videoId) {
  // 1순위: YouTube Data API (Electron IPC — CSP 안전)
  if (hasYtKey()) {
    try {
      // ytFetch()는 raw JSON을 반환 (Electron: r.data, 웹: r.json() 결과)
      // { status, data } 형태가 아님 — getVids 등 다른 호출부와 계약 통일
      const data = await ytFetch('videos', { part: 'snippet,statistics', id: videoId, maxResults: '1' });
      if (data && data.items && data.items.length > 0) {
        const item = data.items[0];
        const snippet = item.snippet || {};
        const stats = item.statistics || {};
        return {
          id: videoId,
          title: snippet.title || '영상 ' + videoId,
          ch: snippet.channelTitle || '',
          thumb: (snippet.thumbnails && snippet.thumbnails.high && snippet.thumbnails.high.url) || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
          date: (snippet.publishedAt || '').substring(0, 10) || new Date().toISOString().substring(0, 10),
          views: parseInt(stats.viewCount) || 0,
          likes: parseInt(stats.likeCount) || 0,
          subs: 0, desc: (snippet.description || '').substring(0, 200), score: 0, news: false
        };
      }
    } catch (e) { /* YouTube API 실패 → oEmbed fallback */ }
  }
  // 2순위: oEmbed (API 키 불필요)
  const r = await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + videoId + '&format=json');
  if (!r.ok) throw new Error('영상을 찾을 수 없습니다');
  const data = await r.json();
  return {
    id: videoId, title: data.title || '영상 ' + videoId, ch: data.author_name || '',
    thumb: data.thumbnail_url || 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
    date: new Date().toISOString().substring(0, 10),
    views: 0, likes: 0, subs: 0, desc: '', score: 0, news: false
  };
}

const loadManualUrl = () => {
  const url = ($('manualUrl') || {}).value || '';
  const errEl = $('manualUrlErr');
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  if (!match) {
    if (errEl) { errEl.textContent = '유효한 YouTube URL이 아닙니다'; errEl.style.display = 'block'; }
    return;
  }
  const videoId = match[1];
  if (errEl) errEl.style.display = 'none';
  toast('영상 정보를 불러오는 중...');
  // ★ P1-9: YouTube Data API IPC 우선 → oEmbed fallback
  _fetchVideoInfo(videoId)
    .then(vid => {
      sSet({ [K.VIDEO_SV]: vid, [K.SEARCH_VIDS]: [vid] });
      toast(vid.title);
      sSet({ [K.NAV_STEP]: 4, [K.NAV_MX]: Math.max(S.nav.mx, 4) });
      syncSb(); runAction('showP');
    })
    .catch(e => {
      // 2-9: oEmbed 실패 시 최소 정보로 진행 옵션 제공
      if (errEl) {
        errEl.textContent = '';
        errEl.style.display = 'block';
        errEl.style.cssText = 'display:block;margin-top:8px;padding:12px;background:var(--yel-bg);border:1px solid rgba(184,138,0,.2);border-radius:var(--r);color:var(--t1)';
        const msg = el('div', { style: 'font-size:12px;color:var(--yel);margin-bottom:8px', textContent: '영상 정보를 가져올 수 없습니다: ' + friendlyError(e) });
        errEl.appendChild(msg);
        const proceedBtn = el('button', { className: 'btn bs', style: 'font-size:12px;padding:6px 14px', textContent: '그래도 이 영상으로 진행 →' });
        proceedBtn.addEventListener('click', () => {
          const vid = {
            id: videoId, title: '영상 ' + videoId, ch: '',
            thumb: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
            date: new Date().toISOString().substring(0, 10),
            views: 0, likes: 0, subs: 0, desc: '', score: 0, news: false
          };
          sSet({ [K.VIDEO_SV]: vid, [K.SEARCH_VIDS]: [vid] });
          toast('최소 정보로 진행합니다 (제목을 직접 수정하세요)');
          sSet({ [K.NAV_STEP]: 4, [K.NAV_MX]: Math.max(S.nav.mx, 4) });
          syncSb(); runAction('showP');
        });
        errEl.appendChild(proceedBtn);
      }
    });
};

// ── Step 3: 영상 리스트 ──
registerStep(3, () => {
  const cur = S.search.filterDuration || 'long';
  const p = $('p3');
  p.textContent = '';

  const backBtn = el('button', { className: 'btn bs back-link', textContent: '\u2190 키워드 선택' });
  backBtn.addEventListener('click', () => { sPrev(); });
  p.appendChild(backBtn);

  p.appendChild(el('h2', { className: 'pt', textContent: '영상 리스트' }));
  p.appendChild(el('p', { className: 'pd', textContent: '잘팔린 컨텐츠를 점수순으로 정렬했습니다. 클릭하여 선택하세요.' }));

  // 필터 버튼
  const filterRow = el('div', { style: 'display:flex;gap:6px;margin-bottom:16px;align-items:center;flex-wrap:wrap' });
  const filters = [
    { key: 'long', label: '\uD83C\uDFAC 롱폼' },
    { key: 'short', label: '\uD83D\uDCF1 숏폼' }
  ];
  filters.forEach(f => {
    const btn = el('button', {
      className: 'tag' + (cur === f.key ? ' on' : ''),
      textContent: f.label
    });
    btn.dataset.dur = f.key;
    btn.addEventListener('click', () => { filterDuration(f.key); });
    filterRow.appendChild(btn);
  });

  // 기간 필터
  filterRow.appendChild(el('span', { style: 'width:1px;height:20px;background:var(--bdr);margin:0 6px' }));
  const periodSel = el('select', { className: 'inp', id: 'periodFilter', style: 'width:auto;font-size:12px;padding:6px 10px' });
  const periods = [
    { value: '1d', label: '24시간' }, { value: '2d', label: '2일' }, { value: '3d', label: '3일' },
    { value: '4d', label: '4일' }, { value: '5d', label: '5일' }, { value: '6d', label: '6일' },
    { value: '7d', label: '7일' }, { value: '30d', label: '한 달' },
    { value: '1y', label: '1년' }, { value: '2y', label: '2년' }, { value: '3y', label: '3년' },
    { value: '4y', label: '4년' }, { value: '5y', label: '5년' }
  ];
  const curPeriod = S.search.filterPeriod || '7d';
  periods.forEach(p => {
    const opt = el('option'); opt.value = p.value; opt.textContent = p.label;
    if (p.value === curPeriod) opt.selected = true;
    periodSel.appendChild(opt);
  });
  periodSel.addEventListener('change', () => {
    sSet({ [K.SEARCH_FILTER_PERIOD]: periodSel.value });
    filterDuration(S.search.filterDuration || 'long');
  });
  filterRow.appendChild(periodSel);
  filterRow.appendChild(el('span', { style: 'font-size:11px;color:var(--t4)', textContent: '이내 영상' }));

  p.appendChild(filterRow);

  // URL 직접 입력 (항상 노출)
  const urlCard = el('div', { style: 'margin-bottom:14px;padding:12px 16px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--r2);display:flex;align-items:center;gap:10px;flex-wrap:wrap' });
  urlCard.appendChild(el('span', { style: 'font-size:14px;flex-shrink:0', textContent: '\uD83C\uDFA5' }));
  urlCard.appendChild(el('span', { style: 'font-size:13px;color:var(--t2);flex-shrink:0;font-weight:500', textContent: '분석할 영상이 있나요?' }));
  const urlInp = el('input', { className: 'inp', id: 'manualUrl', style: 'flex:1;min-width:200px;font-size:13px;padding:8px 12px' });
  urlInp.placeholder = 'YouTube URL 붙여넣기 (예: youtube.com/watch?v=...)';
  urlCard.appendChild(urlInp);
  const urlGoBtn = el('button', { className: 'btn bp', style: 'flex-shrink:0;padding:8px 16px', textContent: '분석하기' });
  urlGoBtn.addEventListener('click', () => { loadManualUrl(); });
  urlCard.appendChild(urlGoBtn);
  urlInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadManualUrl(); });
  const urlErr = el('div', { id: 'manualUrlErr', style: 'width:100%;color:var(--red);font-size:12px;display:none' });
  urlCard.appendChild(urlErr);
  p.appendChild(urlCard);

  p.appendChild(el('div', { id: 'vl' }));
  filterDuration(cur);
});

// ── Step 4: 영상 선택 확인 ──
registerStep(4, () => {
  const v = S.video.sv;
  if (!v) return;

  // 자막 프리페치 — 영상 선택 즉시 백그라운드 추출 시작
  if (v.id) prefetchSubtitle(v.id);
  const r = v.subs > 0 ? (v.views / v.subs).toFixed(1) : '-';
  const p = $('p4');
  p.textContent = '';

  const backBtn = el('button', { className: 'btn bs back-link', textContent: '\u2190 영상 리스트' });
  backBtn.addEventListener('click', () => { sPrev(); });
  p.appendChild(backBtn);

  p.appendChild(el('h2', { className: 'pt', textContent: '영상 선택 확인' }));
  p.appendChild(el('p', { className: 'pd', textContent: '이 영상을 분석하시겠습니까?' }));

  const card = el('div', { className: 'cd', style: 'padding:28px' });
  card.appendChild(el('h3', { style: 'font-size:18px;font-weight:700;margin-bottom:8px;letter-spacing:-.3px', textContent: v.title || '' }));
  card.appendChild(el('div', { style: 'font-size:14px;color:var(--t2);margin-bottom:14px;font-weight:500', textContent: (v.ch || '') + ' · ' + (v.date || '') }));

  const badgeRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' });
  badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: '\u25B6 ' + fmt(v.views) }));
  badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: '구독 ' + fmt(v.subs) }));
  badgeRow.appendChild(el('span', { className: 'bdg ba', textContent: '점수 ' + v.score }));
  badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: '비율 ' + r + 'x' }));
  card.appendChild(badgeRow);
  if (v.views === 0 && v.subs === 0 && v.score === 0) {
    card.appendChild(el('div', { style: 'font-size:11px;color:var(--t3);margin-top:12px;padding:8px 12px;background:var(--bg);border-radius:var(--r);line-height:1.5', textContent: 'ℹ️ URL 직접 입력 영상이라 통계 데이터가 제한됩니다. 영상 분석은 정상적으로 진행됩니다.' }));
  }
  p.appendChild(card);

  const nextBtn = el('button', { className: 'btn bp btn-lg mt-20', textContent: '영상 분석 시작 \u2192' });
  nextBtn.addEventListener('click', () => { sNext(); });
  p.appendChild(nextBtn);
});
