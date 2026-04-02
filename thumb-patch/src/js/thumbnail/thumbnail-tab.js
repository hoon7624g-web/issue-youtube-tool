// ═══════════════════════════════════════════════════════════
// src/js/thumbnail/thumbnail-tab.js — 썸네일 생성기 독립 탭
// ★ v4.1: 숏폼 바 커스텀 (barColor/barHeight/logo/cta)
//
// 사용법: import { mountThumbnailTab } from './thumbnail/thumbnail-tab.js';
//         mountThumbnailTab(containerElement);
// ═══════════════════════════════════════════════════════════
import { $, el, toast } from '../utils.js';

// ── 프리셋 정의 ──
const STYLE_PRESETS = [
  { id: 'bold',    label: 'Bold',    desc: '강렬한 텍스트 + 밑줄 강조' },
  { id: 'news',    label: 'News',    desc: '뉴스/이슈 스타일 하단 배너' },
  { id: 'minimal', label: 'Minimal', desc: '깔끔한 하단 배치' },
];

const COLOR_VARIANTS = [
  { id: 'orange',  color: '#FF6B35', label: '오렌지' },
  { id: 'red',     color: '#E53935', label: '레드' },
  { id: 'blue',    color: '#1E88E5', label: '블루' },
  { id: 'green',   color: '#43A047', label: '그린' },
  { id: 'purple',  color: '#8E24AA', label: '퍼플' },
  { id: 'yellow',  color: '#FFB300', label: '옐로우' },
];

// ── 상태 ──
let _state = {};
function resetState() {
  _state = {
    title: '', channelName: '',
    backgroundUrl: null, backgroundLocalPath: null, backgroundPreview: null,
    mode: 'longform',
    // 숏폼 바 커스텀
    barColor: '#000000',
    barHeightPercent: 25,
    logoLocalPath: null, logoPreview: null, logoFileName: null,
    ctaText: '',
    // 프리뷰
    previews: [], selectedIndex: -1, isRendering: false,
    pexelsResults: [], pexelsQuery: '',
  };
}

// ── CSS 주입 ──
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.thumb-tab { padding: 32px 28px 48px; max-width: 1200px; }
.thumb-tab h2 { margin: 0 0 6px; font-size: 22px; font-weight: 800; color: var(--t1); }
.thumb-tab .sub { font-size: 13px; color: var(--t3); margin: 0 0 28px; }
.thumb-section { margin-bottom: 24px; }
.thumb-section-title {
  font-size: 13px; font-weight: 700; color: var(--t2);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin: 0 0 10px; display: flex; align-items: center; gap: 8px;
}
.thumb-section-title .icon { font-size: 15px; }
.thumb-input {
  width: 100%; padding: 12px 16px; font-size: 15px; font-weight: 600;
  border: 1.5px solid var(--bdr); border-radius: var(--r);
  background: var(--bg); color: var(--t1); transition: border-color .15s;
  box-sizing: border-box; font-family: inherit;
}
.thumb-input:focus { outline: none; border-color: var(--accent, #FF6B35); }
.thumb-input::placeholder { color: var(--t4, #999); font-weight: 400; }
.thumb-input-sm { font-size: 13px; padding: 8px 12px; }
.thumb-mode-toggle {
  display: inline-flex; border: 1.5px solid var(--bdr); border-radius: var(--r);
  overflow: hidden; background: var(--bg);
}
.thumb-mode-btn {
  padding: 8px 20px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: none; background: transparent; color: var(--t3); transition: all .15s;
  font-family: inherit;
}
.thumb-mode-btn.active { background: var(--accent, #FF6B35); color: #fff; }
.thumb-bg-area { display: flex; gap: 12px; flex-wrap: wrap; }
.thumb-bg-card {
  flex: 1; min-width: 160px; padding: 16px; border: 1.5px solid var(--bdr);
  border-radius: var(--r); background: var(--bg); cursor: pointer;
  transition: border-color .15s, box-shadow .15s; text-align: center;
}
.thumb-bg-card:hover { border-color: var(--accent, #FF6B35); box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.thumb-bg-card .icon { font-size: 28px; margin-bottom: 6px; }
.thumb-bg-card .label { font-size: 13px; font-weight: 600; color: var(--t2); }
.thumb-bg-card .desc { font-size: 11px; color: var(--t3); margin-top: 2px; }
.thumb-bg-preview {
  margin-top: 12px; position: relative; border-radius: var(--r);
  overflow: hidden; border: 1.5px solid var(--bdr); max-height: 200px;
}
.thumb-bg-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-bg-preview .remove-btn {
  position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
  border-radius: 50%; background: rgba(0,0,0,.6); color: #fff;
  border: none; cursor: pointer; font-size: 14px; display: flex;
  align-items: center; justify-content: center;
}
.thumb-bg-preview .remove-btn:hover { background: rgba(200,30,30,.8); }
.thumb-pexels-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.thumb-pexels-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px; max-height: 260px; overflow-y: auto; padding: 2px;
}
.thumb-pexels-item {
  border-radius: 6px; overflow: hidden; cursor: pointer; position: relative;
  border: 2px solid transparent; transition: border-color .15s; aspect-ratio: 16/9;
}
.thumb-pexels-item:hover { border-color: var(--accent, #FF6B35); }
.thumb-pexels-item.selected { border-color: var(--accent, #FF6B35); box-shadow: 0 0 0 2px var(--accent, #FF6B35); }
.thumb-pexels-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-preview-grid { display: grid; gap: 16px; margin-top: 16px; }
.thumb-preview-grid.longform { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.thumb-preview-grid.shorts { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.thumb-preview-card {
  border-radius: var(--r); overflow: hidden; cursor: pointer;
  border: 2.5px solid var(--bdr); transition: all .2s; position: relative;
  background: var(--bg);
}
.thumb-preview-card:hover { border-color: var(--accent, #FF6B35); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.1); }
.thumb-preview-card.selected { border-color: var(--accent, #FF6B35); box-shadow: 0 0 0 3px rgba(255,107,53,.25); }
.thumb-preview-card img { width: 100%; display: block; }
.thumb-preview-card .meta {
  padding: 10px 12px; display: flex; justify-content: space-between;
  align-items: center; font-size: 12px; color: var(--t3);
}
.thumb-preview-card .meta .style-name { font-weight: 700; color: var(--t2); }
.thumb-preview-card .meta .color-dot {
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
  border: 1.5px solid rgba(0,0,0,.1);
}
.thumb-preview-card .check-badge {
  position: absolute; top: 10px; right: 10px; width: 28px; height: 28px;
  border-radius: 50%; background: var(--accent, #FF6B35); color: #fff;
  display: none; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,.2);
}
.thumb-preview-card.selected .check-badge { display: flex; }
.thumb-loading { text-align: center; padding: 48px 20px; }
.thumb-loading .spinner {
  width: 40px; height: 40px; border: 3px solid var(--bdr);
  border-top-color: var(--accent, #FF6B35); border-radius: 50%;
  animation: thumb-spin .7s linear infinite; margin: 0 auto 16px;
}
@keyframes thumb-spin { to { transform: rotate(360deg); } }
.thumb-loading .msg { font-size: 14px; color: var(--t3); }
.thumb-loading .pct { font-size: 20px; font-weight: 700; color: var(--t1); margin-top: 6px; }
.thumb-actions { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; align-items: center; }
.thumb-actions .btn-primary {
  padding: 12px 28px; font-size: 14px; font-weight: 700;
  background: var(--accent, #FF6B35); color: #fff; border: none;
  border-radius: var(--r); cursor: pointer; transition: opacity .15s; font-family: inherit;
}
.thumb-actions .btn-primary:hover { opacity: .9; }
.thumb-actions .btn-primary:disabled { opacity: .4; cursor: default; }
.thumb-actions .btn-secondary {
  padding: 12px 28px; font-size: 14px; font-weight: 600;
  background: var(--bg); color: var(--t2); border: 1.5px solid var(--bdr);
  border-radius: var(--r); cursor: pointer; font-family: inherit;
}
.thumb-actions .btn-secondary:hover { border-color: var(--t3); }
.thumb-empty { text-align: center; padding: 60px 20px; color: var(--t3); }
.thumb-empty .icon { font-size: 48px; margin-bottom: 12px; opacity: .5; }
.thumb-empty .msg { font-size: 14px; }

/* ── 숏폼 바 커스텀 영역 ── */
.thumb-shorts-opts {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  padding: 20px; background: var(--bg); border: 1.5px solid var(--bdr);
  border-radius: var(--r); margin-top: 12px;
}
.thumb-shorts-opts .opt-group { display: flex; flex-direction: column; gap: 6px; }
.thumb-shorts-opts .opt-label {
  font-size: 12px; font-weight: 700; color: var(--t2);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.thumb-shorts-opts .opt-row { display: flex; align-items: center; gap: 10px; }
.thumb-shorts-opts .opt-value {
  font-size: 13px; color: var(--t3); min-width: 40px; text-align: right;
}
.thumb-color-picker {
  width: 44px; height: 34px; border: 1.5px solid var(--bdr);
  border-radius: 6px; cursor: pointer; padding: 2px; background: var(--bg);
}
.thumb-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
.thumb-color-picker::-webkit-color-swatch { border: none; border-radius: 4px; }
.thumb-slider {
  flex: 1; height: 6px; -webkit-appearance: none; background: var(--bdr);
  border-radius: 3px; outline: none;
}
.thumb-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: var(--accent, #FF6B35); cursor: pointer; border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,.2);
}
.thumb-logo-upload {
  display: flex; align-items: center; gap: 10px; padding: 8px 14px;
  border: 1.5px dashed var(--bdr); border-radius: var(--r); cursor: pointer;
  transition: border-color .15s; background: transparent;
  font-family: inherit; color: var(--t2); font-size: 13px;
}
.thumb-logo-upload:hover { border-color: var(--accent, #FF6B35); }
.thumb-logo-preview {
  width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
  border: 1.5px solid var(--bdr);
}
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════
// 메인 마운트
// ═══════════════════════════════════════════════════════════
export function mountThumbnailTab(container) {
  if (!container) return;
  injectCSS();
  resetState();
  container.textContent = '';

  const root = el('div', { className: 'thumb-tab' });
  container.appendChild(root);

  root.appendChild(el('h2', { textContent: '썸네일 생성기' }));
  root.appendChild(el('p', { className: 'sub', textContent: '제목과 배경을 설정하고, 스타일 × 색상 변형을 한 번에 미리보세요.' }));

  // ── 1) 모드 토글 ──
  const modeSection = el('div', { className: 'thumb-section' });
  modeSection.appendChild(makeSectionTitle('📐', '형식'));
  const modeToggle = el('div', { className: 'thumb-mode-toggle' });
  const btnLong = el('button', { className: 'thumb-mode-btn active', textContent: '롱폼 (1280×720)' });
  const btnShort = el('button', { className: 'thumb-mode-btn', textContent: '숏폼 (1080×1920)' });
  btnLong.addEventListener('click', () => { _state.mode = 'longform'; btnLong.classList.add('active'); btnShort.classList.remove('active'); toggleShortsOpts(root, false); clearPreviews(); });
  btnShort.addEventListener('click', () => { _state.mode = 'shorts'; btnShort.classList.add('active'); btnLong.classList.remove('active'); toggleShortsOpts(root, true); clearPreviews(); });
  modeToggle.appendChild(btnLong);
  modeToggle.appendChild(btnShort);
  modeSection.appendChild(modeToggle);
  root.appendChild(modeSection);

  // ── 2) 제목 입력 ──
  const titleSection = el('div', { className: 'thumb-section' });
  titleSection.appendChild(makeSectionTitle('✏️', '제목'));
  const titleInput = el('input', { className: 'thumb-input', type: 'text', placeholder: '썸네일에 표시할 제목 (자동 줄바꿈)', maxLength: 80 });
  titleInput.addEventListener('input', (e) => { _state.title = e.target.value; clearPreviews(); });
  titleSection.appendChild(titleInput);
  const channelInput = el('input', { className: 'thumb-input thumb-input-sm', type: 'text', placeholder: '채널명 (선택사항)', maxLength: 30, style: 'margin-top:8px' });
  channelInput.addEventListener('input', (e) => { _state.channelName = e.target.value; });
  titleSection.appendChild(channelInput);
  root.appendChild(titleSection);

  // ── 3) 배경 이미지 ──
  const bgSection = el('div', { className: 'thumb-section' });
  bgSection.appendChild(makeSectionTitle('🖼️', '배경 이미지'));
  const bgArea = el('div', { className: 'thumb-bg-area' });

  const pexelsCard = makeBgCard('🔍', 'Pexels 검색', '고품질 무료 이미지');
  pexelsCard.addEventListener('click', () => showPexelsSearch(bgSection));
  bgArea.appendChild(pexelsCard);

  const localCard = makeBgCard('📁', '로컬 업로드', '내 컴퓨터 이미지');
  localCard.addEventListener('click', async () => {
    if (!window.electronAPI?.remotionSelectLocalImage) return;
    const res = await window.electronAPI.remotionSelectLocalImage();
    if (!res || !res.ok) return;
    _state.backgroundLocalPath = res.filePath;
    _state.backgroundUrl = null;
    _state.backgroundPreview = res.dataUrl;
    renderBgPreview(bgSection); clearPreviews();
  });
  bgArea.appendChild(localCard);

  const noneCard = makeBgCard('🎨', '배경 없음', '그라디언트 사용');
  noneCard.addEventListener('click', () => {
    _state.backgroundUrl = null; _state.backgroundLocalPath = null; _state.backgroundPreview = null;
    renderBgPreview(bgSection); clearPreviews(); toast('그라디언트 배경을 사용합니다.');
  });
  bgArea.appendChild(noneCard);
  bgSection.appendChild(bgArea);
  bgSection.appendChild(el('div', { id: 'thumb-bg-preview-slot' }));
  bgSection.appendChild(el('div', { id: 'thumb-pexels-slot', style: 'display:none' }));
  root.appendChild(bgSection);

  // ── 4) 숏폼 바 커스텀 (초기 숨김) ──
  const shortsOptsSection = el('div', { className: 'thumb-section', id: 'thumb-shorts-section', style: 'display:none' });
  shortsOptsSection.appendChild(makeSectionTitle('📱', '숏폼 바 설정'));
  const shortsOpts = el('div', { className: 'thumb-shorts-opts' });

  // 바 색상
  const colorGroup = el('div', { className: 'opt-group' });
  colorGroup.appendChild(el('div', { className: 'opt-label', textContent: '바 색상' }));
  const colorRow = el('div', { className: 'opt-row' });
  const colorPicker = el('input', { type: 'color', className: 'thumb-color-picker', value: '#000000' });
  colorPicker.addEventListener('input', (e) => { _state.barColor = e.target.value; clearPreviews(); });
  colorRow.appendChild(colorPicker);
  const colorPresets = ['#000000', '#1a1a2e', '#FFFFFF', '#1E88E5'];
  colorPresets.forEach(c => {
    const dot = el('div', {
      style: `width:28px;height:28px;border-radius:6px;cursor:pointer;border:1.5px solid var(--bdr);background:${c};flex-shrink:0`,
    });
    dot.addEventListener('click', () => { colorPicker.value = c; _state.barColor = c; clearPreviews(); });
    colorRow.appendChild(dot);
  });
  colorGroup.appendChild(colorRow);
  shortsOpts.appendChild(colorGroup);

  // 바 높이
  const heightGroup = el('div', { className: 'opt-group' });
  heightGroup.appendChild(el('div', { className: 'opt-label', textContent: '바 높이 비율' }));
  const heightRow = el('div', { className: 'opt-row' });
  const heightSlider = el('input', { type: 'range', className: 'thumb-slider', min: '15', max: '35', value: '25', step: '1' });
  const heightVal = el('span', { className: 'opt-value', textContent: '25%' });
  heightSlider.addEventListener('input', (e) => {
    _state.barHeightPercent = parseInt(e.target.value);
    heightVal.textContent = e.target.value + '%';
    clearPreviews();
  });
  heightRow.appendChild(heightSlider);
  heightRow.appendChild(heightVal);
  heightGroup.appendChild(heightRow);
  shortsOpts.appendChild(heightGroup);

  // 로고 업로드
  const logoGroup = el('div', { className: 'opt-group' });
  logoGroup.appendChild(el('div', { className: 'opt-label', textContent: '채널 로고' }));
  const logoBtn = el('button', { className: 'thumb-logo-upload', id: 'thumb-logo-btn' });
  logoBtn.textContent = '📎 로고 이미지 선택';
  logoBtn.addEventListener('click', async () => {
    if (!window.electronAPI?.remotionSelectLogoImage) return;
    const res = await window.electronAPI.remotionSelectLogoImage();
    if (!res || !res.ok) return;
    _state.logoLocalPath = res.filePath;
    _state.logoPreview = res.dataUrl;
    _state.logoFileName = res.fileName;
    renderLogoPreview(); clearPreviews();
  });
  logoGroup.appendChild(logoBtn);
  shortsOpts.appendChild(logoGroup);

  // CTA 텍스트
  const ctaGroup = el('div', { className: 'opt-group' });
  ctaGroup.appendChild(el('div', { className: 'opt-label', textContent: 'CTA 버튼' }));
  const ctaInput = el('input', { className: 'thumb-input thumb-input-sm', type: 'text', placeholder: '구독하기, 더보기 등 (비우면 숨김)', maxLength: 20 });
  ctaInput.addEventListener('input', (e) => { _state.ctaText = e.target.value; });
  ctaGroup.appendChild(ctaInput);
  shortsOpts.appendChild(ctaGroup);

  shortsOptsSection.appendChild(shortsOpts);
  root.appendChild(shortsOptsSection);

  // ── 5) 생성 버튼 ──
  const genSection = el('div', { className: 'thumb-section' });
  const genBtn = el('button', { className: 'thumb-actions btn-primary', style: 'width:100%;padding:14px;font-size:15px;border-radius:var(--r);text-align:center' });
  genBtn.textContent = '🎨 프리뷰 생성 (3 스타일 × 6 색상)';
  genBtn.addEventListener('click', () => generatePreviews(root));
  genSection.appendChild(genBtn);
  root.appendChild(genSection);

  // ── 6) 프리뷰 그리드 ──
  root.appendChild(el('div', { id: 'thumb-preview-slot' }));

  checkRemotionAvailability(genBtn);
}

// ═══════════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════════
function makeSectionTitle(icon, text) {
  const t = el('div', { className: 'thumb-section-title' });
  t.appendChild(el('span', { className: 'icon', textContent: icon }));
  t.appendChild(el('span', { textContent: text }));
  return t;
}
function makeBgCard(icon, label, desc) {
  const card = el('div', { className: 'thumb-bg-card' });
  card.appendChild(el('div', { className: 'icon', textContent: icon }));
  card.appendChild(el('div', { className: 'label', textContent: label }));
  card.appendChild(el('div', { className: 'desc', textContent: desc }));
  return card;
}
function toggleShortsOpts(root, show) {
  const sec = root.querySelector('#thumb-shorts-section');
  if (sec) sec.style.display = show ? 'block' : 'none';
}
function renderBgPreview(bgSection) {
  const slot = bgSection.querySelector('#thumb-bg-preview-slot');
  if (!slot) return;
  slot.textContent = '';
  if (!_state.backgroundPreview) return;
  const wrap = el('div', { className: 'thumb-bg-preview' });
  const img = el('img'); img.src = _state.backgroundPreview; img.alt = '배경';
  wrap.appendChild(img);
  const removeBtn = el('button', { className: 'remove-btn', textContent: '✕' });
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _state.backgroundUrl = null; _state.backgroundLocalPath = null; _state.backgroundPreview = null;
    slot.textContent = ''; clearPreviews();
  });
  wrap.appendChild(removeBtn);
  slot.appendChild(wrap);
}
function renderLogoPreview() {
  const btn = document.getElementById('thumb-logo-btn');
  if (!btn) return;
  btn.textContent = '';
  if (_state.logoPreview) {
    const img = el('img', { className: 'thumb-logo-preview' });
    img.src = _state.logoPreview;
    btn.appendChild(img);
    btn.appendChild(el('span', { textContent: _state.logoFileName || '로고 선택됨' }));
    const removeIcon = el('span', { textContent: '✕', style: 'margin-left:auto;font-size:14px;color:var(--t3);cursor:pointer' });
    removeIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      _state.logoLocalPath = null; _state.logoPreview = null; _state.logoFileName = null;
      renderLogoPreview(); clearPreviews();
    });
    btn.appendChild(removeIcon);
  } else {
    btn.textContent = '📎 로고 이미지 선택';
  }
}
function clearPreviews() {
  _state.previews = []; _state.selectedIndex = -1;
  const slot = document.getElementById('thumb-preview-slot');
  if (slot) slot.textContent = '';
}
async function checkRemotionAvailability(btn) {
  if (!window.electronAPI?.remotionCheck) {
    btn.disabled = true; btn.textContent = 'Electron 환경에서만 사용 가능'; btn.style.opacity = '.4'; return;
  }
  try {
    const res = await window.electronAPI.remotionCheck();
    if (!res.available) { btn.disabled = true; btn.textContent = 'Remotion 미설치 — remotion 폴더에서 npm install 필요'; btn.style.opacity = '.4'; }
  } catch (e) { btn.disabled = true; btn.textContent = 'Remotion 확인 실패'; btn.style.opacity = '.4'; }
}

// ── Pexels 검색 ──
function showPexelsSearch(bgSection) {
  const slot = bgSection.querySelector('#thumb-pexels-slot');
  if (!slot) return;
  if (slot.style.display !== 'none') { slot.style.display = 'none'; return; }
  slot.style.display = 'block'; slot.textContent = '';
  const bar = el('div', { className: 'thumb-pexels-bar' });
  const searchInput = el('input', { className: 'thumb-input thumb-input-sm', type: 'text', placeholder: '배경 이미지 검색 (영문 권장)', style: 'flex:1' });
  searchInput.value = _state.pexelsQuery;
  const searchBtn = el('button', { className: 'btn bp', style: 'white-space:nowrap;padding:8px 16px;font-size:13px', textContent: '검색' });
  async function doSearch() {
    const q = searchInput.value.trim();
    if (!q) { toast('검색어를 입력하세요.'); return; }
    if (!window.electronAPI?.pexelsSearch) { toast('Pexels API가 설정되지 않았습니다.', 'err'); return; }
    _state.pexelsQuery = q; searchBtn.disabled = true; searchBtn.textContent = '검색 중...';
    try {
      const res = await window.electronAPI.pexelsSearch(q);
      _state.pexelsResults = (res && Array.isArray(res.photos)) ? res.photos : [];
      renderPexelsGrid(slot);
    } catch (e) { toast('Pexels 검색 실패', 'err'); }
    finally { searchBtn.disabled = false; searchBtn.textContent = '검색'; }
  }
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  bar.appendChild(searchInput); bar.appendChild(searchBtn); slot.appendChild(bar);
  if (_state.pexelsResults.length) renderPexelsGrid(slot);
}
function renderPexelsGrid(slot) {
  let grid = slot.querySelector('.thumb-pexels-grid');
  if (grid) grid.remove();
  if (!_state.pexelsResults.length) {
    slot.appendChild(el('div', { style: 'font-size:13px;color:var(--t3);padding:12px 0', textContent: '검색 결과가 없습니다.' }));
    return;
  }
  grid = el('div', { className: 'thumb-pexels-grid' });
  _state.pexelsResults.forEach((photo) => {
    const item = el('div', { className: 'thumb-pexels-item' });
    const img = el('img');
    const thumbUrl = (photo.src && (photo.src.medium || photo.src.small)) || '';
    const fullUrl = (photo.src && (photo.src.large2x || photo.src.large || photo.src.original)) || '';
    img.src = thumbUrl; img.alt = photo.alt || ''; img.loading = 'lazy';
    item.appendChild(img);
    if (_state.backgroundUrl === fullUrl) item.classList.add('selected');
    item.addEventListener('click', () => {
      _state.backgroundUrl = fullUrl; _state.backgroundLocalPath = null; _state.backgroundPreview = thumbUrl;
      grid.querySelectorAll('.thumb-pexels-item').forEach(x => x.classList.remove('selected'));
      item.classList.add('selected');
      renderBgPreview(slot.closest('.thumb-section')); clearPreviews();
    });
    grid.appendChild(item);
  });
  slot.appendChild(grid);
}

// ═══════════════════════════════════════════════════════════
// 프리뷰 생성
// ═══════════════════════════════════════════════════════════
async function generatePreviews(root) {
  if (_state.isRendering) return;
  if (!_state.title.trim()) { toast('제목을 먼저 입력하세요.'); return; }

  _state.isRendering = true; _state.previews = []; _state.selectedIndex = -1;
  const slot = document.getElementById('thumb-preview-slot');
  if (!slot) return;
  slot.textContent = '';

  const loading = el('div', { className: 'thumb-loading' });
  loading.appendChild(el('div', { className: 'spinner' }));
  const loadMsg = el('div', { className: 'msg', textContent: '썸네일 프리뷰 생성 중...' });
  loading.appendChild(loadMsg);
  const loadPct = el('div', { className: 'pct', textContent: '0%' });
  loading.appendChild(loadPct);
  slot.appendChild(loading);

  let unsub = null;
  if (window.electronAPI?.onRemotionProgress) {
    unsub = window.electronAPI.onRemotionProgress((d) => {
      loadMsg.textContent = d.msg || ''; loadPct.textContent = (d.pct || 0) + '%';
    });
  }

  const compositionId = _state.mode === 'shorts' ? 'ShortsThumbnail' : 'LongformThumbnail';
  const variants = [];
  STYLE_PRESETS.forEach((preset) => {
    COLOR_VARIANTS.forEach((cv) => {
      variants.push({
        style: preset.id, accentColor: cv.color, compositionId,
        showTopBar: true, showBottomBar: true,
        label: preset.label + ' · ' + cv.label,
      });
    });
  });

  try {
    const res = await window.electronAPI.remotionThumbnailBatch({
      title: _state.title.trim(),
      backgroundUrl: _state.backgroundUrl,
      backgroundLocalPath: _state.backgroundLocalPath,
      logoLocalPath: _state.logoLocalPath,
      channelName: _state.channelName.trim(),
      barColor: _state.barColor,
      barHeightPercent: _state.barHeightPercent,
      ctaText: _state.ctaText.trim(),
      variants,
    });
    if (!res || !res.ok) throw new Error(res?.error || '배치 렌더링 실패');
    _state.previews = res.results || [];
    renderPreviewGrid(slot);
  } catch (e) {
    slot.textContent = '';
    const err = el('div', { className: 'thumb-empty' });
    err.appendChild(el('div', { className: 'icon', textContent: '⚠️' }));
    err.appendChild(el('div', { className: 'msg', textContent: '프리뷰 생성 실패: ' + (e.message || e) }));
    slot.appendChild(err);
  } finally {
    _state.isRendering = false;
    if (unsub) unsub();
  }
}

// ═══════════════════════════════════════════════════════════
// 프리뷰 그리드
// ═══════════════════════════════════════════════════════════
function renderPreviewGrid(slot) {
  slot.textContent = '';
  const okPreviews = _state.previews.filter(p => p.ok);
  if (!okPreviews.length) {
    const empty = el('div', { className: 'thumb-empty' });
    empty.appendChild(el('div', { className: 'icon', textContent: '🖼️' }));
    empty.appendChild(el('div', { className: 'msg', textContent: '생성된 프리뷰가 없습니다.' }));
    slot.appendChild(empty); return;
  }
  slot.appendChild(el('div', { style: 'font-size:13px;color:var(--t3);margin-bottom:8px', textContent: okPreviews.length + '개 썸네일 — 클릭 선택 후 저장' }));

  const grid = el('div', { className: 'thumb-preview-grid ' + (_state.mode === 'shorts' ? 'shorts' : 'longform') });
  okPreviews.forEach((preview) => {
    const card = el('div', { className: 'thumb-preview-card' });
    card.dataset.index = String(preview.index);
    if (_state.selectedIndex === preview.index) card.classList.add('selected');
    const img = el('img'); img.src = preview.dataUrl; img.alt = preview.label;
    card.appendChild(img);
    card.appendChild(el('div', { className: 'check-badge', textContent: '✓' }));
    const meta = el('div', { className: 'meta' });
    meta.appendChild(el('span', { className: 'style-name', textContent: preview.label }));
    const dot = el('div', { className: 'color-dot' }); dot.style.background = preview.accentColor;
    meta.appendChild(dot); card.appendChild(meta);
    card.addEventListener('click', () => {
      _state.selectedIndex = preview.index;
      grid.querySelectorAll('.thumb-preview-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected'); updateActionButtons();
    });
    grid.appendChild(card);
  });
  slot.appendChild(grid);

  const actions = el('div', { className: 'thumb-actions', id: 'thumb-action-bar' });
  const saveBtn = el('button', { className: 'btn-primary', id: 'thumb-save-btn', textContent: '💾 선택한 썸네일 PNG 저장' });
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', () => saveSelectedThumbnail());
  actions.appendChild(saveBtn);
  const regenBtn = el('button', { className: 'btn-secondary', textContent: '🔄 다시 생성' });
  regenBtn.addEventListener('click', () => { const r = slot.closest('.thumb-tab'); if (r) generatePreviews(r); });
  actions.appendChild(regenBtn);
  slot.appendChild(actions);
}
function updateActionButtons() {
  const btn = document.getElementById('thumb-save-btn');
  if (btn) btn.disabled = (_state.selectedIndex < 0);
}

// ═══════════════════════════════════════════════════════════
// 고화질 저장
// ═══════════════════════════════════════════════════════════
async function saveSelectedThumbnail() {
  if (_state.selectedIndex < 0) { toast('썸네일을 선택하세요.'); return; }
  const preview = _state.previews.find(p => p.index === _state.selectedIndex);
  if (!preview) { toast('프리뷰를 찾을 수 없습니다.', 'err'); return; }

  const saveBtn = document.getElementById('thumb-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ 고화질 렌더링 중...'; }

  let unsub = null;
  if (window.electronAPI?.onRemotionProgress) {
    unsub = window.electronAPI.onRemotionProgress((d) => {
      if (saveBtn) saveBtn.textContent = '⏳ ' + (d.msg || '렌더링 중...');
    });
  }

  try {
    const res = await window.electronAPI.remotionThumbnailSaveHQ({
      title: _state.title.trim(),
      backgroundUrl: _state.backgroundUrl,
      backgroundLocalPath: _state.backgroundLocalPath,
      logoLocalPath: _state.logoLocalPath,
      accentColor: preview.accentColor,
      channelName: _state.channelName.trim(),
      style: preview.style,
      compositionId: preview.compositionId,
      barColor: _state.barColor,
      barHeightPercent: _state.barHeightPercent,
      ctaText: _state.ctaText.trim(),
      showTopBar: true,
      showBottomBar: true,
    });
    if (res && res.ok) toast('썸네일 저장 완료!');
    else if (res && !res.canceled) throw new Error(res?.error || '저장 실패');
  } catch (e) {
    toast('저장 실패: ' + (e.message || e), 'err');
  } finally {
    if (unsub) unsub();
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 선택한 썸네일 PNG 저장'; }
    updateActionButtons();
  }
}
