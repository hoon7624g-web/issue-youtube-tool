// ═══════════════════════════════════════
// unit-test.js — 핵심 유틸 단위 테스트
// 실행: node scripts/unit-test.js
// ═══════════════════════════════════════

let passed = 0, failed = 0;

function assert(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + ' — expected ' + e + ', got ' + a); }
}

function assertTruthy(name, val) {
  if (val) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + ' — expected truthy, got ' + JSON.stringify(val)); }
}

function assertFalsy(name, val) {
  if (!val) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + ' — expected falsy, got ' + JSON.stringify(val)); }
}

// ── esc() — DOM 기반이라 간단 mock 사용 ──
console.log('\n[esc]');
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
assert('XSS script', esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert('empty', esc(''), '');
assert('null', esc(null), '');
assert('normal text', esc('hello world'), 'hello world');
assert('ampersand', esc('A&B'), 'A&amp;B');
assert('quotes', esc('say "hi"'), 'say &quot;hi&quot;');

// ── cleanAI() ──
console.log('\n[cleanAI]');
function cleanAI(s) {
  if (!s) return '';
  return s
    .replace(/[\uFFFD\u25C6\u25C7\u25CB\u25CF\u2B1B\u2B1C\u25A0\u25A1\u2588]/g, '')
    .replace(/\u200B/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{E0020}-\u{E007F}]/gu, '')
    .replace(/\*{2,}/g, '')
    .replace(/^#{1,6}\s/gm, '')
    .replace(/^[\s]*[-*]\s(?=\S)/gm, '')
    .replace(/^\s+/gm, m => m.replace(/[^\n ]/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
assert('emoji removal', cleanAI('🔥텍스트'), '텍스트');
assert('markdown bold', cleanAI('**강조된 텍스트**'), '강조된 텍스트');
assert('markdown header', cleanAI('## 제목\n본문'), '제목\n본문');
assert('zero width space', cleanAI('안녕\u200B하세요'), '안녕하세요');
assert('empty', cleanAI(''), '');
assert('null', cleanAI(null), '');
assert('excess newlines', cleanAI('가\n\n\n\n나'), '가\n\n나');
assert('plain text unchanged', cleanAI('정상 텍스트입니다'), '정상 텍스트입니다');

// ── extractJSON() ──
console.log('\n[extractJSON]');
// ⚠️ 이 함수는 src/js/utils.js의 extractJSON()과 반드시 동일해야 합니다.
// src를 수정하면 여기도 함께 수정하세요. (ESM → CJS 호환 불가로 복사 방식 유지)
function extractJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.replace(/```[a-zA-Z]*\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(clean); } catch(e) {}
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
      try { return JSON.parse(clean.substring(s, end)); } catch(e) { /* next candidate */ }
    }
  }
  return null;
}
// 기본 테스트
assert('plain JSON', extractJSON('{"a":1}'), {a:1});
assert('markdown wrapped', extractJSON('```json\n{"b":2}\n```'), {b:2});
assert('array', extractJSON('[1,2,3]'), [1,2,3]);
assert('with preamble', extractJSON('Here is the result: {"c":3}'), {c:3});
assert('invalid', extractJSON('not json at all'), null);
assert('empty', extractJSON(''), null);
assert('null', extractJSON(null), null);
// P1 회귀 테스트: 배열 응답이 첫 번째 객체로 잘리지 않아야 함
assert('array with preamble (shorts)', extractJSON('여기 결과입니다:\n[{"title":"A"},{"title":"B"},{"title":"C"}]'), [{"title":"A"},{"title":"B"},{"title":"C"}]);
assert('array prefix text', extractJSON('Here are 5 scripts: [{"t":1},{"t":2},{"t":3},{"t":4},{"t":5}]'), [{"t":1},{"t":2},{"t":3},{"t":4},{"t":5}]);
assert('broken first then valid', extractJSON('{broken [{"ok":true}]'), [{"ok":true}]);
assert('empty array', extractJSON('result: []'), []);
assert('empty object', extractJSON('result: {}'), {});
assert('nested array in object', extractJSON('{"items":[1,2,3]}'), {"items":[1,2,3]});
assert('deeply nested', extractJSON('text [{"a":{"b":[1,2]}}]'), [{"a":{"b":[1,2]}}]);
assert('brace inside string', extractJSON('before {"title":"문자열 { 안에 괄호","content":"ok"} after'), {"title":"문자열 { 안에 괄호","content":"ok"});

// ── safeUrl() ──
console.log('\n[safeUrl]');
function safeUrl(raw, allowedHosts) {
  try {
    const u = new URL(raw);
    if (!['https:', 'blob:', 'data:'].includes(u.protocol)) return '';
    if (allowedHosts && allowedHosts.length && u.protocol === 'https:') {
      const ok = allowedHosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
      if (!ok) return '';
    }
    return u.toString();
  } catch(e) { return ''; }
}
assert('valid https', safeUrl('https://example.com/path', []), 'https://example.com/path');
assert('blocked http', safeUrl('http://example.com', []), '');
assert('javascript', safeUrl('javascript:alert(1)', []), '');
assert('allowed host', safeUrl('https://api.pexels.com/v1', ['pexels.com']), 'https://api.pexels.com/v1');
assert('blocked host', safeUrl('https://evil.com', ['pexels.com']), '');
assert('subdomain match', safeUrl('https://sub.pexels.com', ['pexels.com']), 'https://sub.pexels.com/');
assert('invalid url', safeUrl('not-a-url', []), '');
assert('blob ok', safeUrl('blob:http://localhost/abc', []), 'blob:http://localhost/abc');

// ── isNews() / isBreaking() ──
console.log('\n[isNews / isBreaking]');
const NEWS_CH = ['뉴스','NEWS','YTN','MBC','KBS','SBS','JTBC','채널A','TV조선','연합','MBN'];
const BREAKING_KW = ['속보','긴급','단독','충격','논란'];
function isNews(name) { return NEWS_CH.some(n => name.indexOf(n) !== -1); }
function isBreaking(title) { return BREAKING_KW.some(k => title.indexOf(k) !== -1); }
assertTruthy('YTN is news', isNews('YTN 뉴스'));
assertTruthy('MBC is news', isNews('MBC 뉴스'));
assertFalsy('random not news', isNews('테크 유튜버'));
assertTruthy('속보 is breaking', isBreaking('속보! 대통령 발표'));
assertTruthy('단독 is breaking', isBreaking('단독 취재'));
assertFalsy('normal not breaking', isBreaking('오늘의 코딩 팁'));

// ── scoreVids() ──
console.log('\n[scoreVids]');
function scoreVids(vids) {
  const now = Date.now();
  return vids.map(v => {
    let s = 0;
    const views = v.views || 0; const subs = v.subs || 0; const likes = v.likes || 0;
    if (views > 0 && subs > 0) { const vsr = views / subs; if (vsr > 10) s += 30; else if (vsr > 5) s += 25; else if (vsr > 2) s += 20; else if (vsr > 1) s += 15; else s += 10; }
    if (views > 1000000) s += 20; else if (views > 100000) s += 15; else if (views > 10000) s += 10; else if (views > 1000) s += 5;
    if (likes > 0 && views > 0) { const lr = likes / views; if (lr > 0.05) s += 15; else if (lr > 0.03) s += 10; else if (lr > 0.01) s += 5; }
    const daysSince = (now - new Date(v.date).getTime()) / 86400000;
    if (daysSince <= 3) s += 15; else if (daysSince <= 7) s += 10; else if (daysSince <= 14) s += 5;
    v.news = isNews(v.ch || ''); v.breaking = isBreaking(v.title || '');
    if (v.news) s -= 20;
    v.score = Math.max(0, Math.min(100, s));
    return v;
  }).sort((a, b) => b.score - a.score);
}
const testVids = [
  { id: 'a', title: '코딩 팁', ch: '테크 유튜버', views: 500000, subs: 10000, likes: 25000, date: new Date().toISOString().slice(0,10) },
  { id: 'b', title: '속보 뉴스', ch: 'YTN 뉴스', views: 1000000, subs: 1000000, likes: 5000, date: new Date().toISOString().slice(0,10) },
];
const scored = scoreVids(testVids);
assertTruthy('non-news ranks higher', scored[0].id === 'a');
assertTruthy('news channel penalized', scored[1].news === true);
assertTruthy('scores are 0-100', scored.every(v => v.score >= 0 && v.score <= 100));

// ── K.* 상수 일관성 검증 ──
console.log('\n[K.* Constants]');
const fs2 = require('fs');

const constantsJs = fs2.readFileSync('src/js/constants.js', 'utf8');
// K 상수에서 정의된 모든 키 추출
const kDefs = constantsJs.match(/\w+:\s*'[a-z]+\.[a-z]+'/g) || [];
assertTruthy('K.* 상수 10개 이상 정의', kDefs.length >= 10);

// sSet() 호출에서 raw string 사용 검사 (state.js, ui.js, app.js, pipeline/)
const filesToCheck = [
  'src/js/state.js', 'src/js/ui.js', 'src/js/app.js',
  'src/js/pipeline/step2-keywords.js', 'src/js/pipeline/step3-4-videos.js',
  'src/js/pipeline/step5-analysis.js', 'src/js/pipeline/step6-script.js',
  'src/js/pipeline/step7-factcheck.js', 'src/js/pipeline/step8-footage.js',
  'src/js/pipeline/step9-voice.js', 'src/js/pipeline/step10-result.js',
];
let rawKeyCount = 0;
for (const f of filesToCheck) {
  const content = fs2.readFileSync(f, 'utf8');
  // sSet({ 'nav.step': ... }) 같은 raw string key 패턴 찾기
  const matches = content.match(/sSet\(\{[^}]*'(nav|auth|search|video|analysis|script|footage|voice)\.\w+'/g) || [];
  rawKeyCount += matches.length;
}
assert('sSet() raw string key 0건 (K.* 통일)', rawKeyCount, 0);

// ── 상태 관리: loadProgress 안전 복원 검증 ──
console.log('\n[State: loadProgress cap]');

const stateJs2 = fs2.readFileSync('src/js/state.js', 'utf8');
assertTruthy('MAX_SAFE_RESTORE_STEP 정의', stateJs2.includes('MAX_SAFE_RESTORE_STEP'));
assertTruthy('복원 시 step cap 로직', stateJs2.includes('S.nav.step > MAX_SAFE_RESTORE_STEP'));
assertTruthy('복원 시 capped 반환', stateJs2.includes('capped: originalStep > MAX_SAFE_RESTORE_STEP'));

// MAX_SAFE_RESTORE_STEP 값 추출 및 검증
const capMatch = stateJs2.match(/MAX_SAFE_RESTORE_STEP\s*=\s*(\d+)/);
if (capMatch) {
  const capValue = parseInt(capMatch[1]);
  assertTruthy('MAX_SAFE_RESTORE_STEP <= 6 (fcs/ekw/voiceResult 미저장)', capValue <= 6);
  assertTruthy('MAX_SAFE_RESTORE_STEP >= 5 (analysis까지 저장됨)', capValue >= 5);
} else {
  fail('MAX_SAFE_RESTORE_STEP 값', '추출 실패');
}

// _saveLs 저장 범위 확인: JSON.stringify 안에 scrDual이 없는지
const saveLsMatch = stateJs2.match(/function _saveLs\(\)[^}]*JSON\.stringify\(\{([^}]+)\}/);
assertFalsy('_saveLs에 scrDual 미포함', saveLsMatch && saveLsMatch[1].includes('scrDual'));

// ── 보안: 웹 fallback 경고 검증 ──
console.log('\n[Security: Web Fallback Warnings]');

const llmProxy = fs2.readFileSync('src/client-proxy-llm.js', 'utf8');
const mediaProxy = fs2.readFileSync('src/client-proxy-media.js', 'utf8');

assertTruthy('LLM proxy: _warnWebFallback 정의', llmProxy.includes('function _warnWebFallback'));
assertTruthy('Media proxy: _warnWebFallback 정의', mediaProxy.includes('function _warnWebFallback'));

// 웹 fallback fetch 전에 경고가 있는지 검증
const llmFetches = (llmProxy.match(/const r = await fetch\('https:\/\/api\./g) || []).length;
const llmWarnings = (llmProxy.match(/_warnWebFallback\(/g) || []).length - 1; // 정의 제외
assertTruthy('LLM: 모든 웹 fetch에 경고 존재 (warnings >= fetches)', llmWarnings >= llmFetches);

const mediaWarnings = (mediaProxy.match(/_warnWebFallback\(/g) || []).length - 1;
assertTruthy('Media: 웹 fallback 경고 2건 이상', mediaWarnings >= 2);

// ── 보안: CSP + IPC 검증 (보강) ──
console.log('\n[Security: Enhanced]');

const indexHtml2 = fs2.readFileSync('src/index.html', 'utf8');
assertTruthy('CSP: frame-src none', indexHtml2.includes("frame-src 'none'"));
assertTruthy('CSP: form-action none', indexHtml2.includes("form-action 'none'"));
assertTruthy('CSP: base-uri none', indexHtml2.includes("base-uri 'none'"));

// preload.js에 eval/require 직접 노출이 없는지
const preloadJs2 = fs2.readFileSync('preload.js', 'utf8');
assertFalsy('preload: eval 미노출', preloadJs2.includes('eval'));
assertFalsy('preload: require 미노출 (contextBridge 외)', preloadJs2.match(/exposeInMainWorld[\s\S]*require\s*[^(]/));

// ── API 키 폼: DOM 기반 전환 검증 ──
console.log('\n[API Key Form: DOM-based]');

const apikeysJs = fs2.readFileSync('src/js/pipeline/apikeys.js', 'utf8');
const apikeysFormJs = fs2.readFileSync('src/js/pipeline/apikeys-form.js', 'utf8');
const apikeysAll = apikeysJs + '\n' + apikeysFormJs; // 분리된 파일 모두 검사
assertTruthy('_buildApiKeyFormDOM 함수 존재', apikeysAll.includes('function buildApiKeyFormDOM'));
assertFalsy('_tmplApiKeyForm 제거됨', apikeysAll.includes('function _tmplApiKeyForm'));
assertFalsy('innerHTML = _tmplApiKeyForm 제거됨', apikeysAll.includes('innerHTML = _tmplApiKeyForm'));
assertTruthy('DOM 헬퍼 _mkKeyField 존재', apikeysFormJs.includes('function _mkKeyField'));
assertTruthy('DOM 헬퍼 _mkSelect 존재', apikeysFormJs.includes('function _mkSelect'));

// ── 목표 기반 온보딩 검증 ──
console.log('\n[Onboarding: Goal-based]');

assertTruthy('GOALS 배열 정의', apikeysJs.includes('const GOALS'));
assertTruthy('_showGoalSelector 함수', apikeysJs.includes('function _showGoalSelector'));
assertTruthy('_highlightGoalFields 함수', apikeysJs.includes('function _highlightGoalFields'));
assertTruthy('hasAnyKey 분기', apikeysJs.includes('hasAnyKey'));

// ── 히스토리 저장 시점 문구 검증 ──
console.log('\n[History: Save Timing]');

const historyJs = fs2.readFileSync('src/js/pipeline/history.js', 'utf8');
assertTruthy('ZIP 다운로드 시 저장 문구', historyJs.includes('최종 패키지(ZIP) 다운로드 시 자동 저장'));
assertTruthy('중간 작업 임시 저장 문구', historyJs.includes('중간 작업은 임시 저장'));

const uiJs = fs2.readFileSync('src/js/ui.js', 'utf8');
assertTruthy('사이드바 히스토리 힌트', uiJs.includes('ZIP 다운로드 시 저장'));

// ── 로그인 CSS 클래스 검증 ──
console.log('\n[Login: CSS Classes]');

assertFalsy('login-box 잔존 없음', uiJs.includes("'login-box'"));
assertFalsy('login-logo 잔존 없음', uiJs.includes("'login-logo'"));
assertTruthy('login-card 사용', uiJs.includes("'login-card'"));
assertTruthy('login-icon 사용', uiJs.includes("'login-icon'"));

// ── 팩트체크 비교보기 + 삭제 안전장치 동작 검증 ──
console.log('\n[Factcheck: Compare View + Safety]');

function fcEscapeRegExp(text) {
  return String(text || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function createFactcheckHarness(initialResults) {
  const state = {
    results: JSON.parse(JSON.stringify(initialResults)),
    originalScripts: {},
    undoStack: [],
    scrDual: {
      longform: initialResults[0] && initialResults[0].script && initialResults[0].script.type === 'longform'
        ? { content: initialResults[0].script.content }
        : null,
      shorts: initialResults
        .filter(r => r && r.script && r.script.type === 'short')
        .sort((a, b) => (a.script.idx || 0) - (b.script.idx || 0))
        .map(r => ({ content: r.script.content })),
    },
  };

  function storeOriginals() {
    state.results.forEach((r, i) => {
      if (!state.originalScripts[i]) state.originalScripts[i] = r.script.content || '';
    });
  }

  function getCompareState(page) {
    const originalContent = state.originalScripts[page] || '';
    const currentContent = (state.results[page] && state.results[page].script && state.results[page].script.content) || '';
    return {
      originalContent,
      currentContent,
      hasChanges: !!(originalContent && originalContent !== currentContent),
    };
  }

  function removeFactcheck(page, fi) {
    const target = state.results[page];
    const f = target.fcs[fi];
    const currentScript = target.script.content || '';
    const escaped = fcEscapeRegExp(f.text || '');
    let matchFound = false;
    let matchCount = 0;

    if (f.text && f.text.length >= 10) {
      const matches = escaped ? currentScript.match(new RegExp(escaped, 'g')) : null;
      matchCount = matches ? matches.length : 0;
      matchFound = matchCount === 1;
    }

    state.undoStack.push({
      results: JSON.parse(JSON.stringify(state.results)),
      scrDual: JSON.parse(JSON.stringify(state.scrDual)),
    });

    const newResults = state.results.slice();
    const newFcs = newResults[page].fcs.slice();
    newFcs.splice(fi, 1);
    newResults[page] = Object.assign({}, newResults[page], { fcs: newFcs });

    if (f.text && matchFound) {
      let content = newResults[page].script.content || '';
      const pattern = new RegExp(escaped + '[.!?]?\\s*', 'g');
      content = content.replace(pattern, '');
      content = content.trim();
      newResults[page].script = Object.assign({}, newResults[page].script, { content });

      if (newResults[page].script.type === 'longform' && state.scrDual.longform) {
        state.scrDual = Object.assign({}, state.scrDual, {
          longform: Object.assign({}, state.scrDual.longform, { content }),
        });
      } else if (
        newResults[page].script.type === 'short' &&
        typeof newResults[page].script.idx === 'number' &&
        Array.isArray(state.scrDual.shorts)
      ) {
        const idx = newResults[page].script.idx;
        const shorts = state.scrDual.shorts.slice();
        if (shorts[idx]) shorts[idx] = Object.assign({}, shorts[idx], { content });
        state.scrDual = Object.assign({}, state.scrDual, { shorts });
      }
    }

    state.results = newResults;
    return { matchFound, matchCount };
  }

  function undo() {
    const snapshot = state.undoStack.pop();
    if (!snapshot) return false;
    state.results = snapshot.results;
    state.scrDual = snapshot.scrDual;
    return true;
  }

  return { state, storeOriginals, getCompareState, removeFactcheck, undo };
}

const fcHarnessSingle = createFactcheckHarness([
  {
    script: {
      type: 'longform',
      idx: 0,
      title: '테스트 롱폼',
      content: '첫 문장입니다. 삭제 대상 문장입니다. 마지막 문장입니다.',
    },
    fcs: [{ text: '삭제 대상 문장입니다', note: '중복 없음', st: 'warning' }],
  },
]);
fcHarnessSingle.storeOriginals();
const singleResult = fcHarnessSingle.removeFactcheck(0, 0);
assertTruthy('단일 매칭은 대본에서 제거됨', singleResult.matchFound === true && singleResult.matchCount === 1);
assert('단일 매칭 후 fcs 0건', fcHarnessSingle.state.results[0].fcs.length, 0);
assert('단일 매칭 후 대본 반영', fcHarnessSingle.state.results[0].script.content, '첫 문장입니다. 마지막 문장입니다.');
assert('scrDual longform 동기화', fcHarnessSingle.state.scrDual.longform.content, '첫 문장입니다. 마지막 문장입니다.');
assertTruthy('비교보기 상태 활성화', fcHarnessSingle.getCompareState(0).hasChanges === true);
assertTruthy('원본 대본 보존', fcHarnessSingle.getCompareState(0).originalContent.includes('삭제 대상 문장입니다'));
assertTruthy('Undo 실행 가능', fcHarnessSingle.undo() === true);
assert('Undo 후 대본 복원', fcHarnessSingle.state.results[0].script.content, '첫 문장입니다. 삭제 대상 문장입니다. 마지막 문장입니다.');
assert('Undo 후 fcs 복원', fcHarnessSingle.state.results[0].fcs.length, 1);
assertTruthy('Undo 후 비교보기 비활성화', fcHarnessSingle.getCompareState(0).hasChanges === false);

const fcHarnessMulti = createFactcheckHarness([
  {
    script: {
      type: 'short',
      idx: 0,
      title: '테스트 숏폼',
      content: '반복되는 긴 문장입니다. 반복되는 긴 문장입니다. 끝입니다.',
    },
    fcs: [{ text: '반복되는 긴 문장입니다', note: '중복 2회', st: 'warning' }],
  },
]);
fcHarnessMulti.storeOriginals();
const multiResult = fcHarnessMulti.removeFactcheck(0, 0);
assertTruthy('다중 매칭은 대본 미수정', multiResult.matchFound === false && multiResult.matchCount === 2);
assert('다중 매칭 후 대본 유지', fcHarnessMulti.state.results[0].script.content, '반복되는 긴 문장입니다. 반복되는 긴 문장입니다. 끝입니다.');
assert('다중 매칭 후 fcs만 제거', fcHarnessMulti.state.results[0].fcs.length, 0);
assert('다중 매칭 시 scrDual shorts도 유지', fcHarnessMulti.state.scrDual.shorts[0].content, '반복되는 긴 문장입니다. 반복되는 긴 문장입니다. 끝입니다.');
assertTruthy('다중 매칭 시 비교보기 비활성화', fcHarnessMulti.getCompareState(0).hasChanges === false);

const fcHarnessNoMatch = createFactcheckHarness([
  {
    script: {
      type: 'longform',
      idx: 0,
      title: '매칭 없음',
      content: '대본에는 다른 문장만 있습니다.',
    },
    fcs: [{ text: '없는 문장입니다', note: '매칭 없음', st: 'uncertain' }],
  },
]);
fcHarnessNoMatch.storeOriginals();
const noMatchResult = fcHarnessNoMatch.removeFactcheck(0, 0);
assertTruthy('미매칭은 대본 미수정', noMatchResult.matchFound === false && noMatchResult.matchCount === 0);
assert('미매칭 후 대본 유지', fcHarnessNoMatch.state.results[0].script.content, '대본에는 다른 문장만 있습니다.');
assert('미매칭 후 fcs만 제거', fcHarnessNoMatch.state.results[0].fcs.length, 0);
assertTruthy('미매칭 시 비교보기 비활성화', fcHarnessNoMatch.getCompareState(0).hasChanges === false);

// ── Summary ──
console.log('\n═══════════════════════════════');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═══════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
