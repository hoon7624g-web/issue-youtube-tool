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
  headerLeft.appendChild(el('div', { style: 'width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--grn),#2ecc71);display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;box-shadow:0 4px 16px rgba(13,146,84,.25)', textContent: '\u2713' }));
  const headerText = el('div');
  headerText.appendChild(el('h2', { className: 'pt', style: 'margin:0', textContent: '제작 완료' }));
  headerText.appendChild(el('p', { style: 'font-size:13px;color:var(--t3);margin:4px 0 0', textContent: totalScripts + '개 스크립트 · ' + new Date().toLocaleDateString('ko', { month: 'long', day: 'numeric', weekday: 'short' }) }));
  headerLeft.appendChild(headerText);
  headerWrap.appendChild(headerLeft);

  const headerRight = el('div', { className: 'fx-wrap-8' });
  const dlPkgBtn = el('button', { className: 'btn bp btn-lg', style: 'gap:6px', textContent: '\uD83D\uDCE6 패키지 다운로드' });
  dlPkgBtn.addEventListener('click', () => { runAction('downloadPkg'); });
  headerRight.appendChild(dlPkgBtn);
  // ── FFmpeg 영상 자동 생성 버튼 (Electron에서만 표시) ──
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.ffmpegCheck) {
    const genVideoBtn = el('button', { className: 'btn bs btn-lg', style: 'gap:6px', textContent: '\uD83C\uDFAC 영상 자동 생성' });
    genVideoBtn.addEventListener('click', () => { runAction('generateVideo'); });
    headerRight.appendChild(genVideoBtn);
    // FFmpeg 미설치 시 비활성화
    window.electronAPI.ffmpegCheck().then(r => {
      if (!r.available) {
        genVideoBtn.disabled = true;
        genVideoBtn.title = 'FFmpeg 미설치 — npm install ffmpeg-static 필요';
        genVideoBtn.style.opacity = '.4';
      }
    }).catch(() => {});
  }
  // ── Remotion 숏폼 영상 생성 버튼 (Electron에서만 표시) ──
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.remotionCheck) {
    const genRemotionBtn = el('button', { className: 'btn bs btn-lg', style: 'gap:6px;background:linear-gradient(135deg,#FF6B35,#FF3D00);color:#fff;border:none', textContent: '\uD83C\uDFAC Remotion 숏폼' });
    genRemotionBtn.addEventListener('click', () => { runAction('generateVideoRemotion'); });
    headerRight.appendChild(genRemotionBtn);
    // Remotion 미설치 시 비활성화
    window.electronAPI.remotionCheck().then(r => {
      if (!r.available) {
        genRemotionBtn.disabled = true;
        genRemotionBtn.title = 'Remotion 미설치 — remotion 폴더에서 npm install 필요';
        genRemotionBtn.style.opacity = '.4';
        genRemotionBtn.style.background = 'var(--bg3)';
        genRemotionBtn.style.color = 'var(--t3)';
      }
    }).catch(() => {});
  }
  // ── 롱폼 썸네일 생성 버튼 (Electron + Remotion) ──
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.remotionRenderThumbnail) {
    const genThumbBtn = el('button', { className: 'btn bs btn-lg', style: 'gap:6px', textContent: '\uD83D\uDDBC\uFE0F 썸네일 생성' });
    genThumbBtn.addEventListener('click', () => { runAction('generateThumbnail'); });
    headerRight.appendChild(genThumbBtn);
  }
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
  const statsGrid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px' });
  const statItems = [
    { val: String(totalScripts), label: '스크립트', color: 'var(--acc)' },
    { val: totalChars.toLocaleString(), label: '총 글자 수', color: 'var(--blu)' },
    { val: String(totalEkw), label: '풋티지 장면', color: 'var(--grn)' },
    { val: String(v.score || '-'), label: '영상 점수', color: 'var(--yel)' }
  ];
  statItems.forEach(st => {
    const box = el('div', { style: 'background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);padding:16px;text-align:center' });
    box.appendChild(el('div', { style: 'font-size:22px;font-weight:700;font-family:var(--mono);color:' + st.color, textContent: st.val }));
    box.appendChild(el('div', { className: 'note-xs', textContent: st.label }));
    statsGrid.appendChild(box);
  });
  root.appendChild(statsGrid);

  // ── 원본 영상 ──
  const origCard = el('div', { className: 'cd mb-14' });
  const origRow = el('div', { className: 'fx-row', style: 'gap:14px' });
  if (v.thumb) {
    const safeThumb = safeUrl(v.thumb);
    if (safeThumb) {
      const thumbImg = el('img', { style: 'width:80px;height:45px;border-radius:6px;object-fit:cover' });
      thumbImg.src = safeThumb;
      origRow.appendChild(thumbImg);
    }
  }
  const origInfo = el('div', { className: 'flex-1' });
  origInfo.appendChild(el('div', { style: 'font-size:14px;font-weight:600;line-height:1.4', textContent: v.title || '' }));
  origInfo.appendChild(el('div', { style: 'font-size:12px;color:var(--t3);margin-top:2px', textContent: (v.ch || '') + ' · \u25B6 ' + fmt(v.views || 0) }));
  origRow.appendChild(origInfo);
  origCard.appendChild(origRow);
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

    // 풋티지 키워드
    if (ekw.length) {
      const footageWrap = el('div', { style: 'margin-top:14px' });
      footageWrap.appendChild(el('div', { className: 't-subtitle mb-8', textContent: '\uD83C\uDFAC 풋티지 키워드' }));
      const tagsRow = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' });
      ekw.forEach(s => {
        const color = LABEL_COLORS[s.label] || '#6B7280';
        const safeSbHref = safeUrl('https://www.storyblocks.com/video/search/' + encodeURIComponent(s.mainEn || ''), STORYBLOCKS_HOSTS);
        if (safeSbHref) {
          const tag = el('a', {
            href: safeSbHref,
            target: '_blank',
            rel: 'noopener',
            className: 'tag on',
            style: 'text-decoration:none;font-size:11px;border-color:' + color + '30'
          });
          tag.appendChild(el('span', { style: 'color:' + color + ';font-weight:600', textContent: s.label || '' }));
          tag.appendChild(document.createTextNode(' ' + (s.mainEn || '') + ' \u2197'));
          tagsRow.appendChild(tag);
        }
      });
      footageWrap.appendChild(tagsRow);
      card.appendChild(footageWrap);
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

  // ── 다음 단계 안내 CTA ──
  const ctaCard = el('div', { className: 'cta-card' });
  const ctaHeader = el('div', { className: 'fx-row-10', style: 'margin-bottom:12px' });
  ctaHeader.appendChild(el('span', { style: 'font-size:20px', textContent: '\uD83D\uDE80' }));
  ctaHeader.appendChild(el('span', { style: 'font-size:15px;font-weight:700;color:var(--t1)', textContent: '다음은 이렇게 활용해보세요' }));
  ctaCard.appendChild(ctaHeader);
  const ctaSteps = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' });
  const ctaItems = [
    { icon: '\uD83C\uDFAC', title: 'CapCut으로 편집', desc: 'capcut/ 폴더를 CapCut 프로젝트 경로에 복사하면 음성+자막이 배치된 상태로 시작합니다' },
    { icon: '\uD83D\uDD0A', title: '풋티지 추가', desc: '풋티지 브리프(footage-brief.txt)를 참고해 CapCut 타임라인에 B-roll을 배치하세요' },
    { icon: '\u2705', title: '팩트체크 확인', desc: 'factcheck.json의 주의/미확인 항목을 직접 검증하고 수정하세요' },
    { icon: '\uD83D\uDCE2', title: '완성작 공유', desc: '체인저스캠퍼스 카페에 완성 영상을 업로드하고 피드백을 받아보세요' }
  ];
  ctaItems.forEach(item => {
    const box = el('div', { style: 'padding:12px 14px;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r);display:flex;gap:10px;align-items:flex-start' });
    box.appendChild(el('span', { style: 'font-size:16px;flex-shrink:0', textContent: item.icon }));
    const txt = el('div');
    txt.appendChild(el('div', { style: 'font-size:13px;font-weight:600;color:var(--t1);margin-bottom:2px', textContent: item.title }));
    txt.appendChild(el('div', { style: 'font-size:11px;color:var(--t3);line-height:1.5', textContent: item.desc }));
    box.appendChild(txt);
    ctaSteps.appendChild(box);
  });
  ctaCard.appendChild(ctaSteps);
  root.appendChild(ctaCard);
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

// ═══════════════════════════════════════
// 영상 자동 생성 (FFmpeg)
// ═══════════════════════════════════════
let _videoJobRunning = false;
registerAction('generateVideo', async () => {
  if (_videoJobRunning) { toast('영상 생성 중입니다. 잠시 기다려주세요.'); return; }
  if (!window.electronAPI || !window.electronAPI.ffmpegAssemble) {
    toast('이 기능은 데스크탑 앱에서만 사용 가능합니다.', 'err'); return;
  }

  const results = getSafeResults(S.script.results);
  if (!results.length) { toast('결과 스크립트가 없습니다.', 'err'); return; }

  // 첫 번째 결과 또는 선택된 결과 사용
  const result = results[shared.resultPage || 0] || results[0];
  if (!result || !result.ekw || !result.ekw.length) {
    toast('풋티지 브리프(장면 정보)가 없습니다. Step 8을 먼저 완료해주세요.', 'err'); return;
  }

  const pxDL = Array.isArray(shared.pexelsDL) ? shared.pexelsDL : [];
  if (!pxDL.length) {
    toast('Pexels 풋티지가 없습니다. Step 8에서 풋티지를 검색해주세요.', 'err'); return;
  }

  // 확인 모달
  const v = S.video.sv || {};
  const ok = await confirmModal(
    '영상 자동 생성\n\n' +
    '풋티지 ' + pxDL.length + '개 + TTS 음성 + 자막을 조합하여\nMP4 영상을 자동으로 만듭니다.\n\n' +
    '풋티지 다운로드 → 트림 → 조립 → 인코딩\n(약 1~3분 소요)\n\n진행하시겠습니까?',
    { confirmText: '영상 생성 시작', cancelText: '취소' }
  );
  if (!ok) return;

  _videoJobRunning = true;
  trackFeature('ffmpeg_generate');

  // 진행률 UI
  const progWrap = el('div', { id: '_ffProg', style: 'position:fixed;bottom:80px;right:24px;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);padding:14px 18px;box-shadow:var(--shadow-md);z-index:9999;min-width:280px' });
  progWrap.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:var(--t1);margin-bottom:8px', textContent: '\uD83C\uDFAC 영상 자동 생성' }));
  const progBar = el('div', { style: 'height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:6px' });
  const progFill = el('div', { style: 'height:100%;background:var(--acc);border-radius:3px;width:0%;transition:width .3s' });
  progBar.appendChild(progFill);
  progWrap.appendChild(progBar);
  const progText = el('div', { style: 'font-size:11px;color:var(--t3)', textContent: '준비 중...' });
  progWrap.appendChild(progText);
  document.body.appendChild(progWrap);

  // FFmpeg 진행률 수신
  const removeProgressListener = window.electronAPI.onFFmpegProgress(({ stage, pct, msg }) => {
    progFill.style.width = pct + '%';
    progText.textContent = msg || (stage + ' ' + pct + '%');
  });

  try {
    // 장면 데이터 추출
    const scenes = result.ekw.map(rawScene => {
      const s = normalizeScene(rawScene);
      return { scene: s.scene, label: s.label, text: s.text, cut: s.cut, mainEn: s.mainEn };
    });

    // 음성 데이터 (ArrayBuffer로 변환)
    let voiceBuffer = null;
    let voiceDurationMs = 0;
    if (hasVoiceAsset(result)) {
      const vr = result.voiceResult;
      if (vr.blob) {
        voiceBuffer = await vr.blob.arrayBuffer();
      } else if (Array.isArray(vr.parts) && vr.parts.length) {
        // 파트가 여러개면 첫 번째 사용 (또는 합칠 수 있으나 단순화)
        voiceBuffer = await vr.parts[0].arrayBuffer();
      }
      voiceDurationMs = vr.durationMs || 0;
    }

    // 풋티지 URL 목록
    const footageList = pxDL.map(p => ({
      url: p.url || '',
      durationMs: p.durationMs || 5000,
    }));

    const isShorts = result.script.type !== 'longform';
    const projectName = (v.title || '유튜브도사') + '_' + (isShorts ? 'shorts' : 'longform');

    // IPC로 메인 프로세스에 전달
    const res = await window.electronAPI.ffmpegAssemble({
      footageList,
      voiceBuffer: voiceBuffer ? Array.from(new Uint8Array(voiceBuffer)) : null,
      voiceDurationMs,
      scenes,
      format: isShorts ? 'shorts' : 'longform',
      projectName,
    });

    if (res.ok) {
      toast('영상 생성 완료! ' + res.path);
    } else if (res.canceled) {
      toast('영상 저장이 취소되었습니다.');
    } else {
      toast('영상 생성 실패: ' + (res.error || '알 수 없는 오류'), 'err');
    }
  } catch (e) {
    toast('영상 생성 실패: ' + (e.message || e), 'err');
  } finally {
    _videoJobRunning = false;
    removeProgressListener();
    const progEl = document.getElementById('_ffProg');
    if (progEl) progEl.remove();
  }
});

// ═══════════════════════════════════════
// Remotion 숏폼 영상 생성
// ═══════════════════════════════════════
let _remotionJobRunning = false;
registerAction('generateVideoRemotion', async () => {
  if (_remotionJobRunning) { toast('Remotion 영상 생성 중입니다. 잠시 기다려주세요.'); return; }
  if (!window.electronAPI || !window.electronAPI.remotionRender) {
    toast('이 기능은 데스크탑 앱에서만 사용 가능합니다.', 'err'); return;
  }

  const results = getSafeResults(S.script.results);
  if (!results.length) { toast('결과 스크립트가 없습니다.', 'err'); return; }

  const result = results[shared.resultPage || 0] || results[0];
  if (!result || !result.ekw || !result.ekw.length) {
    toast('풋티지 브리프(장면 정보)가 없습니다. Step 8을 먼저 완료해주세요.', 'err'); return;
  }

  const pxDL = Array.isArray(shared.pexelsDL) ? shared.pexelsDL : [];
  if (!pxDL.length) {
    toast('Pexels 풋티지가 없습니다. Step 8에서 풋티지를 검색해주세요.', 'err'); return;
  }

  const v = S.video.sv || {};
  const ok = await confirmModal(
    'Remotion 숏폼 영상 생성\n\n' +
    '풋티지 ' + pxDL.length + '개 + TTS 음성 + 자막을 조합하여\n' +
    '고품질 숏폼 MP4 영상을 자동으로 만듭니다.\n\n' +
    '풋티지 다운로드 → Remotion 번들링 → 렌더링 → 인코딩\n' +
    '(약 2~5분 소요)\n\n진행하시겠습니까?',
    { confirmText: 'Remotion 영상 생성', cancelText: '취소' }
  );
  if (!ok) return;

  _remotionJobRunning = true;
  trackFeature('remotion_generate');

  // 진행률 UI
  const progWrap = el('div', { id: '_rmProg', style: 'position:fixed;bottom:80px;right:24px;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);padding:14px 18px;box-shadow:var(--shadow-md);z-index:9999;min-width:300px' });
  progWrap.appendChild(el('div', { style: 'font-size:12px;font-weight:600;color:var(--t1);margin-bottom:8px', textContent: '\uD83C\uDFAC Remotion 숏폼 영상 생성' }));
  const progBar = el('div', { style: 'height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin-bottom:6px' });
  const progFill = el('div', { style: 'height:100%;background:linear-gradient(90deg,#FF6B35,#FF3D00);border-radius:3px;width:0%;transition:width .3s' });
  progBar.appendChild(progFill);
  progWrap.appendChild(progBar);
  const progText = el('div', { style: 'font-size:11px;color:var(--t3)', textContent: '준비 중...' });
  progWrap.appendChild(progText);
  document.body.appendChild(progWrap);

  // Remotion 진행률 수신
  const removeProgressListener = window.electronAPI.onRemotionProgress(({ stage, pct, msg }) => {
    progFill.style.width = pct + '%';
    progText.textContent = msg || (stage + ' ' + pct + '%');
  });

  try {
    // 장면 데이터 추출
    const scenes = result.ekw.map(rawScene => {
      const s = normalizeScene(rawScene);
      return { scene: s.scene, label: s.label, text: s.text, cut: s.cut, mainEn: s.mainEn };
    });

    // 음성 데이터 (ArrayBuffer → Uint8Array)
    let voiceBuffer = null;
    let voiceDurationMs = 0;
    if (hasVoiceAsset(result)) {
      const vr = result.voiceResult;
      if (vr.blob) {
        voiceBuffer = await vr.blob.arrayBuffer();
      } else if (Array.isArray(vr.parts) && vr.parts.length) {
        voiceBuffer = await vr.parts[0].arrayBuffer();
      }
      voiceDurationMs = vr.durationMs || 0;
    }

    // 풋티지 URL 목록
    const footageList = pxDL.map(p => ({
      url: p.url || '',
      durationMs: p.durationMs || 5000,
    }));

    const projectName = (v.title || '유튜브도사') + '_shorts';

    // IPC → Remotion 렌더링
    const res = await window.electronAPI.remotionRender({
      footageList,
      voiceBuffer: voiceBuffer ? Array.from(new Uint8Array(voiceBuffer)) : null,
      voiceDurationMs,
      scenes,
      projectName,
    });

    if (res.ok) {
      toast('Remotion 숏폼 영상 생성 완료! ' + res.path);
    } else if (res.canceled) {
      toast('영상 저장이 취소되었습니다.');
    } else {
      toast('영상 생성 실패: ' + (res.error || '알 수 없는 오류'), 'err');
    }
  } catch (e) {
    toast('영상 생성 실패: ' + (e.message || e), 'err');
  } finally {
    _remotionJobRunning = false;
    removeProgressListener();
    const progEl = document.getElementById('_rmProg');
    if (progEl) progEl.remove();
  }
});

// ═══════════════════════════════════════
// 롱폼 썸네일 생성 (Remotion renderStill)
// ═══════════════════════════════════════
registerAction('generateThumbnail', async () => {
  if (!window.electronAPI || !window.electronAPI.remotionRenderThumbnail) {
    toast('이 기능은 데스크탑 앱에서만 사용 가능합니다.', 'err'); return;
  }
  const results = getSafeResults(S.script.results);
  if (!results.length) { toast('결과 스크립트가 없습니다.', 'err'); return; }

  const result = results[shared.resultPage || 0] || results[0];
  const v = S.video.sv || {};
  const title = result.script.title || v.title || '제목 없음';
  const pxDL = Array.isArray(shared.pexelsDL) ? shared.pexelsDL : [];
  const bgUrl = pxDL.length > 0 && pxDL[0].image ? pxDL[0].image : (v.thumb || null);

  trackFeature('thumbnail_generate');
  toast('썸네일 생성 중...');

  try {
    const res = await window.electronAPI.remotionRenderThumbnail({
      title: title,
      backgroundUrl: bgUrl,
      accentColor: '#FF6B35',
      channelName: v.ch || '',
      style: 'bold',
    });
    if (res.ok) { toast('썸네일 저장 완료! ' + res.path); }
    else if (res.canceled) { toast('저장이 취소되었습니다.'); }
    else { toast('썸네일 생성 실패: ' + (res.error || '알 수 없는 오류'), 'err'); }
  } catch (e) {
    toast('썸네일 생성 실패: ' + (e.message || e), 'err');
  }
});
