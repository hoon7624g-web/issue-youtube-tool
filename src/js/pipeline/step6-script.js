// ═══════════════════════════════════════
// pipeline/step6-script.js — 스크립트 생성 + 멀티셀렉트
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, esc, toast, withTimeout, friendlyError, TIMEOUT, createProgress , el, buildCancelBtn, mergeAbortSignals } from '../utils.js';
import { S, sSet, sNext, sPrev, sOn, setSaveBlocked } from '../state.js';
import { K } from '../constants.js';
import { M } from '../mock-data.js';
import { Api } from '../api.js';

let _shortsOnlyJobRunning = false;
let _scriptJobRunning = false;
let _scriptRunId = 0;
let _scriptLeaveAC = new AbortController();
import { registerStep, runStep } from '../router.js';

let _selected = {};
let _docClickAC = null; // AbortController for document click listeners (prevents leak)

// ★ P1-7: Step 6을 벗어나면 document 리스너 자동 정리 + in-flight 생성 무효화
sOn(K.NAV_STEP, (step) => {
  if (step !== 6) {
    if (_docClickAC) {
      _docClickAC.abort();
      _docClickAC = null;
    }
    _scriptRunId++;
    _scriptJobRunning = false;
    _shortsOnlyJobRunning = false;
    setSaveBlocked(false);
    try { _scriptLeaveAC.abort(new Error('step-leave')); } catch (e) {}
    _scriptLeaveAC = new AbortController();
  }
});

function _syncFcBtn() {
  const btn = $('s6b');
  if (!btn) return;
  const any = Object.keys(_selected).some(k => { return _selected[k]; });
  btn.disabled = !any;
  btn.style.opacity = any ? '1' : '.4';
  const cnt = Object.keys(_selected).filter(k => { return _selected[k]; }).length;
  const longCnt = _selected['longform'] ? 1 : 0;
  const shortCnt = cnt - longCnt;
  btn.textContent = any ? '팩트 검증 \u2192 (' + cnt + '개 선택됨)' : '스크립트를 선택해주세요';
  // P1-8: 선택 시 안내 배너 숨김
  const guideBox = $('s6Guide');
  if (guideBox) guideBox.style.display = any ? 'none' : 'flex';
  // 선택 상태 요약 바
  const hint = $('s6CostHint');
  if (hint) {
    hint.textContent = '';
    if (cnt > 0) {
      hint.style.cssText = 'text-align:center;font-size:12px;margin-top:8px;padding:10px 16px;background:var(--acc-bg);border:1px solid var(--acc-ring);border-radius:var(--r);color:var(--t2)';
      const parts = [];
      if (longCnt) parts.push('\uD83C\uDFAC 롱폼 ' + longCnt + '개');
      if (shortCnt) parts.push('\uD83D\uDCF1 숏폼 ' + shortCnt + '개');
      hint.textContent = '선택: ' + parts.join(' + ') + '  →  팩트체크 ' + cnt + '회 · 풋티지 ' + cnt + '회 · 음성 ' + cnt + '회 (예상 비용 ~$0.02~0.05/회)';
    } else {
      hint.style.cssText = 'text-align:center;font-size:12px;color:var(--t4);margin-top:8px';
    }
  }
}

function _commitSelection() {
  const dual = S.script.scrDual;
  if (!dual) return;
  const sel = [];
  if (_selected['longform'] && dual.longform) {
    sel.push({ title: dual.longform.title, content: dual.longform.content, type: 'longform' });
  }
  (dual.shorts || []).forEach((s, i) => {
    if (_selected['short-' + i]) {
      sel.push({ title: s.title, content: s.content, type: 'short', idx: i });
    }
  });
  const results = sel.map(s => { return { script: s, fcs: null, ekw: null, voiceResult: null }; });
  sSet({ [K.SCRIPT_SELECTED]: sel, [K.SCRIPT_RESULTS]: results, [K.SCRIPT_CUR_IDX]: 0 });
  if (sel.length) {
    sSet({ [K.SCRIPT_SCR]: { title: sel[0].title, content: sel[0].content }, [K.SCRIPT_ES]: sel[0].content });
  }
}

function _buildStyleSelect(styles) {
  const sel = el('select', { className: 'inp', id: 'ssel', style: 'width:260px' });
  styles.forEach(s => {
    const opt = el('option');
    opt.value = s.id;
    opt.dataset.prompt = s.prompt || '';
    opt.textContent = s.name + ' \u2014 ' + s.desc;
    sel.appendChild(opt);
  });
  return sel;
}

function _bindScriptSel(container) {
  container.querySelectorAll('.script-sel').forEach(selEl => {
    selEl.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') return;
      // textarea 클릭 시 편집만 (선택 토글 안 함)
      if (e.target.tagName === 'TEXTAREA') return;

      const key = selEl.dataset.key;

      // 체크박스 또는 카드 영역 클릭 → 선택 토글
      _selected[key] = !_selected[key];
      const check = selEl.querySelector('.sel-check');
      if (_selected[key]) {
        selEl.style.borderColor = key === 'longform' ? '#2563EB' : '#DC2626';
        selEl.style.background = key === 'longform' ? 'rgba(37,99,235,.04)' : 'rgba(220,38,38,.04)';
        if (check) { check.style.borderColor = key === 'longform' ? '#2563EB' : '#DC2626'; check.style.background = key === 'longform' ? '#2563EB' : '#DC2626'; check.textContent = '\u2713'; check.style.color = '#fff'; }
        const editor = selEl.querySelector('.short-editor');
        if (editor) { editor.style.display = 'block'; }
      } else {
        selEl.style.borderColor = 'var(--bdr)';
        selEl.style.background = key.indexOf('short') === 0 ? 'var(--bg)' : '';
        if (check) { check.style.borderColor = 'var(--bdr)'; check.style.background = ''; check.textContent = ''; check.style.color = ''; }
        const editor = selEl.querySelector('.short-editor');
        if (editor) editor.style.display = 'none';
      }
      _syncFcBtn();
    });
  });
}

function _buildShortItem(s, i) {
  const item = el('div', { className: 'short-item script-sel', style: 'padding:12px 14px;margin-bottom:8px;background:var(--bg);border-radius:var(--r);cursor:pointer;border:1.5px solid var(--bdr);transition:all .2s' });
  item.dataset.key = 'short-' + i;
  const row = el('div', { className: 'fx-row-10' });
  row.appendChild(el('div', { className: 'sel-check', style: 'width:22px;height:22px;border-radius:6px;border:2px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;transition:all .2s' }));
  row.appendChild(el('div', { style: 'flex:1;font-size:13px;font-weight:600;line-height:1.4', textContent: s.title || '' }));
  const charSpan = el('span', { className: 't-2xs-t4 short-char-count', textContent: s.content.length + '자' });
  row.appendChild(charSpan);
  item.appendChild(row);

  // ★ Bug fix: 숏폼도 textarea로 변경 — 편집 모드에서 수정 가능
  const editor = el('textarea', {
    className: 'inp short-editor',
    style: 'display:none;margin-top:10px;font-size:12px;line-height:1.7;min-height:120px;max-height:250px;resize:vertical;white-space:pre-wrap'
  });
  editor.value = s.content;
  editor.addEventListener('click', e => { e.stopPropagation(); });
  editor.addEventListener('input', () => {
    // scrDual.shorts 업데이트
    if (S.script.scrDual && S.script.scrDual.shorts && S.script.scrDual.shorts[i]) {
      const newShorts = S.script.scrDual.shorts.slice();
      newShorts[i] = Object.assign({}, newShorts[i], { content: editor.value });
      const updated = Object.assign({}, S.script.scrDual, { shorts: newShorts });
      sSet({ [K.SCRIPT_SCR_DUAL]: updated });
    }
    charSpan.textContent = editor.value.length + '자';
  });
  item.appendChild(editor);
  return item;
}

function _showRetryError(msg) {
  const sout = $('sout');
  if (!sout) return;
  sout.textContent = '';
  const card = el('div', { className: 'cd empty-state' });
  card.appendChild(el('div', { className: 't-err', textContent: '대본 생성 실패' }));
  card.appendChild(el('div', { className: 't-sm-desc', textContent: msg }));
  const btnRow = el('div', { className: 'retry-center' });
  const retryBtn = el('button', { className: 'btn bp', textContent: '다시 시도' });
  retryBtn.addEventListener('click', () => { sSet({ [K.SCRIPT_SCR_DUAL]: null, [K.SCRIPT_SCR]: null }); runStep(6); });
  btnRow.appendChild(retryBtn);
  const backBtn = el('button', { className: 'btn bs', textContent: '\u2190 영상 분석으로' });
  backBtn.addEventListener('click', () => { sPrev(); });
  btnRow.appendChild(backBtn);
  card.appendChild(btnRow);
  sout.appendChild(card);
}

// ── 롱폼 카드 빌더 ──
function _buildLongformCard(lf) {
  const lfCharMin = Math.floor(lf.content.length / 350);
  const lfCard = el('div', { className: 'cd script-sel', style: 'border-left:4px solid #2563EB;cursor:pointer;transition:all .2s;margin-bottom:0' });
  lfCard.dataset.key = 'longform';

  const lfHeader = el('div', { className: 'cdh mb-12' });
  const lfHeaderLeft = el('div', { className: 'fx-row' });
  lfHeaderLeft.appendChild(el('div', { className: 'sel-check', style: 'width:22px;height:22px;border-radius:6px;border:2px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .2s' }));
  lfHeaderLeft.appendChild(el('span', { className: 'badge-longform', textContent: '롱폼 ~' + lfCharMin + '분' }));
  lfHeader.appendChild(lfHeaderLeft);

  const lfCopyBtn = el('button', { className: 'btn bs', style: 'font-size:12px', textContent: '복사' });
  lfCopyBtn.addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(S.script.scrDual.longform.content).then(() => { toast('롱폼 대본 복사됨'); });
  });
  lfHeader.appendChild(lfCopyBtn);
  lfCard.appendChild(lfHeader);

  lfCard.appendChild(el('div', { style: 'font-size:16px;font-weight:700;margin-bottom:12px;line-height:1.4', textContent: lf.title || '' }));

  const lfEditor = el('textarea', { className: 'inp', id: 'lfEditor', style: 'font-size:13px;line-height:1.8;min-height:300px;max-height:500px;resize:vertical;white-space:pre-wrap' });
  lfEditor.value = lf.content;
  lfEditor.addEventListener('click', e => { e.stopPropagation(); });
  lfEditor.addEventListener('input', () => {
    if (S.script.scrDual) {
      const updated = Object.assign({}, S.script.scrDual, { longform: Object.assign({}, S.script.scrDual.longform, { content: lfEditor.value }) });
      sSet({ [K.SCRIPT_SCR_DUAL]: updated, [K.SCRIPT_ES]: lfEditor.value });
    }
    const cc = $('lfCount');
    if (cc) cc.textContent = lfEditor.value.length + '자';
  });
  lfCard.appendChild(lfEditor);
  lfCard.appendChild(el('div', { id: 'lfCount', style: 'margin-top:12px;font-size:11px;color:var(--t4)', textContent: lf.content.length + '자' }));
  return lfCard;
}

// ── 숏폼 카드 빌더 ──
function _buildShortsCard(shorts) {
  const sfCard = el('div', { className: 'cd', style: 'border-left:4px solid #DC2626;margin-bottom:0' });
  sfCard.appendChild(el('div', { className: 'mb-14' }, [
    el('span', { style: 'font-size:11px;font-weight:600;color:#DC2626;background:rgba(220,38,38,.1);padding:3px 8px;border-radius:4px', textContent: '숏폼 30초~1분 \u00D7 ' + shorts.length + '개' })
  ]));
  if (shorts.length) {
    shorts.forEach((s, i) => { sfCard.appendChild(_buildShortItem(s, i)); });
  } else {
    sfCard.appendChild(el('div', { style: 'padding:20px;text-align:center;color:var(--t3);font-size:13px', textContent: '숏폼 대본이 생성되지 않았습니다.' }));
  }
  return sfCard;
}

function renderDualScript(dual, styles) {
  // 이전 렌더링의 document 리스너 정리 (누수 방지)
  if (_docClickAC) _docClickAC.abort();
  _docClickAC = new AbortController();

  const lf = dual.longform;
  const shorts = dual.shorts || [];
  const shortsOnly = !lf;
  _selected = {};

  const root = $('p6');
  root.textContent = '';

  // 뒤로가기
  const backBtn = el('button', { className: 'btn bs back-link', textContent: '\u2190 영상 분석' });
  backBtn.addEventListener('click', () => { sPrev(); });
  root.appendChild(backBtn);

  root.appendChild(el('h2', { className: 'pt', textContent: '스크립트 생성' }));
  root.appendChild(el('p', { className: 'pd', textContent: '진행할 스크립트를 선택하세요 (복수 선택 가능)' }));

  // P1-8: 선택 안내 배너
  const guideBox = el('div', { id: 's6Guide', style: 'padding:14px 18px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.15);border-radius:var(--r2);margin-bottom:16px;display:flex;align-items:center;gap:10px' });
  guideBox.appendChild(el('span', { style: 'font-size:22px', textContent: '\uD83D\uDC47' }));
  const guideInner = el('div', { style: 'font-size:13px;color:var(--t2);line-height:1.5' });
  guideInner.appendChild(el('strong', { textContent: '아래 스크립트 카드를 클릭하여 선택하세요.' }));
  guideInner.appendChild(document.createTextNode(' 선택한 스크립트만 팩트체크 → 풋티지 → 음성 단계로 진행됩니다.'));
  guideBox.appendChild(guideInner);
  root.appendChild(guideBox);

  // 안내 힌트
  const modeHint = el('div', { id: 's6modeHint', style: 'font-size:12px;color:var(--t3);margin-bottom:16px', textContent: '체크박스로 스크립트를 선택하고, 텍스트를 직접 클릭하여 편집할 수 있습니다.' });
  root.appendChild(modeHint);

  // 스타일 + 다시 생성 + 이전 버전
  const ctrlRow = el('div', { className: 'tag-row mb-24' });
  ctrlRow.appendChild(_buildStyleSelect(styles));
  const regenBtn = el('button', { className: 'btn bp', textContent: '다시 생성' });
  regenBtn.addEventListener('click', () => {
    // 현재 대본을 히스토리에 저장
    const current = S.script.scrDual || (S.script.scr ? { longform: S.script.scr, shorts: [] } : null);
    if (current && current.longform) {
      const history = S.script.scriptHistory || [];
      history.unshift({ ...current, _savedAt: new Date().toLocaleString('ko-KR') });
      if (history.length > 5) history.length = 5; // 최대 5개
      sSet({ [K.SCRIPT_HISTORY]: history });
    }
    sSet({ [K.SCRIPT_SCR_DUAL]: null, [K.SCRIPT_SCR]: null, [K.SCRIPT_ES]: '' });
    runStep(6);
  });
  ctrlRow.appendChild(regenBtn);

  // 이전 버전 복원
  const history = S.script.scriptHistory || [];
  if (history.length > 0) {
    const histWrap = el('div', { style: 'position:relative;display:inline-block' });
    const histBtn = el('button', { className: 'btn btn-o', textContent: '이전 버전 (' + history.length + ')' });
    const histDropdown = el('div', { style: 'display:none;position:absolute;top:100%;left:0;z-index:100;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);box-shadow:var(--shadow-md);min-width:280px;max-width:380px;margin-top:6px;padding:8px 0;overflow:hidden' });
    history.forEach((h, i) => {
      const item = el('div', { style: 'padding:10px 16px;cursor:pointer;font-size:13px;line-height:1.5;transition:background .15s;border-bottom:1px solid var(--bdr)' });
      item.appendChild(el('div', { style: 'font-weight:600;color:var(--t1)', textContent: (h.longform && h.longform.title) || '대본 ' + (i + 1) }));
      item.appendChild(el('div', { style: 'font-size:11px;color:var(--t4);margin-top:2px', textContent: h._savedAt || '' }));
      item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg2)'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; });
      item.addEventListener('click', () => {
        histDropdown.style.display = 'none';
        const restored = history[i];
        sSet({ [K.SCRIPT_SCR_DUAL]: restored, [K.SCRIPT_SCR]: null, [K.SCRIPT_ES]: restored.longform ? restored.longform.content : '' });
        renderDualScript(restored, styles);
        toast('이전 버전이 복원되었습니다');
      });
      histDropdown.appendChild(item);
    });
    histBtn.addEventListener('click', () => {
      const isOpen = histDropdown.style.display !== 'none';
      histDropdown.style.display = isOpen ? 'none' : 'block';
    });
    // 외부 클릭 시 닫기 (AbortController로 누수 방지)
    document.addEventListener('click', (e) => {
      if (!histWrap.contains(e.target)) histDropdown.style.display = 'none';
    }, { signal: _docClickAC.signal });
    histWrap.appendChild(histBtn);
    histWrap.appendChild(histDropdown);
    ctrlRow.appendChild(histWrap);
  }
  root.appendChild(ctrlRow);

  if (shortsOnly) {
    root.appendChild(_buildShortsCard(shorts));
  } else {
    const grid = el('div', { id: 'scriptGrid', style: 'display:flex;gap:16px;align-items:flex-start' });

    const lfCard = _buildLongformCard(lf);
    lfCard.style.flex = '1 1 0';
    lfCard.style.minWidth = '0';
    grid.appendChild(lfCard);

    const sfCard = _buildShortsCard(shorts);
    sfCard.style.flex = '1 1 0';
    sfCard.style.minWidth = '0';
    grid.appendChild(sfCard);
    root.appendChild(grid);
  }

  // sticky action bar
  const stickyBar = el('div', { className: 'sticky-bar', style: 'flex-direction:column;gap:8px' });
  const stickyRow = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;width:100%;gap:12px' });
  stickyRow.appendChild(el('div', { id: 's6CostHint', style: 'font-size:12px;color:var(--t4);flex:1' }));
  const fcBtn = el('button', { className: 'btn bp btn-lg', id: 's6b', style: 'opacity:.4;flex-shrink:0', textContent: '스크립트를 선택해주세요' });
  fcBtn.disabled = true;
  fcBtn.addEventListener('click', () => { _commitSelection(); sNext(); });
  stickyRow.appendChild(fcBtn);
  stickyBar.appendChild(stickyRow);
  root.appendChild(stickyBar);

  // 선택 토글
  _bindScriptSel(root);

  // textarea 항상 편집 가능 상태로 초기화
  setTimeout(() => {
    root.querySelectorAll('textarea').forEach(x => { x.readOnly = false; x.style.cursor = 'text'; });
    root.querySelectorAll('.script-sel').forEach(x => { x.style.cursor = 'pointer'; });
  }, 0);
}

// ── Step 6 ──
registerStep(6, () => {
  let styles = [];
  try { styles = JSON.parse(localStorage.getItem('yt_a_sty')); } catch(e) {}
  if (!styles || !styles.length) styles = M.styles;
  styles = styles.filter(s => { return s.on !== false; });
  const isShortMode = S.search.filterDuration === 'short';

  if (S.script.scrDual) { renderDualScript(S.script.scrDual, styles); return; }
  if (S.script.scr) { renderDualScript({ longform: S.script.scr, shorts: [] }, styles); return; }

  const modeLabel = isShortMode ? '숏폼(30초~1분) 5개를 생성합니다' : '롱폼(20분+) + 숏폼(30초) 5개를 동시에 생성합니다';

  const root = $('p6');
  root.textContent = '';

  const backBtn = el('button', { className: 'btn bs back-link', textContent: '\u2190 영상 분석' });
  backBtn.addEventListener('click', () => { sPrev(); });
  root.appendChild(backBtn);

  root.appendChild(el('h2', { className: 'pt', textContent: '스크립트 생성' }));
  root.appendChild(el('p', { className: 'pd', textContent: '스타일을 선택하면 ' + modeLabel }));

  const ctrlRow = el('div', { className: 'tag-row' });
  ctrlRow.appendChild(_buildStyleSelect(styles));
  const genBtn = el('button', { className: 'btn bp', id: 'gbtn', textContent: '대본 생성' });
  ctrlRow.appendChild(genBtn);
  root.appendChild(ctrlRow);
  root.appendChild(el('div', { id: 'sout' }));

  genBtn.addEventListener('click', () => {
    if (_scriptJobRunning) {
      toast('대본 생성이 이미 진행 중입니다. 잠시만 기다려주세요.', 'err');
      return;
    }
    const runId = ++_scriptRunId;
    _scriptJobRunning = true;
    genBtn.disabled = true;
    genBtn.textContent = '생성 중...';
    const opt = $('ssel').options[$('ssel').selectedIndex];
    const styName = opt.text.split(' \u2014')[0];
    const styPrompt = opt.dataset.prompt || '';
    const sout = $('sout');

    if (isShortMode) {
      _shortsOnlyJobRunning = true;
      sout.textContent = '';
      sout.appendChild(el('div', { id: 'scrLoad' }));
      const prog = createProgress('scrLoad', 'AI 숏폼 대본 작성', ['분석 결과 반영', '숏폼 대본 5개 생성'], 30);
      let stepCount = 0;
      const stepTimer = setInterval(() => { prog.nextStep(); if (stepCount === 0) prog.updateMessage('AI 응답 대기 중...'); else prog.updateMessage('대본 생성 중...'); stepCount++; }, 10000);
      withTimeout((signal) => Api.genShortsOnly(S.analysis.ana, styName, styPrompt, { signal: mergeAbortSignals(signal, _scriptLeaveAC.signal) }), TIMEOUT.SCRIPT_SHORTS, '대본 생성 시간이 초과되었습니다.').then(r => {
        if (runId !== _scriptRunId) return;
        clearInterval(stepTimer); prog.complete();
        setTimeout(() => {
          if (runId !== _scriptRunId) return;
          sSet({ [K.SCRIPT_SCR_DUAL]: r, [K.SCRIPT_SCR]: null, [K.SCRIPT_ES]: '' });
          genBtn.disabled = false; genBtn.textContent = '다시 생성';
          renderDualScript(r, styles);
        }, 600);
      }).catch(e => {
        if (runId !== _scriptRunId) return;
        clearInterval(stepTimer); prog.fail();
        genBtn.disabled = false; genBtn.textContent = '대본 생성';
        _showRetryError(friendlyError(e));
      }).finally(() => {
        if (runId === _scriptRunId) {
          _shortsOnlyJobRunning = false;
          _scriptJobRunning = false;
        }
      });
    } else {
      sout.textContent = '';

      // ── 실시간 미리보기 UI 구성 ──
      const liveCard = el('div', { className: 'cd', style: 'border-left:4px solid #2563EB' });
      const liveHeader = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px' });
      const liveHeaderLeft = el('div', { className: 'fx-row' });
      liveHeaderLeft.appendChild(el('span', { className: 'badge-longform', textContent: '롱폼 실시간 생성 중' }));
      const liveDot = el('span', { style: 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#2563EB;animation:pulse 1s infinite' });
      liveHeaderLeft.appendChild(liveDot);
      const liveBadge = liveHeaderLeft.querySelector('span');
      liveHeader.appendChild(liveHeaderLeft);
      const liveCount = el('span', { style: 'font-size:11px;color:var(--t4);font-family:var(--mono,monospace)', textContent: '0자' });
      liveHeader.appendChild(liveCount);
      liveCard.appendChild(liveHeader);

      const liveArea = el('div', {
        style: 'font-size:13px;line-height:1.8;min-height:200px;max-height:400px;overflow-y:auto;white-space:pre-wrap;color:var(--t1);padding:12px;background:var(--bg);border-radius:var(--r);border:1px solid var(--bdr)'
      });
      liveCard.appendChild(liveArea);

      // pulse 애니메이션 (없으면 추가)
      if (!document.getElementById('_streamPulse')) {
        const style = el('style', { id: '_streamPulse' });
        style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}';
        document.head.appendChild(style);
      }

      sout.appendChild(liveCard);
      sout.appendChild(buildCancelBtn());

      // 숏폼 진행 영역 (롱폼 완료 후 표시)
      const sfLoadWrap = el('div', { id: 'sfLoad', style: 'display:none;margin-top:12px' });
      sout.appendChild(sfLoadWrap);

      let charCount = 0;

      // ── 스트리밍 호출 ──
      setSaveBlocked(true);
      withTimeout(
        (signal) => Api.genScriptDualStream(
          S.analysis.ana, styName, styPrompt,
          // onLfChunk: 롱폼 실시간 표시
          (chunk, fullSoFar) => {
            if (runId !== _scriptRunId) return;
            charCount = fullSoFar.length;
            // ★ P2-11: 전체 재할당 대신 청크만 append — 긴 대본에서 DOM 성능 개선
            liveArea.appendChild(document.createTextNode(chunk));
            liveCount.textContent = charCount + '자';
            // 자동 스크롤
            liveArea.scrollTop = liveArea.scrollHeight;
          },
          // onShortsStart: 롱폼 완료 → 숏폼 전환 표시
          (longform) => {
            if (runId !== _scriptRunId) return;
            liveDot.style.animation = 'none';
            liveDot.style.background = '#10B981';
            if (liveBadge) {
              liveBadge.textContent = '롱폼 생성 완료';
              liveBadge.style.color = '#10B981';
              liveBadge.style.background = 'rgba(16,185,129,.1)';
            }
            liveCount.textContent = (longform ? longform.content.length : charCount) + '자 완료';

            // 숏폼 진행 표시
            const sfWrap = $('sfLoad');
            if (sfWrap) {
              sfWrap.style.display = 'block';
              const sfCard = el('div', { className: 'cd', style: 'border-left:4px solid #DC2626;padding:16px 20px;display:flex;align-items:center;gap:12px' });
              sfCard.appendChild(el('div', { className: 'sp', style: 'width:20px;height:20px;border-width:2px;flex-shrink:0' }));
              sfCard.appendChild(el('div', { style: 'flex:1' },));
              sfCard.lastChild.appendChild(el('div', { style: 'font-size:13px;font-weight:600;color:#DC2626', textContent: '숏폼 대본 5개 생성 중...' }));
              sfCard.lastChild.appendChild(el('div', { className: 'note-xs', textContent: '롱폼 기반으로 다른 앵글의 숏폼을 제작합니다' }));
              sfWrap.appendChild(sfCard);
            }
          },
          { signal: mergeAbortSignals(signal, _scriptLeaveAC.signal) }
        ),
        TIMEOUT.SCRIPT,
        '대본 생성 시간이 초과되었습니다.'
      ).then(r => {
        if (runId !== _scriptRunId) return;
        // 전체 완료 (롱폼+숏폼 모두)
        setSaveBlocked(false);
        liveDot.style.animation = 'none';
        liveDot.style.background = '#10B981';
        if (liveBadge) {
          liveBadge.textContent = '롱폼 생성 완료';
          liveBadge.style.color = '#10B981';
          liveBadge.style.background = 'rgba(16,185,129,.1)';
        }
        liveCount.textContent = (r.longform ? r.longform.content.length : charCount) + '자 완료';

        // 숏폼 완료 표시
        const sfWrap = $('sfLoad');
        if (sfWrap && sfWrap.style.display !== 'none') {
          sfWrap.textContent = '';
          const doneCard = el('div', { style: 'padding:12px 16px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15);border-radius:var(--r2);display:flex;align-items:center;gap:8px' });
          doneCard.appendChild(el('span', { style: 'color:#10B981;font-size:14px', textContent: '✓' }));
          doneCard.appendChild(el('span', { style: 'font-size:13px;font-weight:600;color:#10B981', textContent: '숏폼 ' + (r.shorts ? r.shorts.length : 0) + '개 생성 완료' }));
          sfWrap.appendChild(doneCard);
        }

        // 최종 결과 렌더
        setTimeout(() => {
          if (runId !== _scriptRunId) return;
          sSet({ [K.SCRIPT_SCR_DUAL]: r, [K.SCRIPT_SCR]: r.longform, [K.SCRIPT_ES]: r.longform.content });
          genBtn.disabled = false; genBtn.textContent = '다시 생성';
          renderDualScript(r, styles);
        }, 800);
      }).catch(e => {
        if (runId !== _scriptRunId) return;
        setSaveBlocked(false);
        liveDot.style.animation = 'none';
        liveDot.style.background = '#EF4444';
        if (liveBadge) {
          liveBadge.textContent = '생성 실패';
          liveBadge.style.color = '#EF4444';
          liveBadge.style.background = 'rgba(239,68,68,.1)';
        }
        genBtn.disabled = false; genBtn.textContent = '대본 생성';
        _showRetryError(friendlyError(e));
      }).finally(() => {
        if (runId === _scriptRunId) {
          setSaveBlocked(false);
          _scriptJobRunning = false;
          _shortsOnlyJobRunning = false;
        }
      });
    }
  });
});
