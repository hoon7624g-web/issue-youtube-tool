// ═══════════════════════════════════════
// pipeline/step7-factcheck.js — 배치 팩트 검증 (페이지네이션)
// v3.6.0 — build fix: previewText 멀티라인 문자열 파싱 오류 수정
// ═══════════════════════════════════════
import { $, toast, withTimeout, friendlyError, TIMEOUT, createProgress, el, confirmModal, mergeAbortSignals } from '../utils.js';
import { S, sSet, sNext, sPrev, sOn } from '../state.js';
import { K } from '../constants.js';
import { Api } from '../api.js';
import { registerStep } from '../router.js';
import { ResultTabs } from '../components.js';
import { saveToHistory } from './history.js';

let _fcPage = 0;
// 원본 대본 보관 (팩트체크 진입 시 최초 저장, 비교용)
let _originalScripts = {};
// Undo 스택: 삭제 전 상태를 보존 (되돌리기용)
let _undoStack = [];
let _fcLeaveAC = new AbortController();

// ★ P1-10: step 이탈 시 in-flight 팩트체크 무효화 + 새 프로젝트 리셋
sOn(K.NAV_STEP, (step) => {
  if (step !== 7) {
    _fcRunId++;
    _fcJobRunning = false;
    try { _fcLeaveAC.abort(new Error('step-leave')); } catch (e) {}
    _fcLeaveAC = new AbortController();
  }
  if (step <= 2) {
    _fcPage = 0;
    _originalScripts = {};
    _undoStack = [];
  }
});

const MAX_UNDO = 10;

function escapeRegExp(text) {
  return String(text || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function isValidResult(r) {
  return !!(r && r.script && typeof r.script.content === 'string' && typeof r.script.type === 'string');
}

function getResultArray() {
  return Array.isArray(S.script.results) ? S.script.results : [];
}

function _storeOriginals() {
  const results = getResultArray();
  if (!results.every(isValidResult)) return;

  results.forEach((r, i) => {
    if (!_originalScripts[i]) {
      _originalScripts[i] = r.script.content || '';
    }
  });
}

function _fcBuildTabs(results, activePage) {
  return ResultTabs(results, activePage, _fcGoPage);
}

function rAllFC() {
  const results = getResultArray();
  const root = $('p7');
  root.textContent = '';

  if (!results.length) {
    _fcPage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '팩트 검증 결과' }));
    root.appendChild(el('div', { className: 'cd', textContent: '팩트체크 결과를 표시할 스크립트가 없습니다.' }));
    return;
  }

  if (!results.every(isValidResult)) {
    _fcPage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '팩트 검증 결과' }));
    root.appendChild(el('div', { className: 'cd', textContent: '팩트체크 결과 데이터가 손상되었습니다. 이전 단계부터 다시 진행해주세요.' }));
    return;
  }

  _storeOriginals();

  const page = Math.max(0, Math.min(_fcPage, results.length - 1));
  _fcPage = page;
  const r = results[page];
  const typeLabel = r.script.type === 'longform' ? '🎬 롱폼' : '📱 숏폼 ' + ((r.script.idx || 0) + 1);
  const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
  const fcs = r.fcs || [];
  const lb = { safe: '안전', warning: '주의', uncertain: '미확인' };
  const bc = { safe: 'bg2', warning: 'by', uncertain: 'br' };

  root.appendChild(el('h2', { className: 'pt', textContent: '팩트 검증 결과' }));
  root.appendChild(el('p', { className: 'pd', textContent: results.length + '개 스크립트 · ' + (page + 1) + '/' + results.length + ' 페이지' }));
  root.appendChild(
    el('div', {
      style: 'font-size:11px;color:var(--t4);margin:-16px 0 16px',
      textContent:
        'LLM 팩트체크 총 ' +
        results.length +
        '회 호출 완료 · 대본 일부가 AI 서비스' +
        (r.factCheckedBy === 'perplexity' ? '(Perplexity)' : '') +
        '에 전송되어 검증되었습니다',
    }),
  );

  root.appendChild(_fcBuildTabs(results, page));

  const card = el('div', { className: 'cd cd-bar-green', style: 'border-left:4px solid ' + typeColor });
  const hdr = el('div', { className: 'fx-row mb-16' });

  hdr.appendChild(
    el('span', {
      style:
        'font-size:12px;font-weight:600;color:' +
        typeColor +
        ';background:' +
        typeColor +
        '12;padding:3px 8px;border-radius:4px',
      textContent: typeLabel,
    }),
  );
  hdr.appendChild(el('span', { className: 't-title', textContent: r.script.title || '' }));
  hdr.appendChild(el('span', { className: 'bdg bg2 t-3xs ml-auto', textContent: '팩트체크 ' + fcs.length + '건' }));

  const checkedBy = S.script.factCheckedBy || 'llm';
  if (checkedBy === 'perplexity') {
    hdr.appendChild(
      el('span', {
        style:
          'font-size:10px;font-weight:600;color:#06B6D4;background:rgba(6,182,212,.1);padding:3px 8px;border-radius:4px',
        textContent: '🌐 Perplexity 실시간 검증',
      }),
    );
  } else {
    hdr.appendChild(
      el('span', {
        style: 'font-size:10px;font-weight:600;color:var(--t3);background:var(--bg2);padding:3px 8px;border-radius:4px',
        textContent: '🤖 AI 일반 검증',
      }),
    );
  }

  card.appendChild(hdr);

  const filterBar = el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' });
  const safeCount = fcs.filter((f) => f.st === 'safe').length;
  const issueCount = fcs.length - safeCount;
  filterBar.appendChild(
    el('span', {
      className: 't-xs-t3',
      textContent: '전체 ' + fcs.length + '건 (주의/미확인 ' + issueCount + '건, 안전 ' + safeCount + '건)',
    }),
  );

  let _hideSafe = false;
  if (safeCount > 0) {
    const filterBtn = el('button', {
      className: 'btn btn-o',
      style: 'font-size:11px;padding:4px 10px;margin-left:auto',
      textContent: '안전 항목 숨기기',
    });

    filterBtn.addEventListener('click', () => {
      _hideSafe = !_hideSafe;
      filterBtn.textContent = _hideSafe ? '안전 항목 보이기' : '안전 항목 숨기기';
      card.querySelectorAll('[data-fc-st]').forEach((row) => {
        if (row.dataset.fcSt === 'safe') row.style.display = _hideSafe ? 'none' : '';
      });
    });

    filterBar.appendChild(filterBtn);
  }

  if (_undoStack.length > 0) {
    const undoBanner = el('div', {
      style:
        'margin-bottom:12px;padding:10px 14px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.12);border-radius:var(--r);display:flex;align-items:center;gap:10px',
    });

    undoBanner.appendChild(el('span', { style: 'font-size:13px', textContent: '↩️' }));
    undoBanner.appendChild(
      el('span', {
        style: 'font-size:12px;color:#2563EB;flex:1',
        textContent: '마지막 삭제를 되돌릴 수 있습니다 (' + _undoStack.length + '건)',
      }),
    );

    const undoBtn = el('button', {
      className: 'btn bs',
      style: 'font-size:11px;padding:4px 12px;color:#2563EB;border-color:rgba(37,99,235,.25)',
      textContent: '되돌리기',
    });

    undoBtn.addEventListener('click', () => {
      const snapshot = _undoStack.pop();
      if (!snapshot) return;

      sSet({ [K.SCRIPT_RESULTS]: snapshot.results });
      if (snapshot.scrDual) S.script.scrDual = snapshot.scrDual;

      toast('삭제가 되돌려졌습니다');
      rAllFC();
    });

    undoBanner.appendChild(undoBtn);
    card.appendChild(undoBanner);
  }

  card.appendChild(filterBar);

  if (fcs.length) {
    fcs.forEach((f, fi) => {
      const row = el('div', {
        style: 'display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:6px;background:var(--bg);border-radius:var(--r)',
      });
      row.dataset.fcSt = f.st || '';

      const info = el('div', { className: 'flex-1' });
      info.appendChild(el('div', { style: 'font-size:14px;line-height:1.6;font-weight:500', textContent: f.text || '' }));
      info.appendChild(el('div', { style: 'font-size:12px;color:var(--t3);margin-top:4px', textContent: f.note || '' }));
      row.appendChild(info);

      row.appendChild(el('span', { className: 'bdg ' + (bc[f.st] || 'bg2'), style: 'flex-shrink:0', textContent: lb[f.st] || f.st || '' }));

      const delBtn = el('button', {
        className: 'btn bs',
        style: 'flex-shrink:0;font-size:11px;padding:4px 10px;color:var(--red)',
        textContent: '삭제',
      });

      delBtn.addEventListener('click', async () => {
        const currentScript = (S.script.results[page] && S.script.results[page].script.content) || '';
        const escaped = escapeRegExp(f.text || '');
        let matchFound = false;
        let matchCount = 0;

        if (f.text && f.text.length >= 10) {
          const matches = escaped ? currentScript.match(new RegExp(escaped, 'g')) : null;
          matchCount = matches ? matches.length : 0;
          matchFound = matchCount === 1;
        }

        let previewText;

        if (matchFound) {
          previewText = `다음 문장을 대본에서 제거합니다:

「${(f.text || '').substring(0, 150)}」

삭제 후 "되돌리기"로 복원할 수 있습니다.`;
        } else if (matchCount > 1) {
          previewText = `다음 팩트체크 항목을 목록에서 제거합니다:

「${(f.text || '').substring(0, 150)}」

대본에서 ${matchCount}곳이 매칭되어 오삭제 방지를 위해 대본은 수정하지 않습니다.
필요하면 대본을 직접 편집해주세요.`;
        } else {
          previewText = `다음 팩트체크 항목을 목록에서 제거합니다:

「${(f.text || '').substring(0, 150)}」

대본에서 정확히 일치하는 문장을 찾지 못했습니다.
팩트체크 목록에서만 제거되며, 대본 본문은 변경되지 않습니다.
필요하면 대본을 직접 편집해주세요.`;
        }

        const ok = await confirmModal(previewText, {
          confirmText: matchFound ? '삭제 반영' : '목록에서 제거',
          cancelText: '취소',
          danger: true,
        });
        if (!ok) return;

        const undoSnapshot = {
          results: JSON.parse(JSON.stringify(S.script.results)),
          scrDual: S.script.scrDual ? JSON.parse(JSON.stringify(S.script.scrDual)) : null,
        };

        _undoStack.push(undoSnapshot);
        if (_undoStack.length > MAX_UNDO) _undoStack.shift();

        const newResults = S.script.results.slice();
        const newFcs = newResults[page].fcs.slice();
        newFcs.splice(fi, 1);
        newResults[page] = Object.assign({}, newResults[page], { fcs: newFcs });

        if (f.text && matchFound) {
          let content = newResults[page].script.content || '';
          const pattern = new RegExp(escaped + '[.!?]?\\s*', 'g');
          content = content.replace(pattern, '');
          newResults[page].script = Object.assign({}, newResults[page].script, { content: content.trim() });

          if (S.script.scrDual) {
            if (newResults[page].script.type === 'longform' && S.script.scrDual.longform) {
              S.script.scrDual = Object.assign({}, S.script.scrDual, {
                longform: Object.assign({}, S.script.scrDual.longform, { content: content.trim() }),
              });
            } else if (
              newResults[page].script.type === 'short' &&
              typeof newResults[page].script.idx === 'number' &&
              Array.isArray(S.script.scrDual.shorts)
            ) {
              const idx = newResults[page].script.idx;
              const shorts = S.script.scrDual.shorts.slice();
              if (shorts[idx]) {
                shorts[idx] = Object.assign({}, shorts[idx], { content: content.trim() });
                S.script.scrDual = Object.assign({}, S.script.scrDual, { shorts });
              }
            }
          }

          sSet({ [K.SCRIPT_RESULTS]: newResults });
          toast('팩트체크 항목이 삭제되고 대본에 반영되었습니다 (되돌리기 가능)');
        } else {
          sSet({ [K.SCRIPT_RESULTS]: newResults });
          const reason =
            matchCount > 1
              ? '팩트체크 목록에서 제거됨 (대본 ' + matchCount + '곳 매칭 — 수동 편집 필요)'
              : '팩트체크 목록에서 제거됨 (대본 미변경 — 직접 편집 필요)';
          toast(reason, 'err');
        }

        rAllFC();
      });

      row.appendChild(delBtn);
      card.appendChild(row);
    });
  } else {
    card.appendChild(el('div', { className: 'empty-msg', textContent: '검증 항목이 없습니다' }));
  }

  const previewWrap = el('div', { style: 'margin-top:16px;border-top:1px solid var(--bdr);padding-top:16px' });
  const previewHeader = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' });
  previewHeader.appendChild(el('div', { className: 't-subtitle', textContent: '대본 미리보기' }));

  const originalContent = _originalScripts[page] || '';
  const currentContent = r.script.content || '';
  const hasChanges = originalContent && originalContent !== currentContent;

  if (hasChanges) {
    const compareBtn = el('button', {
      className: 'btn bg',
      style: 'font-size:11px;padding:3px 10px;color:var(--blu)',
      textContent: '🔀 원문과 비교',
    });

    let showingCompare = false;
    compareBtn.addEventListener('click', () => {
      showingCompare = !showingCompare;
      compareBtn.textContent = showingCompare ? '📝 현재 대본만 보기' : '🔀 원문과 비교';

      const container = $('scriptCompareView');
      if (!container) return;

      container.textContent = '';

      if (showingCompare) {
        const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });

        const origCol = el('div');
        origCol.appendChild(el('div', { style: 'font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px', textContent: '원본 (팩트체크 전)' }));
        origCol.appendChild(
          el('div', {
            style:
              'font-size:12px;line-height:1.7;padding:10px;background:rgba(201,42,42,.04);border:1px solid rgba(201,42,42,.12);border-radius:var(--r);max-height:200px;overflow-y:auto;white-space:pre-wrap;color:var(--t2)',
            textContent: originalContent.substring(0, 800) + (originalContent.length > 800 ? '...' : ''),
          }),
        );
        grid.appendChild(origCol);

        const curCol = el('div');
        curCol.appendChild(el('div', { style: 'font-size:11px;font-weight:600;color:var(--grn);margin-bottom:4px', textContent: '수정본 (현재)' }));
        curCol.appendChild(
          el('div', {
            style:
              'font-size:12px;line-height:1.7;padding:10px;background:rgba(13,146,84,.04);border:1px solid rgba(13,146,84,.12);border-radius:var(--r);max-height:200px;overflow-y:auto;white-space:pre-wrap;color:var(--t2)',
            textContent: currentContent.substring(0, 800) + (currentContent.length > 800 ? '...' : ''),
          }),
        );
        grid.appendChild(curCol);

        const diffLen = originalContent.length - currentContent.length;
        const diffSummary = el('div', {
          style: 'margin-top:6px;font-size:11px;color:var(--t3)',
          textContent:
            '변경: ' +
            (diffLen > 0 ? diffLen + '자 삭제됨' : Math.abs(diffLen) + '자 추가됨') +
            ' (원본 ' +
            originalContent.length +
            '자 → 현재 ' +
            currentContent.length +
            '자)',
        });

        container.appendChild(grid);
        container.appendChild(diffSummary);
      } else {
        container.appendChild(
          el('div', {
            className: 'out',
            style: 'max-height:200px;overflow-y:auto;padding:12px;background:var(--bg);border-radius:var(--r);font-size:13px;line-height:1.8',
            textContent: currentContent.substring(0, 800) + (currentContent.length > 800 ? '...' : ''),
          }),
        );
      }
    });

    previewHeader.appendChild(compareBtn);
  }

  previewWrap.appendChild(previewHeader);

  const compareContainer = el('div', { id: 'scriptCompareView' });
  compareContainer.appendChild(
    el('div', {
      className: 'out',
      style: 'max-height:200px;overflow-y:auto;padding:12px;background:var(--bg);border-radius:var(--r);font-size:13px;line-height:1.8',
      textContent: currentContent.substring(0, 800) + (currentContent.length > 800 ? '...' : ''),
    }),
  );
  previewWrap.appendChild(compareContainer);

  if (hasChanges) {
    previewWrap.appendChild(
      el('div', {
        style: 'margin-top:6px;font-size:11px;color:var(--acc)',
        textContent: '⚠ 팩트체크 삭제로 원본 대비 대본이 수정되었습니다',
      }),
    );
  }

  card.appendChild(previewWrap);
  root.appendChild(card);

  const navRow = el('div', { className: 'sticky-bar' });

  if (page > 0) {
    const prevBtn = el('button', { className: 'btn bs', textContent: '← 이전 스크립트' });
    prevBtn.addEventListener('click', () => {
      _fcGoPage(page - 1);
    });
    navRow.appendChild(prevBtn);
  } else {
    navRow.appendChild(el('div'));
  }

  navRow.appendChild(el('span', { className: 't-xs-t3', textContent: '팩트체크 ' + fcs.length + '건 · ' + (page + 1) + '/' + results.length }));

  if (page < results.length - 1) {
    const nextBtn = el('button', { className: 'btn bp', textContent: '다음 스크립트 →' });
    nextBtn.addEventListener('click', () => {
      _fcGoPage(page + 1);
    });
    navRow.appendChild(nextBtn);
  } else {
    const saveBtn = el('button', { className: 'btn bs', style: 'font-size:12px', textContent: '💾 대본 저장' });
    saveBtn.addEventListener('click', () => {
      try {
        saveToHistory();
        toast('현재 작업이 히스토리에 저장되었습니다');
      } catch (e) {
        toast('저장 실패', 'err');
      }
    });
    navRow.appendChild(saveBtn);

    const goBtn = el('button', { className: 'btn bp btn-lg', textContent: '풋티지 브리프 →' });
    goBtn.addEventListener('click', () => {
      sNext();
    });
    navRow.appendChild(goBtn);
  }

  root.appendChild(navRow);
}

function _fcGoPage(p) {
  _fcPage = p;
  rAllFC();
}

let _fcJobRunning = false;
let _fcRunId = 0;

async function processAllFactCheck() {
  if (_fcJobRunning) return;
  _fcJobRunning = true;
  const runId = ++_fcRunId;

  try {
    while (true) {
      _storeOriginals();
      if (runId !== _fcRunId) return;

      const results = getResultArray();
      if (!results.length || !results.every(isValidResult)) {
        toast('팩트체크할 스크립트 데이터가 손상되었습니다. 대본 생성 단계로 돌아갑니다.', 'err');
        sPrev();
        return;
      }

      const idx = results.findIndex((r) => !r.fcs);
      if (idx === -1) {
        _fcPage = 0;
        try {
          saveToHistory();
        } catch (e) {}
        rAllFC();
        return;
      }

      const current = results[idx];
      const total = results.length;
      const stepLabels = results.map((r) => {
        const label = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);
        return label + ': ' + r.script.title.substring(0, 20);
      });

      const root = $('p7');
      root.textContent = '';

      const txNotice = el('div', {
        style:
          'margin-bottom:12px;padding:10px 14px;background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.12);border-radius:var(--r);font-size:11px;color:var(--t3);display:flex;align-items:center;gap:8px',
      });
      txNotice.appendChild(el('span', { textContent: '🔒' }));
      txNotice.appendChild(
        el('span', {
          textContent:
            '대본 일부가 AI 서비스(' +
            (S.script.factCheckedBy === 'perplexity' ? 'Perplexity' : 'Claude/Gemini') +
            ')에 전송되어 검증됩니다. 회사 서버에는 저장되지 않습니다.',
        }),
      );
      root.appendChild(txNotice);

      const loadDiv = el('div', { id: 'fcLoad' });
      root.appendChild(loadDiv);

      const prog = createProgress('fcLoad', '팩트 검증 (' + (idx + 1) + '/' + total + ')', stepLabels, 20 * total);
      for (let i = 0; i < idx; i++) prog.nextStep();

      try {
        const fcs = await withTimeout((signal) => Api.factCheck(current.script.content, { signal: mergeAbortSignals(signal, _fcLeaveAC.signal) }), TIMEOUT.FACTCHECK, '팩트 검증 시간이 초과되었습니다.');
        if (runId !== _fcRunId) return;

        prog.nextStep();
        const newResults = S.script.results.slice();
        newResults[idx] = Object.assign({}, newResults[idx], { fcs });
        sSet({ [K.SCRIPT_RESULTS]: newResults });
      } catch (e) {
        if (runId !== _fcRunId) return;

        prog.nextStep();
        const newResults = S.script.results.slice();
        newResults[idx] = Object.assign({}, newResults[idx], { fcs: [] });
        sSet({ [K.SCRIPT_RESULTS]: newResults });
        toast(current.script.title + ' 팩트 검증 실패: ' + friendlyError(e), 'err');
      } finally {
        prog.destroy();
      }
    }
  } finally {
    if (runId === _fcRunId) _fcJobRunning = false;
  }
}

// ── Step 7 ──
registerStep(7, () => {
  const results = getResultArray();

  if (!results.length) {
    if (S.script.fcs && S.script.fcs.length) {
      rAllFC();
      return;
    }
    toast('선택된 스크립트가 없습니다. 대본 생성 단계로 돌아갑니다.', 'err');
    sPrev();
    return;
  }

  if (!results.every(isValidResult)) {
    toast('스크립트 데이터가 손상되었습니다. 대본 생성 단계로 돌아갑니다.', 'err');
    sPrev();
    return;
  }

  if (results.every((r) => !!r.fcs)) {
    _fcPage = 0;
    rAllFC();
    return;
  }

  processAllFactCheck();
});