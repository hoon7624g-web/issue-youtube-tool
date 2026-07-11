// ═══════════════════════════════════════
// components.js — 재사용 DOM 빌더 컴포넌트
// pipeline 모듈에서 공통 UI 패턴을 추출
// ═══════════════════════════════════════
import { el, esc } from './utils.js';

// ── 카드 컴포넌트 ──
// barColor: 'blue' | 'green' | 'red' | 'acc' → 상단 3px 컬러바 추가
export function Card({ title, subtitle, borderColor, barColor, className, children }) {
  const barCls = barColor ? ' cd-bar-' + barColor : '';
  const card = el('div', { className: 'cd' + barCls + ' ' + (className || '') });
  if (borderColor) card.style.borderColor = borderColor;
  if (title) {
    const header = el('div', { className: 'card-header' });
    header.appendChild(el('div', { className: 'st', textContent: title }));
    if (subtitle)
      header.appendChild(
        el('span', { style: 'font-size:12px;color:var(--t3)', textContent: subtitle })
      );
    card.appendChild(header);
  }
  if (children) {
    if (Array.isArray(children))
      children.forEach((c) => {
        if (c) card.appendChild(c);
      });
    else card.appendChild(children);
  }
  return card;
}

// ── 뱃지 컴포넌트 ──
export function Badge(text, variant) {
  const classMap = {
    longform: 'badge-longform',
    short: 'badge-short',
    factcheck: 'badge-factcheck',
    perplexity: 'badge-perplexity',
    default: 'bdg',
  };
  return el('span', { className: classMap[variant] || classMap.default, textContent: text });
}

// ── 로딩 스피너 ──
export function LoadingSpinner(message) {
  const wrap = el('div', { style: 'text-align:center;padding:40px' });
  wrap.appendChild(
    el('div', {
      className: 'spinner',
      style:
        'width:32px;height:32px;border:3px solid var(--bg3);border-top-color:var(--acc);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px',
    })
  );
  if (message)
    wrap.appendChild(el('div', { style: 'font-size:13px;color:var(--t3)', textContent: message }));
  return wrap;
}

// ── 탭바 컴포넌트 ──
export function TabBar(items, activeId, onSelect) {
  const bar = el('div', {
    style:
      'display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--bdr);padding-bottom:8px',
  });
  items.forEach((item) => {
    const btn = el('button', {
      className: 'btn btn-sm' + (item.id === activeId ? ' bp' : ' btn-o'),
      textContent: item.label,
      style: 'font-size:12px',
    });
    btn.onclick = () => onSelect(item.id);
    bar.appendChild(btn);
  });
  return bar;
}

// ── 통계 박스 ──
export function StatBox({ value, label, color }) {
  const box = el('div', { style: 'text-align:center;padding:12px' });
  box.appendChild(
    el('div', {
      style: 'font-size:20px;font-weight:700;color:' + (color || 'var(--t1)'),
      textContent: value,
    })
  );
  box.appendChild(
    el('div', { style: 'font-size:11px;color:var(--t3);margin-top:4px', textContent: label })
  );
  return box;
}

// ── 복사 버튼 ──
export function CopyButton(getText) {
  const btn = el('button', { className: 'btn btn-o btn-sm', textContent: '복사' });
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(typeof getText === 'function' ? getText() : getText);
      btn.textContent = '✓ 복사됨';
      setTimeout(() => {
        btn.textContent = '복사';
      }, 1500);
    } catch (e) {
      btn.textContent = '실패';
      setTimeout(() => {
        btn.textContent = '복사';
      }, 1500);
    }
  };
  return btn;
}

// ── 프로그레스 바 ──
export function ProgressBar(percent) {
  const bar = el('div', { className: 'progress-bar' });
  const fill = el('div', { className: 'progress-fill' });
  fill.style.width = Math.min(100, Math.max(0, percent)) + '%';
  bar.appendChild(fill);
  return bar;
}

// ── 어코디언 리스트 (hookpoint, reason 등) ──
export function AccentList(items, accentClass) {
  const wrap = el('div');
  (items || []).forEach((text) => {
    const row = el('div', { style: 'display:flex;gap:10px;margin-bottom:10px' });
    row.appendChild(el('div', { className: 'accent-line ' + (accentClass || 'al-acc') }));
    row.appendChild(
      el('div', { style: 'font-size:13px;color:var(--t2);line-height:1.6', textContent: text })
    );
    wrap.appendChild(row);
  });
  return wrap;
}

// ── 결과 탭 (멀티 스크립트 페이지네이션 — 통합) ──
export function ResultTabs(results, activePage, goPage, extraInfo) {
  const wrap = el('div', { className: 'tag-row' });
  (Array.isArray(results) ? results : []).forEach((r, i) => {
    if (!r || !r.script || typeof r.script.type !== 'string') return;
    const typeLabel = r.script.type === 'longform' ? '롱폼' : '숏폼 ' + ((r.script.idx || 0) + 1);
    const typeColor = r.script.type === 'longform' ? '#2563EB' : '#DC2626';
    const active = i === activePage;
    const btn = el('button', {
      className: 'tag tab-item' + (active ? ' on' : ''),
      style: active ? 'border-color:' + typeColor + ';background:' + typeColor + '12' : '',
    });
    btn.appendChild(
      el('span', { style: 'color:' + typeColor + ';font-weight:600', textContent: typeLabel })
    );
    if (extraInfo && extraInfo[i]) {
      btn.appendChild(el('span', { className: 't-2xs-t3', textContent: ' ' + extraInfo[i] }));
    }
    btn.addEventListener('click', () => {
      goPage(i);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

// ── 부분 실패 배너 ──
export function PartialFailureBanner(failedItems, onRetry) {
  if (!failedItems || !failedItems.length) return null;
  const banner = el('div', {
    style:
      'margin-bottom:16px;padding:12px 16px;background:var(--yel-bg);border:1px solid rgba(184,138,0,.2);border-radius:var(--r2);display:flex;align-items:center;gap:10px;flex-wrap:wrap',
  });
  banner.appendChild(el('span', { style: 'font-size:14px', textContent: '\u26A0\uFE0F' }));
  const info = el('div', { style: 'flex:1;min-width:0' });
  info.appendChild(
    el('div', {
      style: 'font-size:13px;font-weight:600;color:var(--yel)',
      textContent: failedItems.length + '개 항목 처리 실패',
    })
  );
  info.appendChild(el('div', { className: 'note-xs', textContent: failedItems.join(', ') }));
  banner.appendChild(info);
  if (onRetry) {
    const retryBtn = el('button', {
      className: 'btn bs',
      style: 'font-size:12px;padding:6px 14px;flex-shrink:0',
      textContent: '실패 항목 재시도',
    });
    retryBtn.addEventListener('click', onRetry);
    banner.appendChild(retryBtn);
  }
  return banner;
}

// ── P2-15: 공통 에러 카드 ──
export function ErrorCard({ title, message, retryFn, backFn, retryText, backText }) {
  const card = el('div', { className: 'cd empty-state' });
  card.appendChild(el('div', { className: 't-err', textContent: title || '오류가 발생했습니다' }));
  if (message) card.appendChild(el('div', { className: 't-sm-desc', textContent: message }));
  const btnRow = el('div', { className: 'retry-center' });
  if (retryFn) {
    const retryBtn = el('button', { className: 'btn bp', textContent: retryText || '다시 시도' });
    retryBtn.addEventListener('click', retryFn);
    btnRow.appendChild(retryBtn);
  }
  if (backFn) {
    const backBtn = el('button', {
      className: 'btn bs',
      textContent: backText || '\u2190 이전 단계',
    });
    backBtn.addEventListener('click', backFn);
    btnRow.appendChild(backBtn);
  }
  card.appendChild(btnRow);
  return card;
}

// ── P2-17: 기기 종속성 안내 배너 ──
export function DeviceNotice() {
  const notice = el('div', {
    style:
      'padding:8px 14px;background:rgba(166,131,7,.05);border:1px solid rgba(166,131,7,.12);border-radius:var(--r);font-size:11px;color:var(--t3);display:flex;align-items:center;gap:8px;line-height:1.5',
  });
  notice.appendChild(
    el('span', { style: 'font-size:13px;flex-shrink:0', textContent: '\uD83D\uDCBB' })
  );
  notice.appendChild(
    el('span', {
      textContent:
        '이 작업 내역은 현재 기기에만 저장됩니다. 다른 PC에서는 이어서 할 수 없습니다. 최종 ZIP은 꼭 별도로 보관하세요.',
    })
  );
  return notice;
}

// ══════════════════════════════════════
// v5.0 NEW COMPONENTS
// ══════════════════════════════════════

// ── 결과 히어로 섹션 ──
export function ResultHero({ title, thumb, stats }) {
  const hero = el('div', { className: 'result-hero' });
  if (thumb) {
    const thumbEl = el('div', {
      style: 'width:120px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;flex-shrink:0',
    });
    const img = el('img', { style: 'width:100%;height:100%;object-fit:cover' });
    img.src = thumb;
    thumbEl.appendChild(img);
    hero.appendChild(thumbEl);
  }
  const info = el('div');
  if (title)
    info.appendChild(
      el('div', {
        style:
          'font-size:18px;font-weight:800;color:var(--t1);margin-bottom:12px;letter-spacing:-.3px;line-height:1.4',
        textContent: title,
      })
    );
  if (stats && stats.length) {
    const statsRow = el('div', { className: 'result-hero-stats' });
    stats.forEach((s) => {
      const stat = el('div', { className: 'result-hero-stat' });
      stat.appendChild(el('div', { className: 'stat-hero', textContent: s.value }));
      stat.appendChild(el('div', { className: 'stat-hero-label', textContent: s.label }));
      statsRow.appendChild(stat);
    });
    info.appendChild(statsRow);
  }
  hero.appendChild(info);
  return hero;
}

// ── 다운로드 CTA 버튼 ──
export function DownloadButton(text, onClick, { icon, size } = {}) {
  const btn = el('button', { className: 'btn btn-download' + (size === 'sm' ? ' btn-sm' : '') });
  if (icon) btn.appendChild(el('span', { textContent: icon, style: 'font-size:16px' }));
  btn.appendChild(document.createTextNode(text));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

// ── 순차 등장 컨테이너 ──
export function StaggerChildren(parent, startIdx = 1) {
  const children = parent.children;
  for (let i = 0; i < children.length && i < 5; i++) {
    children[i].classList.add('stagger-' + (startIdx + i));
  }
  return parent;
}
