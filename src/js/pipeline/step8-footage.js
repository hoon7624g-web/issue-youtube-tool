// ═══════════════════════════════════════
// pipeline/step8-footage.js — 배치 풋티지 브리프 + Pexels
// v3.6.0 — XSS 방어: innerHTML/onclick 전면 제거, DOM 기반 전환 + Pexels 캐싱
// ═══════════════════════════════════════
import {
  $,
  toast,
  withTimeout,
  safeUrl,
  createProgress,
  el,
  LABEL_COLORS,
  mergeAbortSignals,
} from '../utils.js';
import { S, sSet, sNext, sPrev, sOn } from '../state.js';
import { K } from '../constants.js';

// ★ P1-10: step 이탈 시 in-flight 풋티지 작업 무효화 + 새 프로젝트 리셋
sOn(K.NAV_STEP, (step) => {
  if (step !== 8) {
    _ekRunId++;
    _ekJobRunning = false;
    try {
      _ekLeaveAC.abort(new Error('step-leave'));
    } catch (e) {}
    _ekLeaveAC = new AbortController();
  }
  if (step <= 2) {
    _ekPage = 0;
    // _pexelsCache는 const object이므로 키만 삭제
    Object.keys(_pexelsCache).forEach((k) => delete _pexelsCache[k]);
    Object.keys(_pexelsPending).forEach((k) => delete _pexelsPending[k]);
  }
});
import { Api } from '../api.js';
import { getApiKeys } from '../../client-proxy.js';
import { registerStep } from '../router.js';
import { shared } from '../shared.js';
import { ResultTabs } from '../components.js';

function sbUrl(q) {
  return 'https://www.storyblocks.com/video/search/' + encodeURIComponent(q);
}

/* ── URL 허용 호스트 ── */
const PEXELS_HOSTS = ['pexels.com'];
const STORYBLOCKS_HOSTS = ['storyblocks.com'];

/* ── Pexels 캐시 ── */
const _pexelsCache = {};
let _ekLeaveAC = new AbortController();

function isValidResult(r) {
  return !!(
    r &&
    r.script &&
    typeof r.script.content === 'string' &&
    typeof r.script.type === 'string'
  );
}

function getResultArray() {
  return Array.isArray(S.script.results) ? S.script.results : [];
}

function normalizeScene(s) {
  return {
    scene: s && typeof s.scene === 'string' ? s.scene : '',
    label: s && typeof s.label === 'string' ? s.label : '',
    text: s && typeof s.text === 'string' ? s.text : '',
    purpose: s && typeof s.purpose === 'string' ? s.purpose : '',
    mainEn: s && typeof s.mainEn === 'string' ? s.mainEn : '',
    altEn: Array.isArray(s && s.altEn) ? s.altEn.filter((x) => typeof x === 'string') : [],
    ko: s && typeof s.ko === 'string' ? s.ko : '',
    cut: s && typeof s.cut === 'string' ? s.cut : '',
  };
}

/* ── 장면 카드 (DOM) ── */
function _buildSceneCard(s, i, ri, hasPexels) {
  const color = LABEL_COLORS[s.label] || '#6B7280';
  const pxId = 'pexels-' + ri + '-' + i;

  const card = el('div', {
    className: 'cd cd-bar-acc',
    style: 'margin-bottom:14px;border-left:4px solid ' + color,
  });

  // 헤더
  const headerRow = el('div', { className: 'fx-row-10', style: 'margin-bottom:12px' });
  const numBadge = el('div', {
    style:
      'width:32px;height:32px;border-radius:8px;background:' +
      color +
      '15;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;font-weight:700;color:' +
      color,
    textContent: String(i + 1),
  });
  const headerInfo = el('div', { className: 'flex-1' });
  headerInfo.appendChild(
    el('span', {
      style: 'font-size:13px;font-weight:700;color:' + color,
      textContent: s.label || '',
    })
  );
  headerInfo.appendChild(
    el('span', {
      style: 'font-size:12px;color:var(--t3);margin-left:8px',
      textContent: s.cut || '',
    })
  );
  headerRow.appendChild(numBadge);
  headerRow.appendChild(headerInfo);
  card.appendChild(headerRow);

  // 대사
  const textDiv = el('div', {
    style:
      'font-size:14px;color:var(--t1);line-height:1.6;margin-bottom:10px;padding:10px 14px;background:var(--bg);border-radius:var(--r);font-style:italic',
  });
  textDiv.textContent = '\u201C' + (s.text || '') + '\u201D';
  card.appendChild(textDiv);

  // 목적
  card.appendChild(
    el('div', {
      style: 'font-size:13px;color:var(--t2);margin-bottom:10px',
      textContent: s.purpose || '',
    })
  );

  // 키워드 태그
  const tagsDiv = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px' });

  function makeKwTag(text, isMain, isBg2) {
    const tag = el('span', {
      className: 'tag' + (isMain ? ' on' : ''),
      style:
        'font-weight:' +
        (isMain ? '600' : '400') +
        ';cursor:pointer' +
        (isBg2 ? ';background:var(--bg2);color:var(--t2)' : ''),
      textContent: '\uD83D\uDD0D ' + text,
    });
    tag.addEventListener('click', () => {
      _loadPexelsRow(pxId, text);
    });
    return tag;
  }

  if (s.mainEn) tagsDiv.appendChild(makeKwTag(s.mainEn, true, false));
  (s.altEn || []).forEach((alt) => {
    if (typeof alt === 'string' && alt.trim()) tagsDiv.appendChild(makeKwTag(alt, false, false));
  });
  if (s.ko) tagsDiv.appendChild(makeKwTag(s.ko, false, true));
  card.appendChild(tagsDiv);

  // Pexels 결과 컨테이너
  if (hasPexels) {
    card.appendChild(
      el('div', {
        id: pxId,
        className: 'pexels-row',
        style: 'display:flex;gap:8px;overflow-x:auto;padding:8px 0',
      })
    );
  }

  return card;
}

/* ── Pexels 검색 + 렌더 (DOM 기반, 캐시 적용) ── */
let _pexelsKeys = null;
const _pexelsPending = {}; // ★ P0-4: 진행 중인 요청 추적 — 같은 쿼리 이중 호출 방지

function _loadPexelsRow(elId, query) {
  if (!_pexelsKeys || !_pexelsKeys.pexels) return;
  if (typeof query !== 'string' || !query.trim()) return;
  const container = document.getElementById(elId);
  if (!container) return;

  // 캐시 히트
  const cacheKey = query.toLowerCase().trim();
  if (_pexelsCache[cacheKey]) {
    _renderPexelsVideos(container, _pexelsCache[cacheKey], elId);
    return;
  }

  // ★ P0-4: 같은 쿼리가 이미 요청 중이면 완료 후 렌더만 수행 (중복 API 호출 방지)
  if (_pexelsPending[cacheKey]) {
    _pexelsPending[cacheKey].then(() => {
      const el2 = document.getElementById(elId);
      if (el2 && _pexelsCache[cacheKey]) {
        _renderPexelsVideos(el2, _pexelsCache[cacheKey], elId);
      }
    });
    return;
  }

  // 로딩 표시
  container.textContent = '';
  container.appendChild(
    el('div', { className: 't-xs-t4', textContent: '"' + query + '" 검색 중...' })
  );

  const _handlePexelsResult = (data) => {
    const el2 = document.getElementById(elId);
    if (!el2) return;
    if (!data.videos || !data.videos.length) {
      el2.textContent = '';
      const noResult = el('div', { className: 't-xs-t4', textContent: '관련 영상 없음 \u2014 ' });
      const safeSb = safeUrl(sbUrl(query), STORYBLOCKS_HOSTS);
      if (safeSb) {
        const sbLink = el('a', {
          href: safeSb,
          target: '_blank',
          rel: 'noopener',
          style: 'color:var(--acc)',
          textContent: 'Storyblocks \u2197',
        });
        noResult.appendChild(sbLink);
      }
      el2.appendChild(noResult);
      return;
    }
    _pexelsCache[cacheKey] = data.videos;
    _renderPexelsVideos(el2, data.videos, elId);
  };
  const _handlePexelsError = () => {
    const el2 = document.getElementById(elId);
    if (el2) {
      el2.textContent = '';
      el2.appendChild(el('div', { className: 't-xs-t4', textContent: 'Pexels 로딩 실패' }));
    }
  };

  // Electron: Main IPC로 키 노출 방지
  // ★ P0-4: _pexelsPending에 진행 중 요청 등록 → 완료 시 제거
  let pendingPromise;
  if (window.electronAPI && window.electronAPI.pexelsSearch) {
    pendingPromise = window.electronAPI
      .pexelsSearch(query)
      .then((r) => {
        if (r.status >= 400) {
          _handlePexelsError();
          return;
        }
        _handlePexelsResult(r.data);
      })
      .catch(_handlePexelsError);
  } else {
    // ★ P1-fix: Electron 환경인데 IPC 없으면 fail closed (키 노출 차단)
    if (window.electronAPI && window.electronAPI.isElectron) {
      console.error('[Pexels] Electron 환경에서 IPC 미연결 — 앱을 재시작해주세요.');
      _handlePexelsError();
      return;
    }
    // 웹 환경 (개발/테스트 전용)
    pendingPromise = fetch(
      'https://api.pexels.com/videos/search?query=' +
        encodeURIComponent(query) +
        '&per_page=4&size=small',
      {
        headers: { Authorization: _pexelsKeys.pexels },
      }
    )
      .then((r) => {
        return r.json();
      })
      .then(_handlePexelsResult)
      .catch(_handlePexelsError);
  }
  _pexelsPending[cacheKey] = pendingPromise.finally(() => {
    delete _pexelsPending[cacheKey];
  });
}

function _renderPexelsVideos(container, videos, elId) {
  container.textContent = '';

  videos.forEach((v, vi) => {
    const thumb = v.video_pictures && v.video_pictures[0] ? v.video_pictures[0].picture : '';
    const sdFile =
      v.video_files &&
      v.video_files.find((f) => {
        return f.quality === 'sd';
      });
    const hdFile =
      v.video_files &&
      v.video_files.find((f) => {
        return f.quality === 'hd';
      });
    const previewFile = sdFile || hdFile || (v.video_files && v.video_files[0]);
    const dlUrl = previewFile ? previewFile.link : v.url;
    const vidId = elId + '-' + vi;
    const alreadyDL = shared.pexelsDL.some((d) => {
      return d.id === v.id;
    });

    const cardDiv = el('div', {
      id: vidId,
      style:
        'flex-shrink:0;width:160px;border-radius:10px;overflow:hidden;border:1.5px solid ' +
        (alreadyDL ? 'var(--grn)' : 'var(--bdr)') +
        ';transition:all .2s',
    });

    // 썸네일 + 플레이 오버레이
    if (thumb) {
      const safeThumb = safeUrl(thumb, PEXELS_HOSTS);
      const safeVUrl = safeUrl(v.url, PEXELS_HOSTS);
      if (safeThumb && safeVUrl) {
        const link = el('a', {
          href: safeVUrl,
          target: '_blank',
          rel: 'noopener',
          style: 'display:block;position:relative',
        });
        const img = el('img', { style: 'width:160px;height:90px;object-fit:cover;display:block' });
        img.src = safeThumb;
        const overlay = el('div', {
          style:
            'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;background:rgba(0,0,0,.6);border-radius:50%;display:flex;align-items:center;justify-content:center',
        });
        overlay.appendChild(
          el('span', { style: 'color:#fff;font-size:14px;margin-left:2px', textContent: '\u25B6' })
        );
        link.appendChild(img);
        link.appendChild(overlay);
        cardDiv.appendChild(link);
      }
    }

    // 하단 정보
    const infoDiv = el('div', { style: 'padding:8px 10px' });
    infoDiv.appendChild(
      el('div', {
        style:
          'font-size:11px;color:var(--t3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px',
        textContent: '\uD83D\uDCF7 ' + (v.user ? v.user.name : ''),
      })
    );

    const btnRow = el('div', { className: 'fx-wrap-6' });

    // dlUrl 검증
    const safeDlUrl = safeUrl(dlUrl, PEXELS_HOSTS);

    // 미리보기 버튼
    const previewBtn = el('button', {
      className: 'btn bs flex-1 t-2xs',
      style: 'padding:6px 0',
      textContent: '\uD83D\uDC41 미리보기',
    });
    previewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!safeDlUrl) {
        toast('허용되지 않은 미디어 URL입니다.', 'err');
        return;
      }
      _pexelsPreview(safeDlUrl);
    });
    btnRow.appendChild(previewBtn);

    // 다운로드 버튼
    const dlBtn = el('button', {
      id: 'dlbtn-' + vidId,
      className: 'btn ' + (alreadyDL ? 'bp' : 'bs') + ' flex-1 t-2xs',
      style: 'padding:6px 0',
      textContent: alreadyDL ? '\u2713 추가됨' : '\u2B07 다운로드',
    });
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _pexelsAddDL(v.id, safeDlUrl, v.user ? v.user.name : '', vidId);
    });
    btnRow.appendChild(dlBtn);

    infoDiv.appendChild(btnRow);
    cardDiv.appendChild(infoDiv);
    container.appendChild(cardDiv);
  });
}

/* ── Pexels 미리보기 모달 (이미 DOM 기반 — 유지) ── */
function _pexelsPreview(videoUrl) {
  const safe = safeUrl(videoUrl);
  if (!safe) {
    toast('잘못된 미리보기 URL입니다', 'err');
    return;
  }
  const old = document.getElementById('pexelsModal');
  if (old) old.remove();
  const modal = el('div', {
    id: 'pexelsModal',
    style:
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer',
  });
  const wrap = el('div', { style: 'position:relative;max-width:80vw;max-height:80vh' });
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  const video = el('video', {
    style:
      'max-width:80vw;max-height:80vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5)',
  });
  video.src = safe;
  video.controls = true;
  video.autoplay = true;
  const closeBtn = el('button', {
    style:
      'position:absolute;top:-16px;right:-16px;width:36px;height:36px;border-radius:50%;background:var(--bg2);border:1px solid var(--bdr);color:var(--t1);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center',
    textContent: '\u2715',
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.remove();
  });
  wrap.appendChild(video);
  wrap.appendChild(closeBtn);
  modal.appendChild(wrap);
  modal.addEventListener('click', () => {
    modal.remove();
  });
  document.body.appendChild(modal);
}

/* ── Pexels 다운로드 토글 ── */
function _pexelsAddDL(id, url, author, vidId) {
  if (!url) {
    toast('허용되지 않은 다운로드 URL입니다.', 'err');
    return;
  }

  const exists = shared.pexelsDL.some((d) => {
    return d.id === id;
  });
  if (exists) {
    shared.pexelsDL = shared.pexelsDL.filter((d) => {
      return d.id !== id;
    });
    const card = document.getElementById(vidId);
    if (card) card.style.borderColor = 'var(--bdr)';
    const btn = document.getElementById('dlbtn-' + vidId);
    if (btn) {
      btn.className = 'btn bs';
      btn.textContent = '\u2B07 다운로드';
    }
    toast('다운로드 목록에서 제거됨');
  } else {
    shared.pexelsDL.push({ id: id, url: url, author: author });
    const card = document.getElementById(vidId);
    if (card) card.style.borderColor = 'var(--grn)';
    const btn = document.getElementById('dlbtn-' + vidId);
    if (btn) {
      btn.className = 'btn bp';
      btn.textContent = '\u2713 추가됨';
    }
    toast('다운로드 목록에 추가 (' + shared.pexelsDL.length + '개)');
  }
}

/* ── 탭 렌더 → ResultTabs 통일 (P3) ── */
function _buildEkTabs(results, activePage) {
  const extraInfo = results.map((r) => ((r && r.ekw) || []).length + '장면');
  return ResultTabs(results, activePage, _ekGoPage, extraInfo);
}

let _ekPage = 0;

/* ── 전체 렌더 (DOM) ── */
function rAllEK() {
  const results = getResultArray();
  const root = $('p8');
  root.textContent = '';

  if (!results.length) {
    _ekPage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '풋티지 브리프' }));
    root.appendChild(
      el('div', { className: 'cd', textContent: '풋티지 브리프를 표시할 스크립트가 없습니다.' })
    );
    return;
  }
  if (!results.every(isValidResult)) {
    _ekPage = 0;
    root.appendChild(el('h2', { className: 'pt', textContent: '풋티지 브리프' }));
    root.appendChild(
      el('div', {
        className: 'cd',
        textContent: '스크립트 데이터가 손상되었습니다. 이전 단계부터 다시 진행해주세요.',
      })
    );
    return;
  }

  const keys = getApiKeys();
  const hasPexels = !!keys.pexels;
  _pexelsKeys = keys;
  const page = Math.max(0, Math.min(_ekPage, results.length - 1));
  _ekPage = page;
  const r = results[page];
  const typeLabel =
    r.script.type === 'longform' ? '🎬 롱폼' : '📱 숏폼 ' + ((r.script.idx || 0) + 1);
  const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
  const scenes = Array.isArray(r.ekw) ? r.ekw.map(normalizeScene) : [];

  root.appendChild(el('h2', { className: 'pt', textContent: '풋티지 브리프' }));
  root.appendChild(
    el('p', {
      className: 'pd',
      textContent:
        results.length +
        '개 스크립트 · ' +
        (page + 1) +
        '/' +
        results.length +
        ' 페이지' +
        (hasPexels ? ' · 키워드 클릭 시 Pexels 무료 영상 표시' : ''),
    })
  );
  root.appendChild(_buildEkTabs(results, page));

  const pageHeader = el('div', { className: 'fx-row mb-16' });
  pageHeader.appendChild(
    el('span', {
      style:
        'font-size:12px;font-weight:600;color:' +
        typeColor +
        ';background:' +
        typeColor +
        '12;padding:3px 8px;border-radius:4px',
      textContent: typeLabel,
    })
  );
  pageHeader.appendChild(el('span', { className: 't-title', textContent: r.script.title || '' }));
  pageHeader.appendChild(
    el('span', { className: 'bdg bg2 t-3xs ml-auto', textContent: scenes.length + '장면' })
  );
  root.appendChild(pageHeader);

  if (scenes.length)
    scenes.forEach((s, i) => {
      root.appendChild(_buildSceneCard(s, i, page, hasPexels));
    });
  else root.appendChild(el('div', { className: 'cd empty-msg', textContent: '풋티지 없음' }));

  // ── Storyblocks 키워드 모아보기 (전체 한글 번역) ──
  if (scenes.length) {
    const sbSection = el('div', {
      style:
        'margin-top:24px;padding:20px;background:var(--bg);border:1.5px solid var(--bdr);border-radius:var(--r)',
    });
    sbSection.appendChild(
      el('div', {
        style: 'font-size:14px;font-weight:700;color:var(--t1);margin-bottom:4px',
        textContent: '🎬 Storyblocks 영상 소스',
      })
    );
    sbSection.appendChild(
      el('div', {
        style: 'font-size:12px;color:var(--t3);margin-bottom:14px',
        textContent: '키워드를 클릭하면 Storyblocks에서 유료 영상을 검색합니다.',
      })
    );

    const sbGrid = el('div', {
      id: 'sb-grid-' + page,
      style: 'display:flex;flex-direction:column;gap:10px',
    });

    // 모든 영어 키워드 수집
    const allKws = [];
    scenes.forEach((s) => {
      if (s.mainEn) allKws.push(s.mainEn);
      (s.altEn || []).forEach((a) => {
        if (a && a.trim()) allKws.push(a.trim());
      });
    });
    const uniqueKws = [...new Set(allKws)];

    // 기존 ko 필드에서 이미 있는 번역 매핑
    const transMap = {};
    scenes.forEach((s) => {
      if (s.mainEn && s.ko) transMap[s.mainEn.toLowerCase()] = s.ko;
    });

    // 키워드 블록 생성 함수
    function makeKwBlock(enText, koText) {
      const safe = safeUrl(sbUrl(enText), STORYBLOCKS_HOSTS);
      if (!safe) return null;
      const block = el('a', {
        href: safe,
        target: '_blank',
        rel: 'noopener',
        style:
          'text-decoration:none;display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:var(--bg2);border-radius:12px;border:1px solid var(--bdr);transition:border-color .15s',
      });
      block.appendChild(
        el('span', {
          style: 'font-size:12px;font-weight:600;color:var(--acc)',
          textContent: enText,
        })
      );
      if (koText) {
        block.appendChild(
          el('span', { style: 'font-size:12px;color:var(--t2)', textContent: koText })
        );
      }
      block.appendChild(el('span', { style: 'font-size:10px;color:var(--t4)', textContent: '↗' }));
      block.addEventListener('mouseenter', () => {
        block.style.borderColor = 'var(--acc)';
      });
      block.addEventListener('mouseleave', () => {
        block.style.borderColor = 'var(--bdr)';
      });
      return block;
    }

    // 초기 렌더 (이미 있는 번역만 표시, 나머지는 영문만)
    function renderSbRows() {
      sbGrid.textContent = '';
      scenes.forEach((s, i) => {
        if (!s.mainEn) return;
        const color = LABEL_COLORS[s.label] || '#6B7280';
        const row = el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' });
        row.appendChild(
          el('span', {
            style:
              'font-size:11px;font-weight:700;color:' +
              color +
              ';background:' +
              color +
              '15;padding:2px 8px;border-radius:4px;flex-shrink:0;min-width:70px',
            textContent: i + 1 + '. ' + (s.label || ''),
          })
        );

        // 메인 키워드
        const mainKo = transMap[s.mainEn.toLowerCase()] || '';
        const mainBlock = makeKwBlock(s.mainEn, mainKo);
        if (mainBlock) row.appendChild(mainBlock);

        // 대체 키워드
        (s.altEn || []).forEach((alt) => {
          if (!alt || !alt.trim()) return;
          const altKo = transMap[alt.toLowerCase().trim()] || '';
          const altBlock = makeKwBlock(alt, altKo);
          if (altBlock) row.appendChild(altBlock);
        });

        sbGrid.appendChild(row);
      });
    }

    renderSbRows();
    sbSection.appendChild(sbGrid);

    // 번역 안 된 키워드가 있으면 LLM 배치 번역
    const untranslated = uniqueKws.filter((k) => !transMap[k.toLowerCase()]);
    if (untranslated.length > 0) {
      const transNote = el('div', {
        id: 'sb-trans-note-' + page,
        style: 'margin-top:8px;font-size:11px;color:var(--t4)',
        textContent: '⏳ ' + untranslated.length + '개 키워드 번역 중...',
      });
      sbSection.appendChild(transNote);

      // 비동기 번역 호출
      _batchTranslate(untranslated)
        .then((results) => {
          Object.keys(results).forEach((k) => {
            transMap[k.toLowerCase()] = results[k];
          });
          renderSbRows();
          const note = document.getElementById('sb-trans-note-' + page);
          if (note) note.remove();
        })
        .catch(() => {
          const note = document.getElementById('sb-trans-note-' + page);
          if (note) note.textContent = '';
        });
    }

    root.appendChild(sbSection);
  }

  const navRow = el('div', { className: 'nav-footer' });
  if (page > 0) {
    const prevBtn = el('button', { className: 'btn bs', textContent: '← 이전 스크립트' });
    prevBtn.addEventListener('click', () => {
      _ekGoPage(page - 1);
    });
    navRow.appendChild(prevBtn);
  } else navRow.appendChild(el('div'));
  if (page < results.length - 1) {
    const nextBtn = el('button', { className: 'btn bp', textContent: '다음 스크립트 →' });
    nextBtn.addEventListener('click', () => {
      _ekGoPage(page + 1);
    });
    navRow.appendChild(nextBtn);
  } else {
    const goBtn = el('button', {
      className: 'btn bp btn-lg',
      id: 's8b',
      textContent: '음성 생성 →',
    });
    goBtn.addEventListener('click', () => {
      sNext();
    });
    navRow.appendChild(goBtn);
  }
  root.appendChild(navRow);

  if (hasPexels) {
    scenes.forEach((s, i) => {
      if (typeof s.mainEn === 'string' && s.mainEn.trim()) {
        _loadPexelsRow('pexels-' + page + '-' + i, s.mainEn);
      }
    });
  }
}

function _ekGoPage(p) {
  _ekPage = p;
  rAllEK();
}

/* ── window 노출 (외부 호출 최소화) ── */

let _ekJobRunning = false;
let _ekRunId = 0;

async function processAllFootage() {
  if (_ekJobRunning) return;
  _ekJobRunning = true;
  const runId = ++_ekRunId;

  try {
    while (true) {
      if (runId !== _ekRunId) return;

      const results = getResultArray();
      if (!results.length || !results.every(isValidResult)) {
        toast(
          '풋티지 브리프를 만들 스크립트 데이터가 손상되었습니다. 이전 단계로 돌아갑니다.',
          'err'
        );
        sPrev();
        return;
      }
      const idx = results.findIndex((r) => {
        return !r.ekw;
      });
      if (idx === -1) {
        _ekPage = 0;
        rAllEK();
        return;
      }

      const current = results[idx];
      const total = results.length;
      const stepLabels = results.map((r) => {
        const label = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);
        return label + ': ' + r.script.title.substring(0, 20);
      });

      const root = $('p8');
      root.textContent = '';
      const txNotice = el('div', {
        style:
          'margin-bottom:12px;padding:10px 14px;background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.12);border-radius:var(--r);font-size:11px;color:var(--t3);display:flex;align-items:center;gap:8px',
      });
      txNotice.appendChild(el('span', { textContent: '🔒' }));
      txNotice.appendChild(
        el('span', {
          textContent:
            '대본 텍스트가 AI 서비스에 전송되어 장면 키워드를 추출합니다. 이후 키워드가 Pexels에 전송되어 영상을 검색합니다.',
        })
      );
      root.appendChild(txNotice);
      const loadDiv = el('div', { id: 'ekwLoad' });
      root.appendChild(loadDiv);
      const prog = createProgress(
        'ekwLoad',
        '풋티지 브리프 (' + (idx + 1) + '/' + total + ')',
        stepLabels,
        15 * total
      );
      for (let i = 0; i < idx; i++) prog.nextStep();

      try {
        const ekw = await withTimeout(
          (signal) =>
            Api.extractKw(current.script.content, {
              signal: mergeAbortSignals(signal, _ekLeaveAC.signal),
            }),
          300000,
          '풋티지 브리프 생성 시간이 초과되었습니다.'
        );
        if (runId !== _ekRunId) return;

        prog.nextStep();
        const newResults = S.script.results.slice();
        newResults[idx] = Object.assign({}, newResults[idx], { ekw: ekw });
        sSet({ [K.SCRIPT_RESULTS]: newResults });
      } catch (e) {
        if (runId !== _ekRunId) return;

        const newResults = S.script.results.slice();
        newResults[idx] = Object.assign({}, newResults[idx], { ekw: [] });
        sSet({ [K.SCRIPT_RESULTS]: newResults });
        toast(current.script.title + ' 풋티지 생성 실패', 'err');
      } finally {
        prog.destroy();
      }
    }
  } finally {
    if (runId === _ekRunId) _ekJobRunning = false;
  }
}

/* ── 키워드 배치 번역 (LLM 1회 호출) ── */
async function _batchTranslate(keywords) {
  const prompt =
    '다음 영어 키워드를 한국어로 짧게 번역하세요. 각 줄에 "영어=한국어" 형식으로, 설명 없이 번역만 출력하세요.\n\n' +
    keywords.join('\n');
  let text = '';
  try {
    if (window.electronAPI && window.electronAPI.callClaude) {
      const res = await window.electronAPI.callClaude(prompt, null, 500, 'sb-trans-' + Date.now());
      text = typeof res === 'string' ? res : res.text || res.content || '';
    } else if (window.electronAPI && window.electronAPI.callGemini) {
      const res = await window.electronAPI.callGemini(prompt, null, 500, 'sb-trans-' + Date.now());
      text = typeof res === 'string' ? res : res.text || res.content || '';
    }
  } catch (e) {
    return {};
  }
  const map = {};
  text.split('\n').forEach((line) => {
    const sep = line.indexOf('=');
    if (sep > 0) {
      const en = line
        .substring(0, sep)
        .trim()
        .replace(/^\d+[\.\)]\s*/, '');
      const ko = line.substring(sep + 1).trim();
      if (en && ko) map[en.toLowerCase()] = ko;
    }
  });
  return map;
}

// ── Step 8 ──
registerStep(8, () => {
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
  if (results.every((r) => Object.prototype.hasOwnProperty.call(r, 'ekw') && r.ekw !== null)) {
    _ekPage = 0;
    rAllEK();
    return;
  }
  processAllFootage();
});
