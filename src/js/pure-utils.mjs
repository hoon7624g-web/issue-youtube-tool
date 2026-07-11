// ═══════════════════════════════════════
// pure-utils.mjs — DOM 비의존 순수 함수 (브라우저/Node 공용)
// utils.js에서 분리. utils.js는 이 모듈을 re-export하여 기존 import를 그대로 호환한다.
// scripts/unit-test.js가 실제 구현을 직접 require해서 검증할 수 있도록 .mjs(ESM)로 둔다.
// ⚠️ 여기에는 document/window 등 DOM 의존 코드를 두지 말 것.
// ═══════════════════════════════════════

// AI 응답에서 깨진 문자 정리
// P2-18: keepEmoji 옵션 — 숏폼 대본에서는 이모지 유지 가능
export function cleanAI(s, keepEmoji) {
  if (!s) return '';
  let result = s
    .replace(/[�◆◇◈◉◊○●▶▷►▻⬛⬜■□▢▪▫█•◦‣⁃]/g, '')  // 깨진 문자/특수 도형/불릿 기호
    .replace(/​/g, '');  // 제로폭 공백
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
