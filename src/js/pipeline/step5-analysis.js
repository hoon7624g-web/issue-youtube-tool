// ═══════════════════════════════════════
// pipeline/step5-analysis.js — 영상 분석
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, toast, withTimeout, friendlyError, TIMEOUT, TIMING, createProgress , el, safeUrl, fmt, mergeAbortSignals } from '../utils.js';
import { S, sSet, sNext, sPrev, sOn } from '../state.js';
import { K } from '../constants.js';
import { Api } from '../api.js';

let _analysisJobRunning = false;
let _analysisRunId = 0;
let _analysisLeaveAC = new AbortController();
import { getApiKeys } from '../../client-proxy.js';
import { registerStep, runStep } from '../router.js';
import { Card, CopyButton, AccentList, DeviceNotice } from '../components.js';
import { getCachedSubtitle, prefetchSubtitle } from '../shared.js';

sOn(K.NAV_STEP, (step) => {
  if (step !== 5) {
    _analysisRunId++;
    _analysisJobRunning = false;
    try { _analysisLeaveAC.abort(new Error('step-leave')); } catch (e) {}
    _analysisLeaveAC = new AbortController();
  }
});

// ── 분석 결과 렌더링 ──
function rAna() {
  const a = S.analysis.ana;
  const root = $('p5');
  root.textContent = '';

  root.appendChild(el('h2', { className: 'pt', textContent: '영상 분석 결과' }));

  // 2-7: 분석 방식 배지
  const methodMap = { video: { text: '\uD83C\uDFAC AI Studio 영상 분석', color: '#4285F4', bg: 'rgba(66,133,244,.08)' }, subtitle: { text: '\uD83D\uDCDD 자막 기반 분석', color: '#D97706', bg: 'rgba(217,119,6,.08)' }, title_only: { text: '\uD83D\uDCCB 제목/설명 기반 분석', color: '#6B7280', bg: 'rgba(107,114,128,.08)' } };
  const m = methodMap[a._method] || methodMap.subtitle;
  root.appendChild(el('div', { style: 'margin-bottom:16px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:' + m.color + ';background:' + m.bg + ';padding:5px 12px;border-radius:6px', textContent: m.text }));
  if (a._usedFallback) {
    const fallbackNote = el('div', { style: 'margin:-4px 0 16px;padding:10px 12px;border:1px solid rgba(217,119,6,.18);background:rgba(245,158,11,.06);border-radius:10px' });
    fallbackNote.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:#B45309;margin-bottom:4px', textContent: 'AI Studio 직접 분석 중 오류가 발생해 대체 분석으로 전환되었습니다.' }));
    fallbackNote.appendChild(el('div', { style: 'font-size:12px;color:var(--t3);line-height:1.6', textContent: a._method === 'subtitle' ? '저장된 자막을 활용해 분석을 이어갔습니다.' : '자막이 없어 제목/설명 기반으로 분석을 이어갔습니다.' }));
    if (a._fallbackReason) {
      fallbackNote.appendChild(el('div', { style: 'font-size:11px;color:var(--t4);margin-top:6px;word-break:break-word', textContent: '원인: ' + a._fallbackReason }));
    }
    root.appendChild(fallbackNote);
  }

  // 요약
  const sumHdr = el('div', { className: 'fx-row mb-8' });
  sumHdr.appendChild(el('div', { className: 'st mb-0', textContent: '요약' }));
  sumHdr.appendChild(CopyButton(() => a.summary || ''));
  sumHdr.querySelector('.btn').style.cssText = 'margin-left:auto;font-size:11px';
  const sumBody = el('p', { style: 'font-size:14px;line-height:1.9;color:var(--t2)', textContent: a.summary || '' });
  root.appendChild(Card({ children: [sumHdr, sumBody] }));

  // 훅 포인트 + 잘된 이유
  const grid = el('div', { className: 'g2' });

  const hookHdr = el('div', { className: 'fx-row mb-8' });
  hookHdr.appendChild(el('div', { className: 'st mb-0', textContent: '훅 포인트' }));
  hookHdr.appendChild(CopyButton(() => (a.hooks || []).join('\n')));
  hookHdr.querySelector('.btn').style.cssText = 'margin-left:auto;font-size:11px';
  grid.appendChild(Card({ children: [hookHdr, AccentList(a.hooks, 'al-acc')] }));

  const reasonHdr = el('div', { className: 'fx-row mb-8' });
  reasonHdr.appendChild(el('div', { className: 'st mb-0', textContent: '잘된 이유' }));
  reasonHdr.appendChild(CopyButton(() => (a.reasons || []).join('\n')));
  reasonHdr.querySelector('.btn').style.cssText = 'margin-left:auto;font-size:11px';
  grid.appendChild(Card({ children: [reasonHdr, AccentList(a.reasons, 'al-grn')] }));
  root.appendChild(grid);

  // 영상 구조 (+ 복사 버튼 — #7 수정)
  const structHdr = el('div', { className: 'fx-row mb-8' });
  structHdr.appendChild(el('div', { className: 'st mb-0', textContent: '영상 구조' }));
  structHdr.appendChild(CopyButton(() => (a.structure || []).map((s, i) => (i + 1) + '. ' + s).join('\n')));
  structHdr.querySelector('.btn').style.cssText = 'margin-left:auto;font-size:11px';
  const structBody = el('div');
  (a.structure || []).forEach((s, i) => {
    const row = el('div', { className: 'fx-row-10', style: 'margin-bottom:10px' });
    row.appendChild(el('span', { className: 'bdg bgy', style: 'min-width:26px;justify-content:center', textContent: String(i + 1) }));
    row.appendChild(el('span', { style: 'font-size:13px;color:var(--t2)', textContent: s }));
    structBody.appendChild(row);
  });
  root.appendChild(Card({ children: [structHdr, structBody] }));

  // sticky action bar
  const stickyBar = el('div', { className: 'sticky-bar' });
  stickyBar.appendChild(el('span', { className: 't-xs-t3', textContent: '분석 완료 · 다음 단계에서 대본을 생성합니다' }));
  const nextBtn = el('button', { className: 'btn bp btn-lg', textContent: '스크립트 생성하기 \u2192' });
  nextBtn.addEventListener('click', () => { sNext(); });
  stickyBar.appendChild(nextBtn);
  root.appendChild(stickyBar);
}

function _showError(msg) {
  const root = $('p5');
  root.textContent = '';
  const card = el('div', { className: 'cd empty-state' });
  card.appendChild(el('div', { className: 't-err', textContent: '분석 실패' }));
  card.appendChild(el('div', { className: 't-sm-desc', textContent: msg }));
  const btnRow = el('div', { className: 'retry-center' });
  const retryBtn = el('button', { className: 'btn bp', textContent: '다시 시도' });
  retryBtn.addEventListener('click', () => { sSet({ [K.ANALYSIS_ANA]: null }); runStep(5); });
  btnRow.appendChild(retryBtn);
  const backBtn = el('button', { className: 'btn bs', textContent: '\u2190 영상 선택으로' });
  backBtn.addEventListener('click', () => { sPrev(); });
  btnRow.appendChild(backBtn);
  card.appendChild(btnRow);
  root.appendChild(card);
}

function startAnalysis(transcript, skipAIStudio) {
  if (_analysisJobRunning) {
    toast('이미 분석이 진행 중입니다. 잠시만 기다려주세요.', 'err');
    return;
  }
  _analysisJobRunning = true;
  const runId = ++_analysisRunId;

  const root = $('p5');
  root.textContent = '';
  const loadDiv = el('div', { id: 'anaLoad' });
  root.appendChild(loadDiv);
  const prog = createProgress('anaLoad', 'AI 영상 분석', [
    transcript ? '자막 ' + transcript.length + '자 분석 준비' : '제목/설명 기반 분석 준비',
    '영상 구조 파악',
    '훅 포인트 추출',
    '성공 요인 분석'
  ], 25);
  const microMsgs = ['프롬프트 구성 중...', 'AI 응답 대기 중...', '분석 결과 파싱 중...'];
  let stepCount = 0;
  const stepTimer = setInterval(() => {
    prog.nextStep();
    if (stepCount < microMsgs.length) prog.updateMessage(microMsgs[stepCount]);
    stepCount++;
  }, TIMING.MICRO_FEEDBACK);
  withTimeout((signal) => {
    const taskSignal = mergeAbortSignals(signal, _analysisLeaveAC.signal);
    return skipAIStudio ? Api._analyzeFallback(S.video.sv, transcript, { signal: taskSignal }) : Api.analyze(S.video.sv, transcript, { signal: taskSignal });
  }, TIMEOUT.ANALYSIS, 'AI 분석 시간이 초과되었습니다.').then(r => {
    if (runId !== _analysisRunId) return;
    clearInterval(stepTimer); prog.complete();
    setTimeout(() => { if (runId === _analysisRunId) { sSet({ [K.ANALYSIS_ANA]: r }); rAna(); } }, 600);
  }).catch(e => {
    if (runId !== _analysisRunId) return;
    clearInterval(stepTimer); prog.fail();
    _showError(friendlyError(e));
  }).finally(() => {
    if (runId === _analysisRunId) _analysisJobRunning = false;
  });
}

function showSubtitleInput(errorMsg) {
  const root = $('p5');
  root.textContent = '';

  root.appendChild(el('h2', { className: 'pt', textContent: '영상 분석' }));

  const card = el('div', { className: 'cd' });
  card.appendChild(el('div', { style: 'font-size:14px;font-weight:600;color:var(--t1);margin-bottom:12px', textContent: errorMsg ? '자동 자막 추출 실패' : '자막을 입력하면 더 정확한 분석이 가능합니다' }));
  if (errorMsg) {
    card.appendChild(el('div', { style: 'font-size:12px;color:var(--t3);margin-bottom:12px', textContent: errorMsg }));
  }

  const guide = el('div', { style: 'font-size:13px;color:var(--t2);margin-bottom:16px;line-height:1.8;background:var(--bg);padding:14px 16px;border-radius:var(--r);border:1px solid var(--bdr)' });
  guide.appendChild(el('div', { style: 'font-weight:600;margin-bottom:8px;color:var(--t1)', textContent: 'YouTube에서 자막 복사하는 방법' }));
  const steps = [
    '① YouTube 영상 페이지 열기',
    '② 영상 아래 더보기(⋯) 버튼 클릭',
    '③ "스크립트 보기" 선택',
    '④ 타임스탬프 토글 끄기 (옵션)',
    '⑤ Ctrl+A → Ctrl+C로 전체 복사',
    '⑥ 아래 입력칸에 Ctrl+V로 붙여넣기'
  ];
  steps.forEach(s => {
    const row = el('div', { className: 'fx-row', style: 'margin-bottom:2px' });
    row.appendChild(el('span', { className: 't-xs-t2', textContent: s }));
    guide.appendChild(row);
  });
  guide.appendChild(el('div', { style: 'font-size:11px;color:var(--t4);margin-top:8px', textContent: '💡 자막이 없는 영상도 "자막 없이 분석"으로 진행할 수 있습니다' }));
  card.appendChild(guide);

  const textarea = el('textarea', { className: 'inp', id: 'manualSub', style: 'font-size:13px;line-height:1.6;resize:vertical' });
  textarea.rows = 6;
  textarea.placeholder = '여기에 자막/스크립트를 붙여넣으세요...';
  card.appendChild(textarea);
  root.appendChild(card);

  const btnRow = el('div', { style: 'display:flex;gap:10px;margin-top:16px' });
  const subBtn = el('button', { className: 'btn bp btn-lg', textContent: '자막 포함 분석 시작 \u2192' });
  subBtn.addEventListener('click', () => {
    const manual = $('manualSub').value.trim();
    if (!manual) { toast('자막을 붙여넣어주세요', 'err'); return; }
    sSet({ [K.VIDEO_TRANSCRIPT]: manual });
    toast('수동 자막 입력 완료 (' + manual.length + '자)');
    startAnalysis(manual, true);
  });
  btnRow.appendChild(subBtn);

  const skipBtn = el('button', { className: 'btn bs btn-lg', style: 'color:var(--t3)', textContent: '자막 없이 분석' });
  skipBtn.addEventListener('click', () => { sSet({ [K.VIDEO_TRANSCRIPT]: '' }); startAnalysis('', true); });
  btnRow.appendChild(skipBtn);
  root.appendChild(btnRow);
}

// ── fallback (자막 기반 분석) — 프리페치 캐시 활용 ──
const _ls5Fallback = () => {
  const isElec = window.electronAPI && window.electronAPI.isElectron;
  if (isElec) {
    const root = $('p5');
    root.textContent = '';
    const ld = el('div', { className: 'ld' });
    ld.appendChild(el('div', { className: 'sp' }));
    ld.appendChild(document.createTextNode('자막을 가져오는 중...'));
    root.appendChild(ld);
    getCachedSubtitle(S.video.sv.id).then(sub => {
      const transcript = sub.text || '';
      if (transcript && transcript.length > 30) {
        sSet({ [K.VIDEO_TRANSCRIPT]: transcript });
        toast('자막 준비 완료 (' + (sub.charCount || transcript.length) + '자)');
        startAnalysis(transcript, true);
      } else { showSubtitleInput(sub.error || '자막을 찾을 수 없습니다'); }
    }).catch(() => { showSubtitleInput('자막을 자동으로 추출하지 못했습니다.'); });
  } else { showSubtitleInput(); }
};

// ── Step 5: 영상 분석 ──
registerStep(5, () => {
  if (S.analysis.ana) { rAna(); return; }
  const keys = getApiKeys();
  const gaiKey = keys.googleAiStudio || keys.gemini;
  if (gaiKey && S.video.sv && S.video.sv.id) {
    // 자막 프리페치를 AI Studio와 병렬 실행 (fallback 대비)
    prefetchSubtitle(S.video.sv.id);

    const root = $('p5');
    root.textContent = '';
    const v = S.video.sv;

    // ── 영상 정보 + 분석 대기 UI ──
    root.appendChild(el('h2', { className: 'pt', textContent: '\uD83C\uDFAC AI 영상 분석 중' }));
    root.appendChild(el('p', { className: 'pd', textContent: 'Google AI Studio가 영상을 직접 시청하고 분석합니다' }));

    // ── 영상 정보 카드 (대기 중 맥락 제공) ──
    const videoCard = el('div', { className: 'cd', style: 'padding:0;overflow:hidden;margin-bottom:16px' });

    // 썸네일 + 정보 행
    const videoRow = el('div', { style: 'display:flex;gap:0' });

    // 왼쪽: 썸네일 (재생 중 느낌)
    const thumbWrap = el('div', { style: 'width:220px;flex-shrink:0;position:relative;background:#000' });
    if (v.thumb) {
      const safeSrc = safeUrl(v.thumb);
      if (safeSrc) {
        const img = el('img', { style: 'width:100%;height:100%;object-fit:cover;opacity:.85' });
        img.src = safeSrc;
        thumbWrap.appendChild(img);
      }
    }
    // AI 시청 중 오버레이
    const overlay = el('div', { style: 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.4)' });
    const eyeIcon = el('div', { style: 'width:40px;height:40px;border-radius:50%;background:rgba(66,133,244,.9);display:flex;align-items:center;justify-content:center;margin-bottom:6px;animation:pulse 1.5s infinite' });
    eyeIcon.appendChild(el('span', { style: 'color:#fff;font-size:18px', textContent: '👁' }));
    overlay.appendChild(eyeIcon);
    overlay.appendChild(el('span', { style: 'color:#fff;font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.5)', textContent: 'AI 시청 중' }));
    thumbWrap.appendChild(overlay);
    videoRow.appendChild(thumbWrap);

    // 오른쪽: 영상 정보
    const infoWrap = el('div', { style: 'flex:1;padding:18px 20px;display:flex;flex-direction:column;justify-content:center' });
    infoWrap.appendChild(el('div', { style: 'font-size:15px;font-weight:700;color:var(--t1);line-height:1.4;margin-bottom:8px', textContent: v.title || '' }));
    infoWrap.appendChild(el('div', { style: 'font-size:13px;color:var(--t2);margin-bottom:10px', textContent: (v.ch || '') + ' · ' + (v.date || '') }));

    const statRow = el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' });
    if (v.views) statRow.appendChild(el('span', { style: 'font-size:11px;color:var(--t3);background:var(--bg2);padding:3px 8px;border-radius:4px', textContent: '▶ ' + fmt(v.views) }));
    if (v.subs) statRow.appendChild(el('span', { style: 'font-size:11px;color:var(--t3);background:var(--bg2);padding:3px 8px;border-radius:4px', textContent: '구독 ' + fmt(v.subs) }));
    if (v.score) statRow.appendChild(el('span', { style: 'font-size:11px;color:var(--acc);background:var(--acc-bg);padding:3px 8px;border-radius:4px;font-weight:600', textContent: '점수 ' + v.score }));
    if (v.durText) statRow.appendChild(el('span', { style: 'font-size:11px;color:var(--t3);background:var(--bg2);padding:3px 8px;border-radius:4px;font-family:var(--mono)', textContent: v.durText }));
    infoWrap.appendChild(statRow);
    videoRow.appendChild(infoWrap);
    videoCard.appendChild(videoRow);
    root.appendChild(videoCard);

    // ── 분석 진행 상태 카드 ──
    const progressCard = el('div', { className: 'cd', style: 'border-left:4px solid #4285F4' });

    // 상태 헤더
    const progHeader = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px' });
    const progHeaderLeft = el('div', { className: 'fx-row' });
    const liveStatusBadge = el('span', { style: 'font-size:12px;font-weight:600;color:#4285F4;background:rgba(66,133,244,.1);padding:4px 10px;border-radius:6px', textContent: '영상 분석 중...' });
    progHeaderLeft.appendChild(liveStatusBadge);
    const liveDot = el('span', { style: 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4285F4;animation:pulse 1s infinite' });
    progHeaderLeft.appendChild(liveDot);
    progHeader.appendChild(progHeaderLeft);
    const elapsedSpan = el('span', { id: '_s5elapsed', style: 'font-size:11px;color:var(--t4);font-family:var(--mono,monospace)', textContent: '0초' });
    progHeader.appendChild(elapsedSpan);
    progressCard.appendChild(progHeader);

    // 분석 단계 (세로 리스트)
    const stepItems = [
      { label: '영상 다운로드 및 로딩', desc: 'YouTube에서 영상을 가져오는 중' },
      { label: '화면 + 음성 분석', desc: '영상 내용을 시청하고 이해하는 중' },
      { label: '훅 포인트 추출', desc: '시청자를 끌어들이는 포인트를 찾는 중' },
      { label: '구조 & 성공 요인 분석', desc: '영상 구조와 인기 이유를 정리하는 중' }
    ];
    const stepsWrap = el('div');
    stepItems.forEach((s, i) => {
      const row = el('div', { style: 'display:flex;align-items:center;gap:12px;padding:10px 0;' + (i < stepItems.length - 1 ? 'border-bottom:1px solid var(--bdr)' : '') });
      const dot = el('div', {
        id: '_s5dot' + i,
        style: 'width:28px;height:28px;border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:var(--t4);transition:all .3s',
        textContent: '○'
      });
      row.appendChild(dot);
      const textWrap = el('div', { style: 'flex:1' });
      textWrap.appendChild(el('div', { style: 'font-size:13px;font-weight:500;color:var(--t2)', textContent: s.label }));
      textWrap.appendChild(el('div', { style: 'font-size:11px;color:var(--t4);margin-top:1px', textContent: s.desc }));
      row.appendChild(textWrap);
      stepsWrap.appendChild(row);
    });
    progressCard.appendChild(stepsWrap);
    root.appendChild(progressCard);

    // pulse 애니메이션
    if (!document.getElementById('_streamPulse')) {
      const style = el('style', { id: '_streamPulse' });
      style.textContent = '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}';
      document.head.appendChild(style);
    }

    // ── 경과 시간 + 단계 자동 진행 ──
    const analysisStart = Date.now();
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      // 경과 시간 업데이트
      const sec = Math.round((Date.now() - analysisStart) / 1000);
      const elSpan = document.getElementById('_s5elapsed');
      if (elSpan) elSpan.textContent = sec < 60 ? sec + '초' : Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';

      // 단계 진행 (8초마다)
      if (sec > 0 && sec % 8 === 0 && stepIdx < stepItems.length) {
        const dot = document.getElementById('_s5dot' + stepIdx);
        if (dot) {
          dot.style.background = 'rgba(66,133,244,.12)';
          dot.style.color = '#4285F4';
          dot.textContent = '●';
        }
        stepIdx++;
      }
    }, 1000);

    let firstChunk = true;
    let charCount = 0;

    // ── 분석 호출 (스트리밍 — 응답 시작되면 상태 업데이트) ──
    withTimeout(
      (signal) => Api.analyzeStream(S.video.sv, S.video.transcript || '', (chunk, fullSoFar) => {
        if (firstChunk) {
          liveStatusBadge.textContent = '분석 결과 생성 중';
          firstChunk = false;
          // 모든 단계 점 활성화
          for (let i = 0; i < stepItems.length; i++) {
            const dot = document.getElementById('_s5dot' + i);
            if (dot) { dot.style.background = 'rgba(66,133,244,.12)'; dot.style.color = '#4285F4'; dot.textContent = '✓'; }
          }
        }
        charCount = fullSoFar.length;
      }, { signal }),
      TIMEOUT.ANALYSIS_VIDEO,
      '영상 분석 시간이 초과되었습니다.'
    ).then(r => {
      clearInterval(stepTimer);
      const actualMethod = r && r._method ? r._method : 'video';
      const usedFallback = !!(r && r._usedFallback);
      const statusText = usedFallback ? '대체 분석 완료' : '분석 완료';
      // 완료 표시
      liveDot.style.animation = 'none';
      liveDot.style.background = usedFallback ? '#D97706' : '#10B981';
      liveStatusBadge.textContent = statusText;
      liveStatusBadge.style.color = usedFallback ? '#B45309' : '#10B981';
      liveStatusBadge.style.background = usedFallback ? 'rgba(217,119,6,.1)' : 'rgba(16,185,129,.1)';
      for (let i = 0; i < stepItems.length; i++) {
        const dot = document.getElementById('_s5dot' + i);
        if (dot) {
          dot.style.background = usedFallback ? 'rgba(217,119,6,.12)' : 'rgba(16,185,129,.12)';
          dot.style.color = usedFallback ? '#B45309' : '#10B981';
          dot.textContent = '✓';
        }
      }
      setTimeout(() => {
        if (!r._method) r._method = actualMethod;
        sSet({ [K.ANALYSIS_ANA]: r });
        if (usedFallback) {
          toast(actualMethod === 'subtitle' ? '영상 직접 분석이 실패하여 자막 기반 분석 결과를 표시합니다.' : '영상 직접 분석이 실패하여 제목/설명 기반 분석 결과를 표시합니다.');
        }
        rAna();
      }, 800);
    }).catch(e => {
      clearInterval(stepTimer);
      console.error('[Step5] AI Studio 분석 실패:', e && e.message || e);

      // 설명형 전환 안내 UI
      const root = $('p5');
      root.textContent = '';
      const notice = el('div', { className: 'cd', style: 'border-left:4px solid var(--yel);max-width:560px;margin:40px auto' });
      notice.appendChild(el('div', { style: 'font-size:15px;font-weight:700;color:var(--t1);margin-bottom:10px', textContent: '영상 직접 분석에 실패했습니다' }));

      const reasonText = (e && e.message) || '';
      let cause = '네트워크 오류 또는 일시적 서버 문제';
      if (reasonText.includes('키') || reasonText.includes('401') || reasonText.includes('403')) cause = 'API 키 권한 부족 또는 키 만료';
      else if (reasonText.includes('시간') || reasonText.includes('timeout') || reasonText.includes('Timeout')) cause = '응답 시간 초과 (영상이 길거나 서버 지연)';
      else if (reasonText.includes('quota') || reasonText.includes('429')) cause = 'API 요청 한도 초과';

      notice.appendChild(el('div', { style: 'font-size:13px;color:var(--t3);margin-bottom:14px;line-height:1.7', textContent: '가능한 원인: ' + cause }));

      const switchBox = el('div', { style: 'padding:12px 16px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.12);border-radius:var(--r);line-height:1.7' });
      switchBox.appendChild(el('div', { style: 'font-size:13px;font-weight:600;color:#2563EB;margin-bottom:4px', textContent: '🔄 자막 기반 분석으로 자동 전환합니다' }));
      switchBox.appendChild(el('div', { className: 't-xs-t2', textContent: '영상 화면 분석 대신 자막 텍스트를 활용합니다. 정확도는 다소 낮을 수 있지만 대부분 계속 진행 가능합니다.' }));
      notice.appendChild(switchBox);
      root.appendChild(notice);

      setTimeout(() => { _ls5Fallback(); }, TIMING.FALLBACK_DELAY);
    });
    return;
  }
  _ls5Fallback();
});
