// ═══════════════════════════════════════════════════════════
// src/js/thumbnail/thumbnail-tab.js — 썸네일 생성기
// ★ v4.3: AI 문구 생성 + 롱폼 썸네일 프리뷰/저장
// ═══════════════════════════════════════════════════════════
import { $, el, toast } from '../utils.js';
import { S } from '../state.js';
import { runAction } from '../router.js';

const STYLE_PRESETS = [
  { id: 'bold', label: 'Bold' },
  { id: 'news', label: 'News' },
  { id: 'minimal', label: 'Minimal' },
];
const COLOR_VARIANTS = [
  { id: 'orange', color: '#FF6B35', label: '오렌지' },
  { id: 'red', color: '#E53935', label: '레드' },
  { id: 'blue', color: '#1E88E5', label: '블루' },
  { id: 'green', color: '#43A047', label: '그린' },
  { id: 'purple', color: '#8E24AA', label: '퍼플' },
  { id: 'yellow', color: '#FFB300', label: '옐로우' },
];

const TITLE_PROMPT = `유튜브 썸네일 문구를 5개 생성해주세요.

[규칙]
- 한 문구당 15~25자 이내 (짧고 임팩트 있게)
- 숫자, 질문, 강한 단언 중 하나를 반드시 포함
- "~하는 법", "~해보세요" 같은 뻔한 패턴 금지
- 클릭하고 싶게 만드는 호기심/긴장감/이득 어필

[주제]
{TOPIC}

[출력 형식]
문구만 한 줄에 하나씩, 번호 없이 출력. 설명 없이 문구만.`;

let _state = {};
function resetState() {
  _state = {
    title: '', channelName: '', topic: '',
    backgroundUrl: null, backgroundLocalPath: null, backgroundPreview: null,
    previews: [], selectedIndex: -1, isRendering: false,
    pexelsResults: [], pexelsQuery: '',
    aiSuggestions: [], isGeneratingTitle: false,
  };
}

let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.thumb-tab { padding: 32px 28px 48px; max-width: 1200px; }
.thumb-tab h2 { margin: 0 0 6px; font-size: 22px; font-weight: 800; color: var(--t1); }
.thumb-tab .sub { font-size: 13px; color: var(--t3); margin: 0 0 28px; }
.thumb-section { margin-bottom: 24px; }
.thumb-section-title {
  font-size: 13px; font-weight: 700; color: var(--t2);
  text-transform: uppercase; letter-spacing: 0.05em;
  margin: 0 0 10px; display: flex; align-items: center; gap: 8px;
}
.thumb-input {
  width: 100%; padding: 12px 16px; font-size: 15px; font-weight: 600;
  border: 1.5px solid var(--bdr); border-radius: var(--r);
  background: var(--bg); color: var(--t1); transition: border-color .15s;
  box-sizing: border-box; font-family: inherit;
}
.thumb-input:focus { outline: none; border-color: var(--accent, #FF6B35); }
.thumb-input::placeholder { color: var(--t4, #999); font-weight: 400; }
.thumb-input-sm { font-size: 13px; padding: 8px 12px; }
.thumb-ai-row { display: flex; gap: 8px; align-items: center; }
.thumb-ai-btn {
  padding: 8px 16px; font-size: 13px; font-weight: 600;
  background: linear-gradient(135deg, #7C3AED, #6D28D9); color: #fff;
  border: none; border-radius: var(--r); cursor: pointer; font-family: inherit;
  white-space: nowrap; transition: opacity .15s;
}
.thumb-ai-btn:hover { opacity: .9; }
.thumb-ai-btn:disabled { opacity: .4; cursor: default; }
.thumb-suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.thumb-suggestion {
  padding: 8px 14px; font-size: 13px; font-weight: 500;
  background: var(--bg); border: 1.5px solid var(--bdr);
  border-radius: 20px; cursor: pointer; color: var(--t1);
  transition: all .15s; font-family: inherit; text-align: left;
}
.thumb-suggestion:hover { border-color: var(--accent, #FF6B35); background: var(--accent, #FF6B35); color: #fff; }
.thumb-bg-area { display: flex; gap: 12px; flex-wrap: wrap; }
.thumb-bg-card {
  flex: 1; min-width: 160px; padding: 16px; border: 1.5px solid var(--bdr);
  border-radius: var(--r); background: var(--bg); cursor: pointer;
  transition: border-color .15s; text-align: center;
}
.thumb-bg-card:hover { border-color: var(--accent, #FF6B35); }
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
.thumb-pexels-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.thumb-pexels-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px; max-height: 260px; overflow-y: auto; padding: 2px;
}
.thumb-pexels-item {
  border-radius: 6px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; transition: border-color .15s; aspect-ratio: 16/9;
}
.thumb-pexels-item:hover { border-color: var(--accent, #FF6B35); }
.thumb-pexels-item.selected { border-color: var(--accent, #FF6B35); box-shadow: 0 0 0 2px var(--accent, #FF6B35); }
.thumb-pexels-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-preview-grid {
  display: grid; gap: 16px; margin-top: 16px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}
.thumb-preview-card {
  border-radius: var(--r); overflow: hidden; cursor: pointer;
  border: 2.5px solid var(--bdr); transition: all .2s; position: relative; background: var(--bg);
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
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; border: 1.5px solid rgba(0,0,0,.1);
}
.thumb-preview-card .check-badge {
  position: absolute; top: 10px; right: 10px; width: 28px; height: 28px;
  border-radius: 50%; background: var(--accent, #FF6B35); color: #fff;
  display: none; align-items: center; justify-content: center; font-size: 16px; font-weight: 700;
}
.thumb-preview-card.selected .check-badge { display: flex; }
.thumb-loading { text-align: center; padding: 48px 20px; }
.thumb-loading .spinner {
  width: 40px; height: 40px; border: 3px solid var(--bdr);
  border-top-color: var(--accent, #FF6B35); border-radius: 50%;
  animation: thumb-spin .7s linear infinite; margin: 0 auto 16px;
}
@keyframes thumb-spin { to { transform: rotate(360deg); } }
.thumb-actions { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; align-items: center; }
.thumb-actions .btn-primary {
  padding: 12px 28px; font-size: 14px; font-weight: 700;
  background: var(--accent, #FF6B35); color: #fff; border: none;
  border-radius: var(--r); cursor: pointer; font-family: inherit;
}
.thumb-actions .btn-primary:disabled { opacity: .4; cursor: default; }
.thumb-actions .btn-secondary {
  padding: 12px 28px; font-size: 14px; font-weight: 600;
  background: var(--bg); color: var(--t2); border: 1.5px solid var(--bdr);
  border-radius: var(--r); cursor: pointer; font-family: inherit;
}
  `;
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════
// 마운트
// ═══════════════════════════════════════════════════════════
export function mountThumbnailTab(container) {
  if (!container) return;
  injectCSS();
  resetState();
  container.textContent = '';

  // ★ 돌아가기 버튼
  const thumbBack = el('button', { className: 'btn bs back-link', textContent: '\u2190 돌아가기' });
  thumbBack.addEventListener('click', () => {
    // 사이드바 active 상태 복원 (ui.js 순환참조 회피)
    document.querySelectorAll('.nv').forEach(n => n.classList.remove('ac'));
    document.querySelectorAll('.nv[data-s]').forEach(n => {
      if (parseInt(n.dataset.s) === S.nav.step) n.classList.add('ac');
    });
    runAction('showP');
  });
  container.appendChild(thumbBack);

  // 파이프라인에서 주제 자동 추출
  try {
    const kw = S.search?.skw;
    if (kw && kw.length) _state.topic = kw.map(k => k.label || k).join(', ');
    const sv = S.video?.sv;
    if (sv && sv.title) _state.topic = sv.title;
  } catch (e) {}

  const root = el('div', { className: 'thumb-tab' });
  container.appendChild(root);

  root.appendChild(el('h2', { textContent: '썸네일 생성기' }));
  root.appendChild(el('p', { className: 'sub', textContent: 'AI로 문구를 생성하고, 배경을 선택한 뒤 프리뷰를 확인하세요.' }));

  // ── 1) 썸네일 문구 — AI 생성 + 직접 수정 ──
  const titleSection = el('div', { className: 'thumb-section' });
  titleSection.appendChild(secTitle('✨', '썸네일 문구'));

  const aiRow = el('div', { className: 'thumb-ai-row' });
  const topicInput = el('input', { className: 'thumb-input', type: 'text', placeholder: '주제 입력 후 AI 문구 생성 (예: AI 부업, 쇼핑 숏폼 수익화)', style: 'flex:1' });
  topicInput.value = _state.topic;
  topicInput.addEventListener('input', (e) => { _state.topic = e.target.value; });
  topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') aiBtn.click(); });
  aiRow.appendChild(topicInput);
  const aiBtn = el('button', { className: 'thumb-ai-btn', textContent: '✨ AI 문구 생성' });
  aiBtn.addEventListener('click', () => generateAiTitles(titleSection, aiBtn));
  aiRow.appendChild(aiBtn);
  titleSection.appendChild(aiRow);
  titleSection.appendChild(el('div', { id: 'thumb-suggestions-slot' }));

  // 최종 문구 (AI 선택 or 직접 입력)
  const titleLabel = el('div', { style: 'font-size:12px;color:var(--t3);margin:12px 0 4px', textContent: '최종 문구 (AI 선택 또는 직접 입력/수정)' });
  titleSection.appendChild(titleLabel);
  const titleInput = el('input', { className: 'thumb-input', id: 'thumb-title-input', type: 'text', placeholder: '위에서 선택하거나 직접 입력하세요', maxLength: 80 });
  titleInput.addEventListener('input', (e) => { _state.title = e.target.value; clearPreviews(); });
  titleSection.appendChild(titleInput);

  const channelInput = el('input', { className: 'thumb-input thumb-input-sm', type: 'text', placeholder: '채널명 (선택사항)', maxLength: 30, style: 'margin-top:8px' });
  channelInput.addEventListener('input', (e) => { _state.channelName = e.target.value; });
  titleSection.appendChild(channelInput);
  root.appendChild(titleSection);

  // ── 2) 배경 이미지 ──
  const bgSection = el('div', { className: 'thumb-section' });
  bgSection.appendChild(secTitle('🖼️', '배경 이미지'));
  const bgArea = el('div', { className: 'thumb-bg-area' });
  bgArea.appendChild(makeBgCard('🔍', 'Pexels 검색', '무료 이미지', () => showPexelsSearch(bgSection)));
  bgArea.appendChild(makeBgCard('📁', '로컬 업로드', '내 컴퓨터', async () => {
    if (!window.electronAPI?.remotionSelectLocalImage) return;
    const res = await window.electronAPI.remotionSelectLocalImage();
    if (!res?.ok) return;
    _state.backgroundLocalPath = res.filePath; _state.backgroundUrl = null; _state.backgroundPreview = res.dataUrl;
    renderBgPreview(bgSection); clearPreviews();
  }));
  bgArea.appendChild(makeBgCard('🎨', '없음', '그라디언트', () => {
    _state.backgroundUrl = null; _state.backgroundLocalPath = null; _state.backgroundPreview = null;
    renderBgPreview(bgSection); clearPreviews();
  }));
  bgSection.appendChild(bgArea);
  bgSection.appendChild(el('div', { id: 'thumb-bg-preview-slot' }));
  bgSection.appendChild(el('div', { id: 'thumb-pexels-slot', style: 'display:none' }));
  root.appendChild(bgSection);

  // ── 3) 프리뷰 생성 버튼 ──
  const genSection = el('div', { className: 'thumb-section' });
  const genBtn = el('button', { className: 'thumb-actions btn-primary', style: 'width:100%;padding:14px;font-size:15px;border-radius:var(--r);text-align:center' });
  genBtn.textContent = '🎨 프리뷰 생성 (3 스타일 × 6 색상)';
  genBtn.addEventListener('click', () => generatePreviews());
  genSection.appendChild(genBtn);
  root.appendChild(genSection);

  // ── 4) 프리뷰 그리드 ──
  root.appendChild(el('div', { id: 'thumb-preview-slot' }));

  checkRemotionAvailability(genBtn);
}

// ═══════════════════════════════════════════════════════════
// AI 문구 생성
// ═══════════════════════════════════════════════════════════
async function generateAiTitles(section, btn) {
  if (_state.isGeneratingTitle) return;
  const topic = _state.topic.trim();
  if (!topic) { toast('주제를 입력하세요.'); return; }

  _state.isGeneratingTitle = true;
  btn.disabled = true;
  btn.textContent = '⏳ 생성 중...';

  try {
    let result = null;
    const prompt = TITLE_PROMPT.replace('{TOPIC}', topic);
    if (window.electronAPI?.callClaude) {
      result = await window.electronAPI.callClaude(prompt, null, 500, 'thumb-' + Date.now());
    } else if (window.electronAPI?.callGemini) {
      result = await window.electronAPI.callGemini(prompt, null, 500, 'thumb-' + Date.now());
    }
    if (!result) { toast('LLM API 키가 설정되지 않았습니다.', 'err'); return; }

    const text = typeof result === 'string' ? result : (result.text || result.content || '');
    const lines = text.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, '').trim())
      .filter(l => l.length >= 4 && l.length <= 60);

    _state.aiSuggestions = lines.slice(0, 6);
    renderSuggestions(section);
    if (_state.aiSuggestions.length) toast(_state.aiSuggestions.length + '개 문구 생성 완료');
    else toast('결과가 없습니다. 주제를 바꿔보세요.', 'err');
  } catch (e) {
    toast('생성 실패: ' + (e.message || e), 'err');
  } finally {
    _state.isGeneratingTitle = false;
    btn.disabled = false;
    btn.textContent = '✨ AI 문구 생성';
  }
}

function renderSuggestions(section) {
  const slot = section.querySelector('#thumb-suggestions-slot');
  if (!slot) return;
  slot.textContent = '';
  if (!_state.aiSuggestions.length) return;

  const wrap = el('div', { className: 'thumb-suggestions' });
  _state.aiSuggestions.forEach((text) => {
    const chip = el('button', { className: 'thumb-suggestion', textContent: text });
    chip.addEventListener('click', () => {
      _state.title = text;
      const input = document.getElementById('thumb-title-input');
      if (input) input.value = text;
      wrap.querySelectorAll('.thumb-suggestion').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      clearPreviews();
    });
    wrap.appendChild(chip);
  });
  slot.appendChild(wrap);
}

// ═══════════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════════
function secTitle(icon, text) {
  const t = el('div', { className: 'thumb-section-title' });
  t.appendChild(el('span', { textContent: icon }));
  t.appendChild(el('span', { textContent: text }));
  return t;
}
function makeBgCard(icon, label, desc, onClick) {
  const card = el('div', { className: 'thumb-bg-card' });
  card.appendChild(el('div', { className: 'icon', textContent: icon }));
  card.appendChild(el('div', { className: 'label', textContent: label }));
  card.appendChild(el('div', { className: 'desc', textContent: desc }));
  card.addEventListener('click', onClick);
  return card;
}
function clearPreviews() {
  _state.previews = []; _state.selectedIndex = -1;
  const slot = document.getElementById('thumb-preview-slot');
  if (slot) slot.textContent = '';
}
function renderBgPreview(bgSection) {
  const slot = bgSection.querySelector('#thumb-bg-preview-slot');
  if (!slot) return;
  slot.textContent = '';
  if (!_state.backgroundPreview) return;
  const wrap = el('div', { className: 'thumb-bg-preview' });
  const img = el('img'); img.src = _state.backgroundPreview;
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
async function checkRemotionAvailability(btn) {
  if (!window.electronAPI?.remotionCheck) {
    btn.disabled = true; btn.textContent = 'Electron 환경에서만 사용 가능'; btn.style.opacity = '.4'; return;
  }
  try {
    const res = await window.electronAPI.remotionCheck();
    if (!res.available) { btn.disabled = true; btn.textContent = 'Remotion 미설치 — remotion 폴더에서 npm install 필요'; btn.style.opacity = '.4'; }
  } catch (e) { btn.disabled = true; btn.style.opacity = '.4'; }
}

// ── Pexels ──
function showPexelsSearch(bgSection) {
  const slot = bgSection.querySelector('#thumb-pexels-slot');
  if (!slot) return;
  if (slot.style.display !== 'none') { slot.style.display = 'none'; return; }
  slot.style.display = 'block'; slot.textContent = '';
  const bar = el('div', { className: 'thumb-pexels-bar' });
  const si = el('input', { className: 'thumb-input thumb-input-sm', type: 'text', placeholder: '배경 이미지 검색 (영문 권장)', style: 'flex:1' });
  si.value = _state.pexelsQuery;
  const sb = el('button', { className: 'btn bp', style: 'white-space:nowrap;padding:8px 16px;font-size:13px', textContent: '검색' });
  async function doSearch() {
    const q = si.value.trim();
    if (!q) return;
    if (!window.electronAPI?.pexelsSearch) { toast('Pexels API 미설정', 'err'); return; }
    _state.pexelsQuery = q; sb.disabled = true; sb.textContent = '검색 중...';
    try {
      const res = await window.electronAPI.pexelsSearch(q);
      _state.pexelsResults = res?.photos || [];
      renderPexelsGrid(slot, bgSection);
    } catch (e) { toast('검색 실패', 'err'); }
    finally { sb.disabled = false; sb.textContent = '검색'; }
  }
  sb.addEventListener('click', doSearch);
  si.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  bar.appendChild(si); bar.appendChild(sb); slot.appendChild(bar);
  if (_state.pexelsResults.length) renderPexelsGrid(slot, bgSection);
}
function renderPexelsGrid(slot, bgSection) {
  let grid = slot.querySelector('.thumb-pexels-grid');
  if (grid) grid.remove();
  if (!_state.pexelsResults.length) return;
  grid = el('div', { className: 'thumb-pexels-grid' });
  _state.pexelsResults.forEach((photo) => {
    const item = el('div', { className: 'thumb-pexels-item' });
    const img = el('img');
    img.src = photo.src?.medium || photo.src?.small || '';
    img.loading = 'lazy';
    const fullUrl = photo.src?.large2x || photo.src?.large || photo.src?.original || '';
    item.appendChild(img);
    if (_state.backgroundUrl === fullUrl) item.classList.add('selected');
    item.addEventListener('click', () => {
      _state.backgroundUrl = fullUrl; _state.backgroundLocalPath = null;
      _state.backgroundPreview = photo.src?.medium || '';
      grid.querySelectorAll('.thumb-pexels-item').forEach(x => x.classList.remove('selected'));
      item.classList.add('selected');
      renderBgPreview(bgSection); clearPreviews();
    });
    grid.appendChild(item);
  });
  slot.appendChild(grid);
}

// ═══════════════════════════════════════════════════════════
// 롱폼 프리뷰 생성 (Remotion)
// ═══════════════════════════════════════════════════════════
async function generatePreviews() {
  if (_state.isRendering) return;
  if (!_state.title.trim()) { toast('썸네일 문구를 먼저 입력하세요.'); return; }

  _state.isRendering = true; _state.previews = []; _state.selectedIndex = -1;
  const slot = document.getElementById('thumb-preview-slot');
  if (!slot) return;
  slot.textContent = '';

  const loading = el('div', { className: 'thumb-loading' });
  loading.appendChild(el('div', { className: 'spinner' }));
  const loadMsg = el('div', { className: 'msg', textContent: '프리뷰 생성 중...' });
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

  const variants = [];
  STYLE_PRESETS.forEach((p) => {
    COLOR_VARIANTS.forEach((c) => {
      variants.push({ style: p.id, accentColor: c.color, compositionId: 'LongformThumbnail', label: p.label + ' · ' + c.label });
    });
  });

  try {
    const res = await window.electronAPI.remotionThumbnailBatch({
      title: _state.title.trim(),
      backgroundUrl: _state.backgroundUrl,
      backgroundLocalPath: _state.backgroundLocalPath,
      channelName: _state.channelName.trim(),
      variants,
    });
    if (!res?.ok) throw new Error(res?.error || '렌더링 실패');
    _state.previews = res.results || [];
    renderPreviewGrid(slot);
  } catch (e) {
    slot.textContent = '';
    slot.appendChild(el('div', { style: 'text-align:center;padding:40px;color:var(--t3)', textContent: '프리뷰 생성 실패: ' + (e.message || e) }));
  } finally {
    _state.isRendering = false;
    if (unsub) unsub();
  }
}

function renderPreviewGrid(slot) {
  slot.textContent = '';
  const ok = _state.previews.filter(p => p.ok);
  if (!ok.length) { slot.appendChild(el('div', { style: 'text-align:center;padding:40px;color:var(--t3)', textContent: '프리뷰가 없습니다.' })); return; }

  slot.appendChild(el('div', { style: 'font-size:13px;color:var(--t3);margin-bottom:8px', textContent: ok.length + '개 — 클릭 선택 후 저장' }));
  const grid = el('div', { className: 'thumb-preview-grid' });
  ok.forEach((preview) => {
    const card = el('div', { className: 'thumb-preview-card' });
    if (_state.selectedIndex === preview.index) card.classList.add('selected');
    const img = el('img'); img.src = preview.dataUrl;
    card.appendChild(img);
    card.appendChild(el('div', { className: 'check-badge', textContent: '✓' }));
    const meta = el('div', { className: 'meta' });
    meta.appendChild(el('span', { className: 'style-name', textContent: preview.label }));
    const dot = el('div', { className: 'color-dot' }); dot.style.background = preview.accentColor;
    meta.appendChild(dot); card.appendChild(meta);
    card.addEventListener('click', () => {
      _state.selectedIndex = preview.index;
      grid.querySelectorAll('.thumb-preview-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const sb = document.getElementById('thumb-save-btn');
      if (sb) sb.disabled = false;
    });
    grid.appendChild(card);
  });
  slot.appendChild(grid);

  const actions = el('div', { className: 'thumb-actions' });
  const saveBtn = el('button', { className: 'btn-primary', id: 'thumb-save-btn', textContent: '💾 PNG 저장' });
  saveBtn.disabled = true;
  saveBtn.addEventListener('click', saveSelected);
  actions.appendChild(saveBtn);
  const regenBtn = el('button', { className: 'btn-secondary', textContent: '🔄 다시 생성' });
  regenBtn.addEventListener('click', () => generatePreviews());
  actions.appendChild(regenBtn);
  slot.appendChild(actions);
}

async function saveSelected() {
  if (_state.selectedIndex < 0) return;
  const preview = _state.previews.find(p => p.index === _state.selectedIndex);
  if (!preview) return;

  const btn = document.getElementById('thumb-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 렌더링 중...'; }

  let unsub = null;
  if (window.electronAPI?.onRemotionProgress) {
    unsub = window.electronAPI.onRemotionProgress((d) => { if (btn) btn.textContent = '⏳ ' + (d.msg || ''); });
  }

  try {
    const res = await window.electronAPI.remotionThumbnailSaveHQ({
      title: _state.title.trim(),
      backgroundUrl: _state.backgroundUrl,
      backgroundLocalPath: _state.backgroundLocalPath,
      accentColor: preview.accentColor,
      channelName: _state.channelName.trim(),
      style: preview.style,
      compositionId: 'LongformThumbnail',
    });
    if (res?.ok) toast('썸네일 저장 완료!');
    else if (!res?.canceled) throw new Error(res?.error || '저장 실패');
  } catch (e) { toast('저장 실패: ' + (e.message || e), 'err'); }
  finally {
    if (unsub) unsub();
    if (btn) { btn.disabled = false; btn.textContent = '💾 PNG 저장'; }
  }
}
