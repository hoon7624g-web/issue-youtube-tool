// ═══════════════════════════════════════
// pipeline/step9-voice.js — 배치 음성 생성 + 미리듣기
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, toast, withTimeout, safeUrl, createProgress , el, LABEL_COLORS, TIMEOUT, friendlyError, mergeAbortSignals } from '../utils.js';
import { S, sSet, sNext, sPrev, sOn } from '../state.js';
import { K } from '../constants.js';
import { M } from '../mock-data.js';

// ★ P1-10: step 이탈 시 in-flight 음성 생성 무효화 + 새 프로젝트 리셋
sOn(K.NAV_STEP, (step) => {
  if (step !== 9) {
    _voiceRunId++;
    _voiceJobRunning = false;
    try { _voiceLeaveAC.abort(new Error('step-leave')); } catch (e) {}
    _voiceLeaveAC = new AbortController();
  }
  if (step <= 2) { _voicePage = 0; }
});
import { Api } from '../api.js';
import { registerStep, runAction } from '../router.js';
import { ResultTabs } from '../components.js';

function isValidResult(r) {
  return !!(r && r.script && typeof r.script.content === 'string' && typeof r.script.type === 'string');
}

function getResultArray() {
  return Array.isArray(S.script.results) ? S.script.results : [];
}

function revokeVoiceResult(vr) {
  if (vr && vr.url) {
    try { URL.revokeObjectURL(vr.url); } catch (e) {}
  }
}

// ★ v3.6.0: 음성 상태 판정 헬퍼 — 성공/실패/미처리 3상태 구분
function hasVoiceAsset(vr) {
  return !!(vr && (vr.url || vr.blob || (Array.isArray(vr.parts) && vr.parts.length)));
}
function isVoiceFailed(vr) {
  return !!(vr && !hasVoiceAsset(vr) && (vr.provider === 'failed' || vr.error));
}
function isVoiceTerminal(vr) {
  return hasVoiceAsset(vr) || isVoiceFailed(vr);
}

function getVoiceConfigSig() {
  const voiceId = S.voice.selVoice || 'vc4';
  const speed = Number(S.voice.voiceSpeed || 1.0);
  return voiceId + '|' + speed.toFixed(1);
}

function invalidateVoiceResultsForCurrentConfig(notify) {
  const results = getResultArray();
  if (!results.length) return false;
  const sig = getVoiceConfigSig();
  let changed = false;
  const nextResults = results.map(r => {
    if (!r || !r.voiceResult) return r;
    if (r.voiceResult._voiceSig === sig) return r;
    revokeVoiceResult(r.voiceResult);
    changed = true;
    return Object.assign({}, r, { voiceResult: null });
  });
  if (changed) {
    sSet({ [K.SCRIPT_RESULTS]: nextResults });
    if (notify) toast('음성/배속 설정이 바뀌어 기존 음성을 초기화했습니다. 다시 생성해주세요.', 'err');
  }
  return changed;
}

function _buildVoiceCard(v, selId) {
  const on = v.id === selId;
  const isEl = v.provider === 'elevenlabs';
  const card = el('div', {
    className: 'tag' + (on ? ' on' : ''),
    style: 'padding:10px 18px;font-size:13px;display:inline-flex;flex-direction:column;align-items:center;gap:4px;min-width:72px;cursor:pointer' + (on && isEl ? ';border-color:#8B5CF6' : '')
  });
  card.dataset.vid = v.id;
  const dot = el('div', {
    style: 'width:36px;height:36px;border-radius:50%;background:' + (on ? (isEl ? 'rgba(139,92,246,.15)' : 'var(--acc-bg2)') : 'var(--bg2)') + ';display:flex;align-items:center;justify-content:center;font-size:' + (isEl ? '10' : '12') + 'px;font-weight:700;color:' + (on ? (isEl ? '#8B5CF6' : 'var(--acc)') : 'var(--t3)'),
    textContent: isEl ? 'PRO' : 'AI'
  });
  card.appendChild(dot);
  card.appendChild(el('span', { style: 'font-weight:600', textContent: v.name }));
  return card;
}

function renderVoicePreview(vid) {
  let v = M.voices.find(x => { return x.id === vid; });
  if (!v && vid === 'el-custom' && S.voice.customElVoiceId) {
    v = { id: 'el-custom', name: '커스텀 보이스', gender: '', desc: S.voice.customElVoiceId.substring(0, 12) + '...', provider: 'elevenlabs', elId: S.voice.customElVoiceId };
  }
  if (!v) return;
  const isEl = v.provider === 'elevenlabs';
  const googleMap = { 'vc1': 'ko-KR-Neural2-C', 'vc2': 'ko-KR-Neural2-A', 'vc3': 'ko-KR-Neural2-C', 'vc4': 'ko-KR-Neural2-B', 'vc5': 'ko-KR-Wavenet-A', 'vc6': 'ko-KR-Wavenet-C', 'vc7': 'ko-KR-Wavenet-B', 'vc8': 'ko-KR-Wavenet-D', 'vc9': 'ko-KR-Wavenet-C' };
  const previewVoice = isEl ? v.elId : googleMap[vid] || 'ko-KR-Neural2-B';
  const providerLabel = isEl ? 'ElevenLabs' : 'Google TTS';
  const accentColor = isEl ? '#8B5CF6' : 'var(--acc)';
  const container = $('voicePreview');
  if (!container) return;
  container.textContent = '';

  const wrap = el('div', { style: 'display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg);border:1px solid ' + (isEl ? 'rgba(139,92,246,.3)' : 'var(--bdr)') + ';border-radius:var(--r2)' });

  // 아이콘
  const icon = el('div', { style: 'width:44px;height:44px;border-radius:50%;background:' + (isEl ? 'rgba(139,92,246,.15)' : 'var(--acc-bg2)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0' });
  icon.appendChild(el('span', { style: 'font-size:' + (isEl ? '10' : '12') + 'px;font-weight:700;color:' + accentColor, textContent: isEl ? 'PRO' : 'AI' }));
  wrap.appendChild(icon);

  // 정보
  const info = el('div', { className: 'flex-1' });
  const nameRow = el('div', { style: 'font-size:14px;font-weight:600' });
  nameRow.appendChild(document.createTextNode(v.name));
  nameRow.appendChild(el('span', { style: 'font-size:12px;color:var(--t3);font-weight:400;margin-left:8px', textContent: (v.gender === '남' ? '남성' : '여성') + ' · ' + (v.desc || '') }));
  nameRow.appendChild(el('span', { className: 'bdg', style: 'font-size:9px;margin-left:6px;background:' + (isEl ? 'rgba(139,92,246,.1)' : 'rgba(34,197,94,.1)') + ';color:' + (isEl ? '#8B5CF6' : '#22C55E'), textContent: providerLabel }));
  info.appendChild(nameRow);

  const ctrlRow = el('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:10px' });

  // 미리듣기 버튼
  const vpBtn = el('div', {
    id: 'vpBtn',
    style: 'width:28px;height:28px;border-radius:50%;background:' + accentColor + ';display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0'
  });
  vpBtn.dataset.voice = previewVoice;
  vpBtn.dataset.provider = isEl ? 'elevenlabs' : 'google';
  vpBtn.appendChild(el('span', { style: 'color:#fff;font-size:10px', textContent: '\u25B6' }));
  vpBtn.addEventListener('click', () => {
    runAction('playVoicePreview', vpBtn);
  });
  ctrlRow.appendChild(vpBtn);

  // 파형
  const wave = el('div', { id: 'vpWave', style: 'flex:1;height:24px;display:flex;align-items:center;gap:2px' });
  for (let i = 0; i < 30; i++) {
    const h = 6 + Math.random() * 14;
    wave.appendChild(el('div', { style: 'width:3px;height:' + h + 'px;background:var(--bg3);border-radius:1px;transition:background .2s' }));
  }
  ctrlRow.appendChild(wave);
  ctrlRow.appendChild(el('span', { id: 'vpTime', className: 't-mono-xs', textContent: '미리듣기' }));

  info.appendChild(ctrlRow);
  wrap.appendChild(info);
  container.appendChild(wrap);
}

let _voicePage = 0;
let _voiceLeaveAC = new AbortController();

function _buildVoiceTabs(results, activePage) {
  const extraInfo = results.map(r => {
    const vr = (r && r.voiceResult) || {};
    const dur = vr.dur || 0;
    return Math.floor(dur / 60) + ':' + String(dur % 60).padStart(2, '0');
  });
  return ResultTabs(results, activePage, _voiceGoPage, extraInfo);
}

function _voiceGoPage(p) {
  _voicePage = p;
  rAllVoice();
}

// ── 음성 결과 카드 (헤더 + 대본 미리보기 + 오디오 플레이어) ──
function _buildVoiceResultCard(r, page, spd) {
  const typeLabel = r.script.type === 'longform' ? '\uD83C\uDFAC 롱폼' : '\uD83D\uDCF1 숏폼 ' + ((r.script.idx || 0) + 1);
  const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
  const vr = r.voiceResult || {};
  const dur = vr.dur || 0;
  const mn = Math.floor(dur / 60);
  const sc = dur % 60;

  const barCls = r.script.type === 'longform' ? 'cd-bar-blue' : 'cd-bar-red';
  const card = el('div', { className: 'cd ' + barCls, style: 'border-left:4px solid ' + typeColor });

  // 헤더
  const hdr = el('div', { className: 'fx-row mb-12' });
  hdr.appendChild(el('span', { style: 'font-size:12px;font-weight:600;color:' + typeColor + ';background:' + typeColor + '12;padding:3px 8px;border-radius:4px', textContent: typeLabel }));
  hdr.appendChild(el('span', { className: 't-title', textContent: r.script.title || '' }));
  hdr.appendChild(el('span', { style: 'font-family:var(--mono);font-size:12px;color:var(--t3);margin-left:auto', textContent: mn + ':' + String(sc).padStart(2, '0') + (spd > 1 ? ' (' + spd.toFixed(1) + 'x)' : '') }));
  card.appendChild(hdr);

  // 대본 미리보기
  const scriptText = r.script.content || '';
  const previewDiv = el('div', { style: 'max-height:120px;overflow-y:auto;padding:12px;background:var(--bg);border-radius:var(--r);font-size:13px;line-height:1.8;margin-bottom:14px;color:var(--t2)' });
  previewDiv.textContent = scriptText.substring(0, 400) + (scriptText.length > 400 ? '...' : '');
  card.appendChild(previewDiv);

  // 오디오 플레이어
  if (vr.url) {
    const safeAudioUrl = safeUrl(vr.url);
    if (safeAudioUrl) {
      const audio = el('audio', { id: 'va' + page });
      audio.src = safeAudioUrl;
      audio.preload = 'auto';
      card.appendChild(audio);

      const ctrlRow = el('div', { className: 'fx-row-10' });

      const playBtn = el('button', { className: 'btn bs', style: 'width:36px;height:36px;border-radius:50%;padding:0;font-size:14px', textContent: '\u25B6' });
      playBtn.addEventListener('click', () => {
        if (audio.paused) { audio.play(); playBtn.textContent = '\u23F8'; }
        else { audio.pause(); playBtn.textContent = '\u25B6'; }
      });
      ctrlRow.appendChild(playBtn);

      const barOuter = el('div', { style: 'flex:1;height:4px;background:var(--bg3);border-radius:2px;position:relative' });
      const barInner = el('div', { className: 'progress-fill' });
      barOuter.appendChild(barInner);
      ctrlRow.appendChild(barOuter);

      const timeSpan = el('span', { className: 't-mono-xs', textContent: '0:00' });
      ctrlRow.appendChild(timeSpan);
      card.appendChild(ctrlRow);

      audio.addEventListener('timeupdate', () => {
        const pct = audio.duration ? (audio.currentTime / audio.duration * 100) : 0;
        barInner.style.width = pct + '%';
        const m = Math.floor(audio.currentTime / 60);
        const s = Math.floor(audio.currentTime % 60);
        timeSpan.textContent = m + ':' + String(s).padStart(2, '0');
      });
      audio.addEventListener('ended', () => {
        barInner.style.width = '0%';
        timeSpan.textContent = '0:00';
        playBtn.textContent = '\u25B6';
      });
    }
  } else if (vr.error || vr.provider === 'failed') {
    // 3-10: 실패한 개별 항목 재시도
    const errBox = el('div', { style: 'padding:14px;background:var(--red-bg);border-radius:var(--r);border:1px solid rgba(201,42,42,.15)' });
    errBox.appendChild(el('div', { style: 'font-size:13px;color:var(--red);margin-bottom:8px', textContent: '음성 생성 실패: ' + (vr.error || '알 수 없는 오류') }));
    const retryBtn = el('button', { className: 'btn bp', style: 'font-size:12px;padding:6px 14px', textContent: '이 스크립트만 재시도' });
    retryBtn.addEventListener('click', () => {
      const newResults = S.script.results.slice();
      newResults[page] = Object.assign({}, newResults[page], { voiceResult: null });
      sSet({ [K.SCRIPT_RESULTS]: newResults });
      processAllVoice();
    });
    errBox.appendChild(retryBtn);
    card.appendChild(errBox);
  } else {
    card.appendChild(el('div', { className: 't-xs-t4', textContent: '음성 미생성' }));
  }

  return card;
}

// ── 풋티지 브리프 카드 ──
function _buildFootageBrief(ekw, typeColor) {
  const footCard = el('div', { className: 'cd', style: 'margin-top:14px;border-left:4px solid ' + typeColor });

  const footHdr = el('div', { className: 'fx-row mb-14' });
  footHdr.appendChild(el('span', { className: 't-16', textContent: '\uD83C\uDFAC' }));
  footHdr.appendChild(el('div', { style: 'font-size:14px;font-weight:700', textContent: '풋티지 브리프' }));
  footHdr.appendChild(el('span', { className: 'bdg bg2 t-3xs ml-auto', textContent: ekw.length + '장면' }));
  footCard.appendChild(footHdr);

  ekw.forEach((s, si) => {
    const color = LABEL_COLORS[s.label] || '#6B7280';
    const scene = el('div', { style: 'display:flex;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--bg);border-radius:var(--r)' });

    // 번호
    scene.appendChild(el('div', { style: 'width:24px;height:24px;border-radius:6px;background:' + color + '15;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;color:' + color, textContent: String(si + 1) }));

    // 내용
    const info = el('div', { className: 'flex-1-min' });
    const labelRow = el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px' });
    labelRow.appendChild(el('span', { style: 'font-size:11px;font-weight:600;color:' + color, textContent: s.label || '' }));
    if (s.cut) labelRow.appendChild(el('span', { className: 't-3xs-t4', textContent: s.cut }));
    info.appendChild(labelRow);

    info.appendChild(el('div', { style: 'font-size:12px;color:var(--t2);line-height:1.5;margin-bottom:4px', textContent: '\u201C' + (s.text || '') + '\u201D' }));

    // 키워드 태그
    const kwRow = el('div', { className: 'chip-row' });
    if (s.mainEn) kwRow.appendChild(el('span', { className: 'tag on t-3xs', style: 'padding:2px 8px', textContent: '\uD83D\uDD0D ' + s.mainEn }));
    (s.altEn || []).forEach(alt => {
      kwRow.appendChild(el('span', { className: 'tag t-3xs', style: 'padding:2px 8px', textContent: '\uD83D\uDD0D ' + alt }));
    });
    if (s.ko) kwRow.appendChild(el('span', { className: 'tag', style: 'font-size:10px;padding:2px 8px;background:var(--bg2);color:var(--t2)', textContent: '\uD83D\uDD0D ' + s.ko }));
    info.appendChild(kwRow);

    scene.appendChild(info);
    footCard.appendChild(scene);
  });

  return footCard;
}

// ── 음성 결과 네비게이션 ──
function _buildVoiceNav(page, results) {
  const navRow = el('div', { className: 'nav-footer' });
  if (page > 0) {
    const prevBtn = el('button', { className: 'btn bs', textContent: '\u2190 이전 스크립트' });
    prevBtn.addEventListener('click', () => { _voiceGoPage(page - 1); });
    navRow.appendChild(prevBtn);
  } else {
    navRow.appendChild(el('div'));
  }
  if (page < results.length - 1) {
    const nextBtn = el('button', { className: 'btn bp', textContent: '다음 스크립트 \u2192' });
    nextBtn.addEventListener('click', () => { _voiceGoPage(page + 1); });
    navRow.appendChild(nextBtn);
  } else {
    const goBtn = el('button', { className: 'btn bp btn-lg', textContent: '최종 결과 확인 \u2192' });
    goBtn.addEventListener('click', () => { sNext(); });
    navRow.appendChild(goBtn);
  }
  return navRow;
}

function rAllVoice() {
  const results = getResultArray();
  const spd = S.voice.voiceSpeed || 1.0;
  const root = $('p9');
  root.textContent = '';

  if (!results.length) {
    _voicePage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '음성 생성 완료' }));
    root.appendChild(el('div', { className: 'cd', textContent: '표시할 음성 결과가 없습니다. 이전 단계부터 다시 진행해주세요.' }));
    return;
  }
  if (!results.every(isValidResult)) {
    _voicePage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '음성 생성 완료' }));
    root.appendChild(el('div', { className: 'cd', textContent: '음성 결과 데이터가 손상되었습니다. 이전 단계부터 다시 진행해주세요.' }));
    return;
  }

  const page = Math.max(0, Math.min(_voicePage, results.length - 1));
  _voicePage = page;
  const r = results[page];

  // ★ v3.6.0: 실패 항목 수를 헤더에 명시
  const failedCount = results.filter(r => isVoiceFailed(r.voiceResult)).length;
  const headerText = failedCount > 0
    ? '음성 생성 완료 (' + failedCount + '건 실패)'
    : '음성 생성 완료';

  root.appendChild(el('h2', { className: 'pt', textContent: headerText }));
  if (failedCount > 0) {
    root.appendChild(el('div', { style: 'padding:10px 14px;background:var(--red-bg);border:1px solid rgba(201,42,42,.15);border-radius:var(--r);margin-bottom:16px;font-size:13px;color:var(--red)', textContent: '⚠ ' + failedCount + '건의 음성 생성이 실패했습니다. 각 카드에서 개별 재시도할 수 있습니다.' }));
  }
  root.appendChild(el('p', { className: 'pd', textContent: results.length + '개 스크립트 · ' + (page + 1) + '/' + results.length + ' 페이지' + (spd > 1 ? ' · 배속: ' + spd.toFixed(1) + 'x' : '') }));
  root.appendChild(el('div', { style: 'font-size:10px;color:var(--t4);margin:-16px 0 16px', textContent: '대본 텍스트가 TTS 서비스에 전송되어 음성이 생성되었습니다' }));
  if (results.length > 1) root.appendChild(_buildVoiceTabs(results, page));
  root.appendChild(_buildVoiceResultCard(r, page, spd));
  root.appendChild(_buildVoiceNav(page, results));
}

// ★ P1-fix: single-flight lock — 중복 호출(timeout 후 재시도) 방지
let _voiceJobRunning = false;
let _voiceRunId = 0;

async function processAllVoice() {
  if (_voiceJobRunning) return;
  _voiceJobRunning = true;
  const runId = ++_voiceRunId;

  try {
  while (true) {
    if (runId !== _voiceRunId) return; // stale run 방지
    const results = getResultArray();
    if (!results.length || !results.every(isValidResult)) {
      toast('음성을 생성할 스크립트 데이터가 손상되었습니다. 이전 단계로 돌아갑니다.', 'err');
      sPrev();
      return;
    }
    // ★ v3.6.0: 미처리 항목만 진행 (실패 sentinel은 terminal — 무한 재시도 방지)
    const idx = results.findIndex(r => !isVoiceTerminal(r.voiceResult));
    if (idx === -1) { _voicePage = 0; rAllVoice(); return; }

    const current = results[idx];
    const total = results.length;
    const stepLabels = results.map(r => {
      const label = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);
      return label + ': ' + r.script.title.substring(0, 20);
    });

    const root = $('p9');
    root.textContent = '';
    const loadDiv = el('div', { id: 'voiceLoad' });
    root.appendChild(loadDiv);
    const prog = createProgress('voiceLoad', '음성 생성 (' + (idx + 1) + '/' + total + ') · ' + (S.voice.voiceSpeed || 1.0).toFixed(1) + 'x', stepLabels, 25 * total);
    for (let i = 0; i < idx; i++) prog.nextStep();

    const script = current.script.content;
    const estimatedChunks = Math.ceil(script.length / 1500);
    const dynamicTimeout = TIMEOUT.VOICE + estimatedChunks * (TIMEOUT.VOICE_PER_CHUNK || 30000);

    try {
      // ★ P1-fix: function form으로 변경하여 withTimeout이 AbortSignal을 생성하도록 함
      const result = await withTimeout((signal) => Api.genVoice(script, S.voice.selVoice, { signal: mergeAbortSignals(signal, _voiceLeaveAC.signal) }), dynamicTimeout, '음성 생성 시간이 초과되었습니다 (' + Math.round(dynamicTimeout / 1000) + '초).');
      if (runId !== _voiceRunId) return; // stale completion 무시
      result.speed = S.voice.voiceSpeed || 1.0;
      result.voiceId = S.voice.selVoice || 'vc4';
      result._voiceSig = getVoiceConfigSig();
      prog.nextStep();
      const newResults = S.script.results.slice();
      newResults[idx] = Object.assign({}, newResults[idx], { voiceResult: result });
      sSet({ [K.SCRIPT_RESULTS]: newResults });
    } catch (e) {
      if (runId !== _voiceRunId) return;
      const errMsg = friendlyError(e);
      console.error('[Voice] 음성 생성 실패:', (e && e.message) || '', '(스크립트:', current.script.title, script.length + '자)');
      const newResults = S.script.results.slice();
      newResults[idx] = Object.assign({}, newResults[idx], { voiceResult: { dur: 0, provider: 'failed', error: errMsg, speed: S.voice.voiceSpeed || 1.0, voiceId: S.voice.selVoice || 'vc4', _voiceSig: getVoiceConfigSig() } });
      sSet({ [K.SCRIPT_RESULTS]: newResults });
      toast(current.script.title + ' 음성 생성 실패: ' + errMsg, 'err');
    } finally {
      prog.destroy();
    }
  }
  } finally {
    if (runId === _voiceRunId) _voiceJobRunning = false;
  }
}

// ── Step 9 ──
registerStep(9, () => {
  invalidateVoiceResultsForCurrentConfig(true);
  const results = getResultArray();
  if (!results.length) {
    toast('선택된 스크립트가 없습니다. 이전 단계로 돌아갑니다.', 'err');
    sPrev();
    return;
  }
  if (!results.every(isValidResult)) {
    toast('스크립트 데이터가 손상되었습니다. 이전 단계로 돌아갑니다.', 'err');
    sPrev();
    return;
  }
  // ★ v3.6.0: 모든 항목이 terminal(성공 or 실패)이면 결과 화면 직행
  if (results.every(r => isVoiceTerminal(r.voiceResult))) { _voicePage = 0; rAllVoice(); return; }

  const voices = M.voices;
  const selId = S.voice.selVoice || 'vc4';
  const googleVoices = voices.filter(v => { return v.provider === 'google'; });
  const elVoices = voices.filter(v => { return v.provider === 'elevenlabs'; });

  const root = $('p9');
  root.textContent = '';
  const backBtn = el('button', { className: 'btn bs back-link', textContent: '← 풋티지 브리프' });
  backBtn.addEventListener('click', () => { sPrev(); });
  root.appendChild(backBtn);
  root.appendChild(el('h2', { className: 'pt', textContent: '음성 생성' }));
  root.appendChild(el('p', { className: 'pd', textContent: 'AI 음성을 선택하면 ' + results.length + '개 스크립트의 음성을 순차 생성합니다' }));

  const voiceCard = el('div', { className: 'cd' });
  const gHeader = el('div', { className: 'st fx-row' });
  gHeader.appendChild(document.createTextNode('기본 AI 음성'));
  gHeader.appendChild(el('span', { className: 'bdg', style: 'font-size:10px;background:rgba(34,197,94,.1);color:#22C55E', textContent: '무료' }));
  voiceCard.appendChild(gHeader);
  const gRow = el('div', { className: 'fx-wrap-8 mb-20' });
  googleVoices.forEach(v => { gRow.appendChild(_buildVoiceCard(v, selId)); });
  voiceCard.appendChild(gRow);
  const elSection = el('div', { style: 'border-top:1px solid var(--bdr);padding-top:16px;margin-top:4px' });
  const eHeader = el('div', { className: 'st fx-row' });
  eHeader.appendChild(document.createTextNode('프리미엄 AI 음성'));
  eHeader.appendChild(el('span', { className: 'bdg', style: 'font-size:10px;background:rgba(139,92,246,.1);color:#8B5CF6', textContent: 'ElevenLabs' }));
  elSection.appendChild(eHeader);
  const eRow = el('div', { className: 'fx-wrap-8' });
  elVoices.forEach(v => { eRow.appendChild(_buildVoiceCard(v, selId)); });
  elSection.appendChild(eRow);

  // 커스텀 ElevenLabs 보이스 ID 입력
  const customElRow = el('div', { style: 'margin-top:12px;padding:12px;background:var(--bg);border-radius:var(--r);border:1px solid var(--bdr)' });
  customElRow.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:var(--t2);margin-bottom:8px', textContent: '🎙️ 커스텀 보이스 ID (ElevenLabs Voice Library에서 복사)' }));
  const customElInput = el('input', { className: 'inp', id: 'customElVoiceId', style: 'font-size:12px;font-family:var(--mono)' });
  customElInput.placeholder = 'ElevenLabs Voice ID 붙여넣기';
  customElInput.value = S.voice.customElVoiceId || '';
  const customElBtn = el('button', { className: 'btn bs', style: 'margin-top:8px;font-size:12px', textContent: '이 보이스로 설정' });
  customElBtn.addEventListener('click', () => {
    const vid = customElInput.value.trim();
    if (!vid) { toast('Voice ID를 입력해주세요', 'err'); return; }
    S.voice.customElVoiceId = vid;
    S.voice.selVoice = 'el-custom';
    S.voice.elVoiceId = vid;
    shared.ilKw = shared.ilKw || {};
    root.querySelectorAll('[data-vid]').forEach(x => x.classList.remove('on'));
    toast('커스텀 보이스 적용: ' + vid.substring(0, 8) + '...');
    renderVoicePreview('el-custom');
  });
  const customElHelp = el('a', { style: 'font-size:11px;color:var(--blu);cursor:pointer;margin-left:8px', textContent: 'Voice Library에서 찾기 ↗' });
  customElHelp.addEventListener('click', (e) => { e.preventDefault(); window.open('https://elevenlabs.io/voice-library?language=ko&sort=trending', '_blank'); });
  const customElActions = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:8px' });
  customElActions.appendChild(customElBtn);
  customElActions.appendChild(customElHelp);
  customElRow.appendChild(customElInput);
  customElRow.appendChild(customElActions);
  elSection.appendChild(customElRow);

  voiceCard.appendChild(elSection);
  voiceCard.appendChild(el('div', { id: 'voicePreview', className: 'mt-16' }));
  if (S.voice.elVoiceId) {
    const elBadge = el('div', { style: 'border-top:1px solid var(--bdr);padding-top:16px;margin-top:16px' });
    elBadge.appendChild(el('span', { className: 'bdg', style: 'font-size:11px;background:rgba(139,92,246,.1);color:#8B5CF6', textContent: '🎤 내 목소리 등록됨' }));
    voiceCard.appendChild(elBadge);
  }
  root.appendChild(voiceCard);

  const speedCard = el('div', { className: 'cd mt-16' });
  const spdHeader = el('div', { className: 'st fx-row' });
  spdHeader.appendChild(document.createTextNode('🏃 음성 속도'));
  spdHeader.appendChild(el('span', { className: 'bdg', style: 'font-size:10px;background:rgba(6,182,212,.1);color:#0891B2', textContent: '숏폼 추천: 1.2~1.3x' }));
  speedCard.appendChild(spdHeader);
  const sliderRow = el('div', { style: 'display:flex;align-items:center;gap:16px;padding:8px 0' });
  const slider = el('input', { id: 'speedSlider', style: 'flex:1;accent-color:var(--acc);height:6px;cursor:pointer' });
  slider.type = 'range'; slider.min = '1.0'; slider.max = '1.5'; slider.step = '0.1'; slider.value = String(S.voice.voiceSpeed || 1.0);
  sliderRow.appendChild(slider);
  const speedVal = el('span', { id: 'speedValue', className: 'speed-display', textContent: (S.voice.voiceSpeed || 1.0).toFixed(1) + 'x' });
  sliderRow.appendChild(speedVal); speedCard.appendChild(sliderRow);
  const labelRow = el('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:var(--t4);padding:0 2px' });
  labelRow.appendChild(el('span', { textContent: '1.0x 기본' }));
  labelRow.appendChild(el('span', { textContent: '1.2x 약간 빠름' }));
  labelRow.appendChild(el('span', { textContent: '1.5x 빠름' }));
  speedCard.appendChild(labelRow);
  root.appendChild(speedCard);

  const totalChars = results.reduce((sum, r) => sum + (r.script.content || '').length, 0);
  const estChunks = results.reduce((sum, r) => sum + Math.ceil((r.script.content || '').length / 1500), 0);
  const estMin = Math.max(1, Math.round(estChunks * 8 / 60));
  const estDurSec = Math.round(totalChars / 5);
  const durMin = Math.floor(estDurSec / 60);
  const durSec = estDurSec % 60;
  const estBox = el('div', { style: 'margin-top:16px;padding:14px 18px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--r2);font-size:12px;color:var(--t2);line-height:1.8' });
  estBox.appendChild(el('div', { textContent: '예상 생성 시간: 약 ' + estMin + '분 · 예상 음성 길이: 약 ' + durMin + '분 ' + durSec + '초' }));
  root.appendChild(estBox);

  slider.addEventListener('input', () => { speedVal.textContent = Number(slider.value).toFixed(1) + 'x'; });
  slider.addEventListener('change', () => { S.voice.voiceSpeed = Number(slider.value); renderVoicePreview(S.voice.selVoice || selId); });
  renderVoicePreview(S.voice.selVoice || selId);
  root.querySelectorAll('[data-vid]').forEach(card => {
    card.addEventListener('click', () => { S.voice.selVoice = card.dataset.vid; root.querySelectorAll('[data-vid]').forEach(x => x.classList.remove('on')); card.classList.add('on'); renderVoicePreview(card.dataset.vid); });
  });
  const goBtn = el('button', { className: 'btn bp btn-lg mt-16', textContent: '음성 생성 시작' });
  goBtn.addEventListener('click', () => { processAllVoice(); });
  root.appendChild(goBtn);
});
