// ═══════════════════════════════════════
// pipeline/history.js — 프로젝트 히스토리
// v3.6.0 — XSS 방어: innerHTML/onclick/onmouse* 전면 제거, DOM 기반 전환
// ═══════════════════════════════════════
import { $, toast, safeUrl, el, confirmModal } from '../utils.js';
import { S } from '../state.js';
import { registerAction, runAction } from '../router.js';
import { shared } from '../shared.js';
import { syncSb } from '../ui.js';

const HIST_KEY = 'yt_project_history';
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function setHistory(h) {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(h));
  } catch (e) {
    console.warn('[History] save failed:', e.message);
  }
}

function getSafeResults() {
  return Array.isArray(S.script.results)
    ? S.script.results.filter((r) => r && r.script && typeof r.script.content === 'string')
    : [];
}

function uniqueStrings(items) {
  const seen = new Set();
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const val = typeof item === 'string' ? item.trim() : '';
    if (!val || seen.has(val)) return;
    seen.add(val);
    out.push(val);
  });
  return out;
}

export function saveToHistory() {
  const v = S.video.sv || {};
  const ana = S.analysis.ana || {};
  const results = getSafeResults();
  const first = results[0] || null;
  const scriptTitles = results.map((r) => (r.script && r.script.title) || '').filter(Boolean);
  const keywordPreview = uniqueStrings(
    results.flatMap((r) => {
      return Array.isArray(r.ekw)
        ? r.ekw.map((k) => (k && (k.mainEn || k.v || k.ko)) || '').filter(Boolean)
        : [];
    })
  ).slice(0, 5);

  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    video: {
      title: v.title || '',
      channel: v.ch || '',
      id: v.id || '',
      views: v.views || 0,
      thumb: v.thumb || '',
    },
    script: {
      title: first?.script?.title || (S.script.scr || {}).title || '',
      content: (
        first?.script?.content ||
        S.script.es ||
        (S.script.scr || {}).content ||
        ''
      ).substring(0, 500),
    },
    analysis: {
      summary: ana.summary || '',
      hooks: Array.isArray(ana.hooks) ? ana.hooks : [],
      reasons: Array.isArray(ana.reasons) ? ana.reasons : [],
    },
    keywords: keywordPreview,
    hasVoice:
      results.length > 0
        ? results.some(
            (r) =>
              !!(
                r &&
                r.voiceResult &&
                (r.voiceResult.url ||
                  r.voiceResult.blob ||
                  (Array.isArray(r.voiceResult.parts) && r.voiceResult.parts.length))
              )
          )
        : !!(S.voice.voiceResult && S.voice.voiceResult.blob),
    footageCount: Array.isArray(shared.pexelsDL) ? shared.pexelsDL.length : 0,
    dualScripts: S.script.scrDual
      ? {
          longTitle: (S.script.scrDual.longform || {}).title || '',
          shortsCount: Array.isArray(S.script.scrDual.shorts) ? S.script.scrDual.shorts.length : 0,
        }
      : null,
    resultsCount: results.length,
    scriptTitles,
  };

  let hist = getHistory();
  hist.unshift(entry);
  if (hist.length > 50) hist = hist.slice(0, 50);
  setHistory(hist);
}

function _goBack() {
  const p2 = $('p2');
  if (p2) p2.removeAttribute('data-ok');
  syncSb();
  runAction('showP');
}

function _buildHistCard(h, i) {
  const d = new Date(h.date);
  const dateStr =
    d.getFullYear() +
    '.' +
    (d.getMonth() + 1) +
    '.' +
    d.getDate() +
    ' ' +
    d.getHours() +
    ':' +
    String(d.getMinutes()).padStart(2, '0');
  const tags = [];
  if (h.hasVoice) tags.push('\uD83D\uDD0A 음성');
  if (h.footageCount) tags.push('\uD83C\uDFAC 풋티지 ' + h.footageCount + '개');
  if (h.dualScripts) tags.push('\uD83D\uDCDD 숏폼 ' + h.dualScripts.shortsCount + '개');

  const card = el('div', {
    className: 'cd',
    style: 'margin-bottom:12px;cursor:pointer;transition:all .2s',
  });
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--acc)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'var(--bdr)';
  });

  const row = el('div', { style: 'display:flex;gap:14px;align-items:flex-start' });

  // 썸네일
  if (h.video.thumb) {
    const safeSrc = safeUrl(h.video.thumb);
    if (safeSrc) {
      const img = el('img', {
        style: 'width:120px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0',
      });
      img.src = safeSrc;
      row.appendChild(img);
    }
  } else {
    row.appendChild(
      el('div', {
        style:
          'width:120px;height:68px;background:var(--bg2);border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px;opacity:.3',
        textContent: '\uD83C\uDFAC',
      })
    );
  }

  // 정보
  const info = el('div', { className: 'flex-1-min' });
  info.appendChild(
    el('div', {
      style:
        'font-size:14px;font-weight:700;line-height:1.4;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
      textContent: h.script.title || h.video.title || '프로젝트',
    })
  );
  info.appendChild(
    el('div', {
      style: 'font-size:12px;color:var(--t3);margin-bottom:6px',
      textContent: (h.video.channel || '') + ' · ' + dateStr,
    })
  );
  if (tags.length) {
    const tagRow = el('div', { className: 'chip-row' });
    tags.forEach((t) => {
      tagRow.appendChild(
        el('span', {
          style:
            'font-size:10px;padding:2px 8px;border-radius:4px;background:var(--bg2);color:var(--t2)',
          textContent: t,
        })
      );
    });
    info.appendChild(tagRow);
  }
  row.appendChild(info);

  // 우측: 화살표 + 삭제
  const right = el('div', { style: 'flex-shrink:0;display:flex;gap:6px;align-items:center' });
  const arrow = el('span', {
    id: 'histArrow-' + i,
    style: 'font-size:18px;color:var(--t4);transition:transform .2s',
    textContent: '\u203A',
  });
  right.appendChild(arrow);
  const delBtn = el('button', {
    className: 'btn bg',
    style: 'font-size:11px;padding:4px 8px;color:var(--red)',
    textContent: '삭제',
  });
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmModal('이 프로젝트를 히스토리에서 삭제하시겠습니까?', {
      confirmText: '삭제',
      cancelText: '취소',
      danger: true,
    });
    if (!ok) return;
    const hist = getHistory();
    hist.splice(i, 1);
    setHistory(hist);
    renderHistory();
    toast('삭제됨');
  });
  right.appendChild(delBtn);
  row.appendChild(right);
  card.appendChild(row);

  // 상세 (접이식)
  const detail = el('div', {
    id: 'histDetail-' + i,
    style: 'display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--bdr)',
  });
  detail.appendChild(
    el('div', {
      style: 'font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:12px',
      textContent: h.analysis.summary || '분석 요약 없음',
    })
  );

  if (h.analysis.hooks && h.analysis.hooks.length) {
    const hooksWrap = el('div', { className: 'mb-12' });
    hooksWrap.appendChild(
      el('div', {
        style: 'font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px',
        textContent: '훅 포인트',
      })
    );
    const hookTags = el('div', { className: 'chip-row' });
    h.analysis.hooks.forEach((hk) => {
      hookTags.appendChild(el('span', { className: 'tag t-2xs', textContent: hk }));
    });
    hooksWrap.appendChild(hookTags);
    detail.appendChild(hooksWrap);
  }

  detail.appendChild(
    el('div', {
      style: 'font-size:12px;font-weight:600;color:var(--t3);margin-bottom:6px',
      textContent: '대본 미리보기',
    })
  );
  detail.appendChild(
    el('div', {
      style:
        'font-size:12px;color:var(--t2);line-height:1.6;padding:10px 14px;background:var(--bg);border-radius:var(--r);max-height:150px;overflow-y:auto;white-space:pre-wrap',
      textContent: h.script.content || '대본 없음',
    })
  );

  if (h.video.id) {
    const ytLink = el('a', {
      href: 'https://www.youtube.com/watch?v=' + encodeURIComponent(h.video.id),
      target: '_blank',
      rel: 'noopener',
      style:
        'display:inline-block;margin-top:10px;font-size:12px;color:var(--acc);text-decoration:none',
      textContent: '원본 영상 보기 \u2197',
    });
    detail.appendChild(ytLink);
  }
  card.appendChild(detail);

  // 토글
  card.addEventListener('click', () => {
    const isHidden = detail.style.display === 'none';
    detail.style.display = isHidden ? 'block' : 'none';
    arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
  });

  return card;
}

function renderHistory() {
  const hist = getHistory();
  const p2 = $('p2');
  p2.textContent = '';

  if (!hist.length) {
    p2.appendChild(el('h2', { className: 'pt', textContent: '\uD83D\uDCC2 프로젝트 히스토리' }));
    p2.appendChild(
      el('p', { className: 'pd', textContent: '완료된 프로젝트가 여기에 저장됩니다' })
    );
    const emptyCard = el('div', { className: 'cd', style: 'text-align:center;padding:40px' });
    emptyCard.appendChild(
      el('div', {
        style: 'font-size:48px;margin-bottom:16px;opacity:.3',
        textContent: '\uD83D\uDCC2',
      })
    );
    emptyCard.appendChild(
      el('div', {
        style: 'font-size:15px;font-weight:600;color:var(--t2);margin-bottom:8px',
        textContent: '아직 완료된 프로젝트가 없습니다',
      })
    );
    const guideText = el('div', { className: 't-sm-t3' });
    guideText.appendChild(
      document.createTextNode('프로젝트를 끝까지 진행하고 ZIP 패키지를 다운로드하면')
    );
    guideText.appendChild(el('br'));
    guideText.appendChild(document.createTextNode('자동으로 히스토리에 저장됩니다.'));
    emptyCard.appendChild(guideText);
    p2.appendChild(emptyCard);

    const backBtn = el('button', { className: 'btn bs mt-16', textContent: '\u2190 돌아가기' });
    backBtn.addEventListener('click', _goBack);
    p2.appendChild(backBtn);
    return;
  }

  p2.appendChild(el('h2', { className: 'pt', textContent: '\uD83D\uDCC2 프로젝트 히스토리' }));
  p2.appendChild(
    el('p', {
      className: 'pd',
      textContent: '총 ' + hist.length + '개 프로젝트 · 최근 50개까지 저장됩니다',
    })
  );

  const histNotice = el('div', {
    style:
      'padding:8px 14px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--r);margin-bottom:14px;font-size:11px;color:var(--t3);line-height:1.6',
  });
  histNotice.textContent =
    '💾 히스토리는 최종 패키지(ZIP) 다운로드 시 자동 저장됩니다. 중간 작업은 임시 저장되지만, 히스토리에는 완료 후 반영됩니다. 현재 기기에서만 보관되며, 앱 삭제 또는 브라우저 데이터 초기화 시 사라질 수 있습니다.';
  p2.appendChild(histNotice);

  const ctrlRow = el('div', { style: 'display:flex;gap:8px;margin-bottom:16px' });
  const backBtn = el('button', { className: 'btn bs', textContent: '\u2190 돌아가기' });
  backBtn.addEventListener('click', _goBack);
  ctrlRow.appendChild(backBtn);

  const clearBtn = el('button', {
    className: 'btn bs',
    style: 'color:var(--red);margin-left:auto',
    textContent: '전체 삭제',
  });
  clearBtn.addEventListener('click', async () => {
    const ok = await confirmModal(
      '전체 히스토리를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.',
      { confirmText: '전체 삭제', cancelText: '취소', danger: true }
    );
    if (ok) {
      localStorage.removeItem(HIST_KEY);
      renderHistory();
    }
  });
  ctrlRow.appendChild(clearBtn);
  p2.appendChild(ctrlRow);

  const list = el('div', { id: 'histList' });
  hist.forEach((h, i) => {
    list.appendChild(_buildHistCard(h, i));
  });
  p2.appendChild(list);
}

registerAction('openHistory', () => {
  document.querySelectorAll('.pnl').forEach((p) => {
    p.classList.remove('on');
  });
  const p2 = $('p2');
  if (!p2) return;
  p2.classList.add('on');
  renderHistory();
});
