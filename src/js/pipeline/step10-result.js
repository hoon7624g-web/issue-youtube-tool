// ═══════════════════════════════════════
// pipeline/step10-result.js — 멀티 결과 + ZIP 다운로드
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, fmt, fmtB, toast, safeUrl , el, LABEL_COLORS, confirmModal } from '../utils.js';
import { S } from '../state.js';
import { saveToHistory } from './history.js';
import JSZip from 'jszip';
import { registerStep, runStep, registerAction, runAction } from '../router.js';
import { shared } from '../shared.js';
import { trackFeature } from '../telemetry.js';
import { generateCapcutDraft } from './capcut-draft.js';
import { ResultHero, DownloadButton, StaggerChildren } from '../components.js';

/* ── URL 허용 호스트 ── */
const PEXELS_HOSTS = ['pexels.com'];
const STORYBLOCKS_HOSTS = ['storyblocks.com'];

function isValidResult(r) {
  return !!(r && r.script && typeof r.script.content === 'string' && typeof r.script.type === 'string');
}

function getSafeResults(raw, warn) {
  const list = Array.isArray(raw) ? raw.filter(isValidResult) : [];
  if (warn && Array.isArray(raw) && raw.length && raw.length !== list.length) {
    toast('일부 결과 데이터가 손상되어 제외되었습니다.', 'err');
  }
  return list;
}

function normalizeScene(s) {
  return {
    scene: s && typeof s.scene === 'string' ? s.scene : '',
    label: s && typeof s.label === 'string' ? s.label : '',
    text: s && typeof s.text === 'string' ? s.text : '',
    purpose: s && typeof s.purpose === 'string' ? s.purpose : '',
    mainEn: s && typeof s.mainEn === 'string' ? s.mainEn : '',
    altEn: Array.isArray(s && s.altEn) ? s.altEn.filter(x => typeof x === 'string') : [],
    ko: s && typeof s.ko === 'string' ? s.ko : '',
    cut: s && typeof s.cut === 'string' ? s.cut : ''
  };
}

function hasVoiceAsset(result) {
  return !!(result && result.voiceResult && (
    result.voiceResult.url ||
    result.voiceResult.blob ||
    (Array.isArray(result.voiceResult.parts) && result.voiceResult.parts.length)
  ));
}

// ★ v3.6.0: 실패 sentinel 판별
function isVoiceFailed(result) {
  return !!(result && result.voiceResult && !hasVoiceAsset(result) && (result.voiceResult.provider === 'failed' || result.voiceResult.error));
}

function buildAnalysisExport() {
  const ana = S.analysis.ana || {};
  return {
    method: ana._method || '',
    usedFallback: !!ana._usedFallback,
    fallbackReason: ana._fallbackReason || '',
    summary: ana.summary || '',
    hooks: Array.isArray(ana.hooks) ? ana.hooks : [],
    structure: Array.isArray(ana.structure) ? ana.structure : [],
    reasons: Array.isArray(ana.reasons) ? ana.reasons : []
  };
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (e) {}
  }, 60000);
}

function buildAnalysisArchivePayload() {
  const ana = S.analysis.ana || {};
  return {
    summary: typeof ana.summary === 'string' ? ana.summary : '',
    hooks: Array.isArray(ana.hooks) ? ana.hooks : [],
    structure: Array.isArray(ana.structure) ? ana.structure : [],
    reasons: Array.isArray(ana.reasons) ? ana.reasons : [],
    method: ana._method || '',
    requestedMethod: ana._requestedMethod || '',
    fallbackReason: ana._fallbackReason || ''
  };
}

// ── Step 10 ──
registerStep(10, () => {
  const v = S.video.sv || {};
  const rawResults = Array.isArray(S.script.results) ? S.script.results : [];
  const results = getSafeResults(rawResults, rawResults.length > 0);

  const root = $('p10');
  root.textContent = '';

  if (!results.length) {
    shared.resultPage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '제작 완료' }));
    root.appendChild(el('div', { className: 'cd', textContent: '결과 스크립트가 없습니다. 이전 단계부터 다시 진행해주세요.' }));
    return;
  }

  let totalChars = 0;
  const totalScripts = results.length;
  let totalEkw = 0;
  let totalFcs = 0;
  results.forEach(r => {
    totalChars += (r.script.content || '').length;
    totalEkw += (r.ekw || []).length;
    totalFcs += (r.fcs || []).length;
  });

  // ── 헤더 ──
  const headerWrap = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:16px' });

  const headerLeft = el('div', { className: 'fx-row', style: 'gap:14px' });
  headerLeft.appendChild(el('div', { style: 'width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--grn),var(--grn2));display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;box-shadow:0 4px 16px rgba(5,150,105,.3)', className: 'celebrate-icon', textContent: '\u2713' }));
  const headerText = el('div');
  headerText.appendChild(el('h2', { className: 'pt', style: 'margin:0', textContent: '제작 완료' }));
  headerText.appendChild(el('p', { style: 'font-size:13px;color:var(--t3);margin:4px 0 0', textContent: totalScripts + '개 스크립트 · ' + new Date().toLocaleDateString('ko', { month: 'long', day: 'numeric', weekday: 'short' }) }));
  headerLeft.appendChild(headerText);
  headerWrap.appendChild(headerLeft);

  const headerRight = el('div', { className: 'fx-wrap-8' });
  const dlPkgBtn = el('button', { className: 'btn btn-download', textContent: '\uD83D\uDCE6 패키지 다운로드' });
  dlPkgBtn.addEventListener('click', () => { runAction('downloadPkg'); });
  headerRight.appendChild(dlPkgBtn);
  const newProjBtn = el('button', { className: 'btn bs', textContent: '새 프로젝트' });
  newProjBtn.addEventListener('click', () => { runAction('newProject'); });
  headerRight.appendChild(newProjBtn);
  headerWrap.appendChild(headerRight);
  root.appendChild(headerWrap);

  // 패키지 내용물 안내
  const pkgDesc = el('div', { style: 'margin-bottom:20px;padding:10px 16px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--r);font-size:12px;color:var(--t3);display:flex;align-items:center;gap:8px' });
  pkgDesc.appendChild(el('span', { style: 'font-size:14px', textContent: '\uD83D\uDCE6' }));
  const hasVoice = results.some(r => hasVoiceAsset(r));
  const hasEkw = results.some(r => r.ekw && r.ekw.length);
  const contents = ['대본 텍스트'];
  if (hasVoice) contents.push('AI 음성 파일');
  if (hasEkw) contents.push('풋티지 브리프');
  if (hasEkw) contents.push('CapCut 프로젝트 + SRT 자막');
  contents.push('영상 분석 요약');
  pkgDesc.appendChild(el('span', { textContent: 'ZIP 패키지에 포함: ' + contents.join(' + ') }));
  root.appendChild(pkgDesc);

  // ★ v3.6.0: 음성 실패 항목 경고 배너
  const voiceFailedCount = results.filter(r => isVoiceFailed(r)).length;
  if (voiceFailedCount > 0) {
    const warnBanner = el('div', { style: 'margin-bottom:20px;padding:12px 16px;background:var(--red-bg);border:1px solid rgba(201,42,42,.15);border-radius:var(--r);font-size:13px;color:var(--red);display:flex;align-items:center;gap:10px' });
    warnBanner.appendChild(el('span', { style: 'font-size:16px;flex-shrink:0', textContent: '⚠' }));
    const warnText = el('div');
    warnText.appendChild(el('div', { style: 'font-weight:600;margin-bottom:2px', textContent: '음성 생성 실패 ' + voiceFailedCount + '건' }));
    warnText.appendChild(el('div', { style: 'font-size:12px', textContent: '해당 스크립트는 ZIP 패키지에 음성 파일이 포함되지 않습니다. 이전 단계에서 재시도할 수 있습니다.' }));
    warnBanner.appendChild(warnText);
    root.appendChild(warnBanner);
  }

  // ── 통계 ──
  const statsGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;margin-bottom:24px' });
  const statItems = [
    { val: String(totalScripts), label: '스크립트', color: 'var(--acc)' },
    { val: totalChars.toLocaleString(), label: '총 글자 수', color: 'var(--blu)' },
    { val: String(totalEkw), label: '풋티지 장면', color: 'var(--grn)' },
    { val: String(v.score || '-'), label: '영상 점수', color: 'var(--yel)' }
  ];
  statItems.forEach((st, si) => {
    const box = el('div', { className: 'cd stagger-' + (si + 1), style: 'padding:20px;text-align:center;margin-bottom:0' });
    box.appendChild(el('div', { className: 'stat-hero', style: 'color:' + st.color, textContent: st.val }));
    box.appendChild(el('div', { className: 'stat-hero-label', textContent: st.label }));
    statsGrid.appendChild(box);
  });
  root.appendChild(statsGrid);

  // ── 원본 영상 (히어로) ──
  const origCard = el('div', { className: 'result-hero mb-14' });
  if (v.thumb) {
    const safeThumb = safeUrl(v.thumb);
    if (safeThumb) {
      const thumbWrap = el('div', { style: 'width:120px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;flex-shrink:0' });
      const thumbImg = el('img', { style: 'width:100%;height:100%;object-fit:cover' });
      thumbImg.src = safeThumb;
      thumbWrap.appendChild(thumbImg);
      origCard.appendChild(thumbWrap);
    }
  }
  const origInfo = el('div', { className: 'flex-1' });
  origInfo.appendChild(el('div', { style: 'font-size:17px;font-weight:800;line-height:1.4;letter-spacing:-.2px;margin-bottom:6px', textContent: v.title || '' }));
  origInfo.appendChild(el('div', { style: 'font-size:12px;color:var(--t3)', textContent: (v.ch || '') + ' · \u25B6 ' + fmt(v.views || 0) + (v.subs ? ' · 구독 ' + fmt(v.subs) : '') }));
  origCard.appendChild(origInfo);
  root.appendChild(origCard);

  // ── 탭 페이지네이션 (멀티 스크립트) ──
  const page = Math.max(0, Math.min(shared.resultPage || 0, results.length - 1));
  shared.resultPage = page;

  if (results.length > 1) {
    const tabWrap = el('div', { className: 'tag-row' });
    results.forEach((r, i) => {
      if (!r || !r.script) return;
      const typeLabel = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);
      const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
      const active = i === page;
      const btn = el('button', {
        className: 'tag tab-item' + (active ? ' on' : ''),
        style: active ? 'border-color:' + typeColor + ';background:' + typeColor + '12' : ''
      });
      btn.appendChild(el('span', { style: 'color:' + typeColor + ';font-weight:600', textContent: typeLabel }));
      btn.appendChild(el('span', { className: 't-2xs-t3', textContent: ' ' + r.script.content.length + '자' }));
      btn.addEventListener('click', () => { shared.resultPage = i; runStep(10); });
      tabWrap.appendChild(btn);
    });
    root.appendChild(tabWrap);
  }

  // ── 현재 페이지 스크립트 ──
  ((() => {
    const r = results[page];
    const i = page;

    if (!r?.script) {
      root.appendChild(el('div', {
        className: 'cd',
        textContent: '결과 데이터가 손상되었습니다. 이전 단계부터 다시 진행해주세요.'
      }));
      return;
    }

    const typeLabel = r.script.type === 'longform' ? '\uD83C\uDFAC 롱폼' : '\uD83D\uDCF1 숏폼 ' + ((r.script.idx || 0) + 1);
    const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
    const vr = r.voiceResult || {};
    const dur = vr.dur || 0;
    const mn = Math.floor(dur / 60);
    const sc = dur % 60;
    const fcs = r.fcs || [];
    const ekw = r.ekw || [];

    const card = el('div', { className: 'cd', style: 'margin-bottom:14px;border-left:4px solid ' + typeColor });

    // 헤더
    const cardHeader = el('div', { className: 'fx-row mb-12' });
    cardHeader.appendChild(el('span', { style: 'font-size:12px;font-weight:600;color:' + typeColor + ';background:' + typeColor + '12;padding:3px 8px;border-radius:4px', textContent: typeLabel }));
    cardHeader.appendChild(el('span', { className: 't-title', textContent: r.script.title || '' }));
    const copyBtn = el('button', { className: 'btn bs', style: 'font-size:11px;margin-left:auto', textContent: '복사' });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(r.script.content).then(() => { toast('복사됨'); });
    });
    cardHeader.appendChild(copyBtn);
    card.appendChild(cardHeader);

    // 뱃지
    const badgeRow = el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap' });
    badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: r.script.content.length + '자' }));
    badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: '팩트체크 ' + fcs.length + '건' }));
    badgeRow.appendChild(el('span', { className: 'bdg bgy', textContent: '풋티지 ' + ekw.length + '장면' }));
    if (vr.url) {
      badgeRow.appendChild(el('span', { className: 'bdg bg2', textContent: '\uD83D\uDD0A ' + mn + ':' + String(sc).padStart(2, '0') }));
    } else if (vr.provider === 'failed' || vr.error) {
      badgeRow.appendChild(el('span', { style: 'font-size:11px;padding:2px 8px;border-radius:4px;background:var(--red-bg);color:var(--red);font-weight:600', textContent: '⚠ 음성 실패' }));
    }
    card.appendChild(badgeRow);

    // 대본
    const scriptText = r.script.content || '';
    const scriptDiv = el('div', { className: 'out', style: 'max-height:300px;overflow-y:auto;padding:12px;background:var(--bg);border-radius:var(--r);font-size:13px;line-height:1.8;white-space:pre-wrap' });
    scriptDiv.textContent = scriptText;
    card.appendChild(scriptDiv);

    // 음성 플레이어
    if (vr.url) {
      const safeAudioUrl = safeUrl(vr.url);
      if (safeAudioUrl) {
        const audioWrap = el('div', { style: 'margin-top:12px;display:flex;align-items:center;gap:10px' });
        const audio = el('audio', { id: 'r10a' + i });
        audio.src = safeAudioUrl;
        audio.preload = 'auto';
        audioWrap.appendChild(audio);

        const playBtn = el('button', { className: 'btn bs', style: 'width:32px;height:32px;border-radius:50%;padding:0;font-size:14px', textContent: '\u25B6' });
        playBtn.addEventListener('click', () => {
          if (audio.paused) { audio.play(); playBtn.textContent = '\u23F8'; }
          else { audio.pause(); playBtn.textContent = '\u25B6'; }
        });
        audioWrap.appendChild(playBtn);

        const barOuter = el('div', { style: 'flex:1;height:4px;background:var(--bg3);border-radius:2px' });
        const barInner = el('div', { id: 'r10p' + i, className: 'progress-fill' });
        barOuter.appendChild(barInner);
        audioWrap.appendChild(barOuter);

        const timeSpan = el('span', { id: 'r10t' + i, className: 't-mono-xs', textContent: '0:00' });
        audioWrap.appendChild(timeSpan);

        card.appendChild(audioWrap);

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
    } else if (vr.provider === 'failed' || vr.error) {
      // ★ v3.6.0: 실패한 음성에 대한 안내
      const errBox = el('div', { style: 'margin-top:12px;padding:10px 14px;background:var(--red-bg);border-radius:var(--r);border:1px solid rgba(201,42,42,.15);font-size:12px;color:var(--red)', textContent: '음성 생성 실패: ' + (vr.error || '알 수 없는 오류') + ' — 이전 단계에서 재시도할 수 있습니다.' });
      card.appendChild(errBox);
    }

    root.appendChild(card);
  }))();

  // ── 페이지 네비게이션 ──
  if (results.length > 1) {
    const navRow = el('div', { className: 'fx-between', style: 'margin-bottom:16px' });
    if (page > 0) {
      const prevBtn = el('button', { className: 'btn bs', textContent: '\u2190 이전 스크립트' });
      prevBtn.addEventListener('click', () => { shared.resultPage = page - 1; runStep(10); });
      navRow.appendChild(prevBtn);
    } else { navRow.appendChild(el('div')); }
    navRow.appendChild(el('span', { className: 't-xs-t3', textContent: (page + 1) + ' / ' + results.length }));
    if (page < results.length - 1) {
      const nextBtn = el('button', { className: 'btn bp', textContent: '다음 스크립트 \u2192' });
      nextBtn.addEventListener('click', () => { shared.resultPage = page + 1; runStep(10); });
      navRow.appendChild(nextBtn);
    } else { navRow.appendChild(el('div')); }
    root.appendChild(navRow);
  }

  // ── 패키지 구성 (접이식) ──
  const pkgCard = el('div', { className: 'cd mt-16' });

  const pkgHeader = el('div', { className: 'fx-row', style: 'margin-bottom:14px;cursor:pointer' });
  pkgHeader.appendChild(el('span', { className: 't-16', textContent: '\uD83D\uDCE6' }));
  pkgHeader.appendChild(el('div', { className: 'st', style: 'margin:0', textContent: '프로젝트 패키지 구성' }));
  const toggleHint = el('span', { style: 'font-size:11px;color:var(--t3);margin-left:auto', textContent: '클릭하여 접기' });
  pkgHeader.appendChild(toggleHint);

  const pkgFiles = el('div', { id: 'pkgFiles', style: 'display:block' });

  pkgHeader.addEventListener('click', () => {
    const isHidden = pkgFiles.style.display === 'none';
    pkgFiles.style.display = isHidden ? 'block' : 'none';
    toggleHint.textContent = isHidden ? '클릭하여 접기' : '클릭하여 펼치기';
  });

  // 파일 목록
  results.forEach(r => {
    const prefix = r.script.type === 'longform' ? 'longform/' : 'short_' + ((r.script.idx || 0) + 1) + '/';
    const folderTypeLabel = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);

    const folderDiv = el('div', { className: 'mb-12' });
    folderDiv.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px', textContent: '\uD83D\uDCC1 ' + prefix + ' (' + folderTypeLabel + ')' }));
    const fileList = el('div', { style: 'display:flex;flex-direction:column;gap:4px;padding-left:16px' });
    fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83D\uDCC4 script.txt \u2014 ' + fmtB(new Blob([r.script.content || '']).size) }));
    if ((r.fcs || []).length) {
      fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83D\uDCCA factcheck.json \u2014 ' + (r.fcs || []).length + '건' }));
    }
    if ((r.ekw || []).length) {
      fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83C\uDFAC footage-brief.txt \u2014 ' + (r.ekw || []).length + '장면' }));
    }
    if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length > 1) {
      r.voiceResult.parts.forEach((part, idx) => {
        fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83D\uDD0A voice/voice_part_' + (idx + 1) + '.mp3 \u2014 ' + fmtB(part.size || 0) }));
      });
    } else if (r.voiceResult && r.voiceResult.blob) {
      fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83D\uDD0A voice.mp3 \u2014 ' + fmtB(r.voiceResult.blob.size) }));
    } else if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length === 1) {
      fileList.appendChild(el('div', { className: 't-xs-t3', textContent: '\uD83D\uDD0A voice.mp3 \u2014 ' + fmtB(r.voiceResult.parts[0].size || 0) }));
    }
    folderDiv.appendChild(fileList);
    pkgFiles.appendChild(folderDiv);
  });

  const analysisLine = el('div', { style: 'font-size:12px;color:var(--t3);padding-top:8px;border-top:1px solid var(--bdr)', textContent: '\uD83D\uDCCA analysis.json \u2014 영상 분석 요약' });
  pkgFiles.appendChild(analysisLine);
  const metaLine = el('div', { style: 'font-size:12px;color:var(--t3)', textContent: '\uD83D\uDCCB project-info.json \u2014 메타데이터' });
  pkgFiles.appendChild(metaLine);

  pkgCard.appendChild(pkgHeader);
  pkgCard.appendChild(pkgFiles);
  root.appendChild(pkgCard);
});

// ── ZIP 다운로드 ──
let _zipJobRunning = false;
registerAction('downloadPkg', async () => {
  if (_zipJobRunning) { toast('패키지 생성 중입니다. 잠시 기다려주세요.'); return; }
  _zipJobRunning = true;
  try {
  const v = S.video.sv || {};
  const results = getSafeResults(S.script.results);

  if (!results.length) {
    toast('다운로드할 결과가 없습니다. 이전 단계부터 다시 진행해주세요.', 'err');
    _zipJobRunning = false;
    return;
  }

  const originalPxDL = Array.isArray(shared.pexelsDL) ? shared.pexelsDL : [];
  const pxDL = originalPxDL.slice(0, 20);

  // 파일 목록 미리보기
  const fileList = [];
  const analysisPayload = buildAnalysisArchivePayload();
  results.forEach(r => {
    if (!r?.script) return;
    const prefix = r.script.type === 'longform' ? 'longform' : 'short_' + ((r.script.idx || 0) + 1);
    fileList.push(prefix + '/script.txt');
    if (r.fcs && r.fcs.length) fileList.push(prefix + '/factcheck.json');
    if (r.ekw && r.ekw.length) fileList.push(prefix + '/footage-brief.txt');
    if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length > 1) {
      r.voiceResult.parts.forEach((_, idx) => {
        fileList.push(prefix + '/voice/voice_part_' + (idx + 1) + '.mp3');
      });
    } else if (r.voiceResult && r.voiceResult.blob) fileList.push(prefix + '/voice.mp3');
    else if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length === 1) fileList.push(prefix + '/voice.mp3');
  });
  fileList.push('analysis.json');
  fileList.push('project-info.json');
  if (pxDL.length) pxDL.forEach((p, i) => { fileList.push('footage/footage_' + (i + 1) + '.mp4'); });
  // CapCut 프로젝트 파일 목록 추가
  const hasEkwForCapcut = results.some(r => r.ekw && r.ekw.length);
  if (hasEkwForCapcut) {
    results.forEach(r => {
      if (!r?.script || !r.ekw || !r.ekw.length) return;
      const prefix = r.script.type === 'longform' ? 'longform' : 'short_' + ((r.script.idx || 0) + 1);
      fileList.push(prefix + '/capcut/draft_content.json');
      fileList.push(prefix + '/subtitles.srt');
    });
  }

  // ★ v3.6.0: 음성 실패 항목을 ZIP 확인 모달에서 명시
  const zipVoiceFailCount = results.filter(r => isVoiceFailed(r)).length;
  let msg = '패키지에 포함될 파일 (' + fileList.length + '개):\n\n' + fileList.map(f => '  ' + f).join('\n');
  if (zipVoiceFailCount > 0) {
    msg += '\n\n⚠ 음성 생성 실패 ' + zipVoiceFailCount + '건 — 해당 스크립트는 음성 파일이 포함되지 않습니다.';
  }
  msg += '\n\n다운로드하시겠습니까?';
  const ok = await confirmModal(msg, {
    confirmText: zipVoiceFailCount > 0 ? '음성 누락 상태로 다운로드' : '다운로드',
    cancelText: '취소',
    danger: zipVoiceFailCount > 0
  });
  if (!ok) { _zipJobRunning = false; return; }
  trackFeature('zip_download');

  const zip = new JSZip();
  const folderName = (v.title || '유튜브도사_' + new Date().toISOString().slice(0, 10)).replace(/[<>:"/\\|?*]/g, '_');

  results.forEach(r => {
    if (!r?.script) return;
    const prefix = r.script.type === 'longform' ? 'longform' : 'short_' + ((r.script.idx || 0) + 1);
    const folder = zip.folder(prefix);
    folder.file('script.txt', r.script.content || '');
    if (r.fcs && r.fcs.length) folder.file('factcheck.json', JSON.stringify(r.fcs, null, 2));
    if (r.ekw && r.ekw.length) {
      folder.file('footage-brief.txt', r.ekw.map(rawScene => {
        const s = normalizeScene(rawScene);
        return '[장면 ' + (s.scene || '') + '] ' + (s.label || '') + '\n대사: ' + (s.text || '') + '\n목적: ' + (s.purpose || '') + '\n검색어: ' + (s.mainEn || '') + ' / ' + s.altEn.join(', ') + '\n한글: ' + (s.ko || '') + '\n컷 길이: ' + (s.cut || '') + '\nStoryblocks: https://www.storyblocks.com/video/search/' + encodeURIComponent(s.mainEn || '');
      }).join('\n\n'));
    }
    if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length > 1) {
      const voiceFolder = folder.folder('voice');
      r.voiceResult.parts.forEach((part, idx) => {
        voiceFolder.file('voice_part_' + (idx + 1) + '.mp3', part);
      });
    } else if (r.voiceResult && r.voiceResult.blob) folder.file('voice.mp3', r.voiceResult.blob);
    else if (Array.isArray(r.voiceResult?.parts) && r.voiceResult.parts.length === 1) folder.file('voice.mp3', r.voiceResult.parts[0]);
  });

  const analysisExport = buildAnalysisExport();
  zip.file('analysis.json', JSON.stringify(analysisExport, null, 2));
  zip.file('project-info.json', JSON.stringify({
    title: v.title || '', channel: v.ch || '', views: v.views, score: v.score,
    scriptsCount: results.length, createdAt: new Date().toISOString(),
    analysisMethod: analysisExport.method || '',
    analysisUsedFallback: analysisExport.usedFallback
  }, null, 2));

  // ── CapCut Draft 자동 생성 ──
  try {
    results.forEach(r => {
      if (!r?.script || !r.ekw || !r.ekw.length) return;
      const prefix = r.script.type === 'longform' ? 'longform' : 'short_' + ((r.script.idx || 0) + 1);
      const scenes = r.ekw.map(rawScene => {
        const s = normalizeScene(rawScene);
        return { scene: s.scene, label: s.label, text: s.text, cut: s.cut, mainEn: s.mainEn, ko: s.ko };
      });
      const isShorts = r.script.type !== 'longform';
      const voiceInfo = (r.voiceResult && hasVoiceAsset(r))
        ? { filePath: prefix + '/voice.mp3', durationMs: r.voiceResult.durationMs || null }
        : null;
      const draft = generateCapcutDraft({
        projectName: (v.title || '유튜브도사') + '_' + prefix,
        format: isShorts ? 'shorts' : 'longform',
        scenes,
        voice: voiceInfo,
      });
      const ccFolder = zip.folder(prefix + '/capcut');
      ccFolder.file('draft_content.json', draft.draftContent);
      ccFolder.file('draft_meta_info.json', draft.draftMeta);
      if (draft.srt) zip.folder(prefix).file('subtitles.srt', draft.srt);
    });
  } catch (e) {
    console.warn('[ZIP] CapCut draft 생성 실패 (무시):', e.message || e);
  }

  // Pexels 다운로드 포함 (P1-10: 동시 3개 제한 + 진행률 + 실패 재시도)
  if (pxDL.length) {
    const MAX_CONCURRENT = 3;
    if (originalPxDL.length > 20) {
      toast('풋티지가 20개를 초과합니다. 상위 20개만 포함됩니다.', 'err');
    }
    toast('패키지 생성 중... (Pexels 영상 ' + pxDL.length + '개 다운로드)');
    const pxFolder = zip.folder('footage');
    let pxSuccess = 0;
    const pxFailed = [];

    // 진행률 UI
    const progWrap = el('div', { id: '_pxProg', style: 'position:fixed;bottom:80px;right:24px;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);padding:14px 18px;box-shadow:var(--shadow-md);z-index:9999;min-width:240px' });
    progWrap.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:var(--t1);margin-bottom:8px', textContent: '\uD83C\uDFAC 풋티지 다운로드' }));
    const progBar = el('div', { style: 'height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:6px' });
    const progFill = el('div', { style: 'height:100%;background:var(--acc);border-radius:3px;width:0%;transition:width .3s' });
    progBar.appendChild(progFill);
    progWrap.appendChild(progBar);
    const progText = el('div', { style: 'font-size:11px;color:var(--t3)', textContent: '0/' + pxDL.length + ' 다운로드 중...' });
    progWrap.appendChild(progText);
    document.body.appendChild(progWrap);

    function updatePxProgress() {
      const done = pxSuccess + pxFailed.length;
      const pct = Math.round((done / pxDL.length) * 100);
      progFill.style.width = pct + '%';
      progText.textContent = done + '/' + pxDL.length + ' 완료' + (pxFailed.length ? ' (' + pxFailed.length + '개 실패)' : '');
    }

    // ★ P0: 공통 다운로드 함수 — r.ok / Content-Type / 파일 크기 / 총량 일원화 검증
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
    const MAX_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB total
    let totalDownloadedBytes = 0;

    async function fetchFootageBlob(url, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, timeoutMs || 15000);
      try {
        const r = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!r.ok) throw new Error('HTTP_' + r.status);
        try {
          const finalUrl = new URL(r.url || url);
          if (!PEXELS_HOSTS.some(host => { return finalUrl.hostname === host || finalUrl.hostname.endsWith('.' + host); })) {
            throw new Error('UNTRUSTED_REDIRECT: ' + finalUrl.hostname);
          }
        } catch (e) {
          if ((e && e.message || '').indexOf('UNTRUSTED_REDIRECT') !== -1) throw e;
          throw new Error('INVALID_URL');
        }
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('video') && !ct.includes('octet-stream')) {
          throw new Error('INVALID_CONTENT_TYPE: ' + ct.substring(0, 50));
        }
        const blob = await r.blob();
        if (blob.size > MAX_FILE_SIZE) {
          throw new Error('FILE_TOO_LARGE: ' + Math.round(blob.size / 1024 / 1024) + 'MB');
        }
        if (totalDownloadedBytes + blob.size > MAX_TOTAL_SIZE) {
          throw new Error('TOTAL_LIMIT_EXCEEDED');
        }
        totalDownloadedBytes += blob.size;
        return blob;
      } catch (e) {
        if (e && e.name === 'AbortError') throw new Error('DOWNLOAD_TIMEOUT');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    }

    // 세마포어 기반 동시성 제한
    async function downloadWithLimit(items, limit) {
      let idx = 0;
      async function worker() {
        while (idx < items.length) {
          if (totalDownloadedBytes >= MAX_TOTAL_SIZE) {
            const remaining = items.length - idx;
            if (remaining > 0) toast('풋티지 총 용량 제한(200MB) 초과 — 나머지 ' + remaining + '개 건너뜀', 'err');
            break;
          }
          const i = idx++;
          const p = items[i];
          const safePxUrl = safeUrl(p.url, PEXELS_HOSTS);
          if (!safePxUrl) { pxFailed.push({ idx: i, author: p.author || 'footage_' + (i + 1) }); updatePxProgress(); continue; }
          try {
            const blob = await fetchFootageBlob(safePxUrl);
            const safeAuthor = ((p.author || 'unknown') + '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) || 'unknown';
            pxFolder.file('footage_' + (i + 1) + '_' + safeAuthor + '.mp4', blob);
            pxSuccess++;
          } catch (e) {
            console.warn('[ZIP] 풋티지 ' + (i + 1) + ' 실패:', e.message);
            pxFailed.push({ idx: i, author: p.author || 'footage_' + (i + 1) });
          }
          updatePxProgress();
        }
      }
      const workers = [];
      for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
      await Promise.all(workers);
    }

    downloadWithLimit(pxDL, MAX_CONCURRENT).then(async () => {
      // 실패 항목 1회 재시도 — ★ P0: 동일한 fetchFootageBlob 검증 적용
      if (pxFailed.length) {
        const retryItems = pxFailed.splice(0);
        progText.textContent = '실패 ' + retryItems.length + '개 재시도 중...';
        for (const item of retryItems) {
          const p = pxDL[item.idx];
          if (!p) continue;
          const safePxUrl = safeUrl(p.url, PEXELS_HOSTS);
          if (!safePxUrl) { pxFailed.push(item); continue; }
          try {
            const blob = await fetchFootageBlob(safePxUrl);
            const safeAuthor = ((p.author || 'unknown') + '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20) || 'unknown';
            pxFolder.file('footage_' + (item.idx + 1) + '_' + safeAuthor + '.mp4', blob);
            pxSuccess++;
          } catch (e) {
            pxFailed.push(item);
          }
          updatePxProgress();
        }
      }

      // project-info에 실패 항목 기록
      if (pxFailed.length) {
        const infoRaw = zip.file('project-info.json');
        if (infoRaw) {
          try {
            const txt = await infoRaw.async('string');
            const info = JSON.parse(txt);
            info.footageIncluded = pxSuccess;
            info.footageFailed = pxFailed.map(f => f.author);
            zip.file('project-info.json', JSON.stringify(info, null, 2));
          } catch(e) {}
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(blob, folderName + '.zip');

      // 진행률 UI 제거
      const progEl = document.getElementById('_pxProg');
      if (progEl) progEl.remove();

      if (pxFailed.length) {
        toast('패키지 다운로드 완료 (풋티지 ' + pxSuccess + '/' + pxDL.length + '개 포함, ' + pxFailed.length + '개 다운로드 실패)', 'err');
      } else {
        toast('패키지 다운로드 완료 (풋티지 ' + pxDL.length + '개 포함)');
      }
      saveToHistory();
    }).catch(() => {
      const progEl = document.getElementById('_pxProg');
      if (progEl) progEl.remove();
      toast('ZIP 생성에 실패했습니다.', 'err');
    }).finally(() => { _zipJobRunning = false; });
  } else {
    toast('패키지 생성 중...');
    zip.generateAsync({ type: 'blob' }).then(blob => {
      triggerBlobDownload(blob, folderName + '.zip');
      toast('패키지 다운로드 완료 (' + results.length + '개 스크립트)');
      saveToHistory();
    }).catch(() => { toast('ZIP 생성에 실패했습니다.', 'err'); }).finally(() => { _zipJobRunning = false; });
  }
  } catch (e) { _zipJobRunning = false; throw e; }
});



