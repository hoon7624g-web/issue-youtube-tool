// ═══════════════════════════════════════
// pipeline/apikeys-form.js — API 키 폼 빌더 + DOM 헬퍼
// v3.6.0 — P0 보안/UX 개선
//   P0-1: innerHTML 전면 제거 → DOM API 전환
//   P0-2: 필드별 실시간 검증 (onBlur → 개별 키 테스트)
//   P0-3: 필드별 키 보기/숨기기 (눈 아이콘 + 5초 자동 숨김)
//   P0-4: safeStorage 불가 시 모달 경고 + 세션 전용 모드
// ═══════════════════════════════════════
import { $, esc, toast, confirmModal, el, TIMING, promptModal } from '../utils.js';
import { getApiKeys, setApiKeys, reloadApiKeys, isKeySaved } from '../../client-proxy.js';
import { runStep } from '../router.js';
import { validateSingleKey } from './apikeys-validation.js';

// ═══════════════════════════════════════
// 세션 전용 모드 (P0-4)
// ═══════════════════════════════════════
let _sessionOnlyMode = false;
export function isSessionOnlyMode() { return _sessionOnlyMode; }
export function setSessionOnlyMode(v) { _sessionOnlyMode = v; }

// ── API 키 저장 ──
// ★ v3.6.2 P0-1: 빈 필드는 main에서 기존 값을 유지한다 (merge).
//   사용자가 의도적으로 비우면 placeholder가 "저장됨 — 변경 시에만 다시 입력"이므로 변경 의도 없음으로 본다.
//   완전 삭제는 별도 "전체 삭제" 버튼 또는 v3.7의 개별 delete 버튼으로.
export async function saveApiKeys() {
  const yt = ($('keyYt') || {}).value || '';
  const claude = ($('keyClaude') || {}).value || '';
  const gemini = ($('keyGemini') || {}).value || '';
  let openai = ($('keyChatgpt') || {}).value || '';
  const tts = ($('keyTts') || {}).value || '';
  const elevenlabs = ($('keyEl') || {}).value || '';
  const pexels = ($('keyPexels') || {}).value || '';
  let googleAiStudio = ($('keyGaiStudio') || {}).value || '';
  const perplexity = ($('keyPerp') || {}).value || '';
  let llmProvider = 'claude';
  if ($('llmGemini') && $('llmGemini').classList.contains('on')) llmProvider = 'gemini';
  if ($('llmChatgpt') && $('llmChatgpt').classList.contains('on')) llmProvider = 'chatgpt';
  if (llmProvider === 'gemini') { googleAiStudio = gemini; }
  if (llmProvider === 'chatgpt') { openai = ($('keyChatgpt') || {}).value || ''; }
  const geminiVideoModel = ($('geminiVideoModel') || {}).value || 'gemini-2.5-pro';
  const claudeModel = ($('claudeModel') || {}).value || 'claude-sonnet-4-20250514';

  // ★ v3.6.2 P0-1: 필수 검증은 입력값 OR 기존 저장 둘 중 하나라도 있으면 통과
  const ytOk = yt.trim() || isKeySaved('youtube');
  if (!ytOk) { toast('YouTube API 키를 입력해주세요', 'err'); return false; }
  const llmOk =
    (llmProvider === 'claude'  && (claude.trim()  || isKeySaved('claude')))  ||
    (llmProvider === 'gemini'  && (gemini.trim()  || isKeySaved('gemini')))  ||
    (llmProvider === 'chatgpt' && (openai.trim()  || isKeySaved('openai')));
  if (!llmOk) { toast('AI 모델 키를 입력해주세요', 'err'); return false; }

  // 변경된 필드만 payload에 담아 보낸다 (main이 기존 값과 merge)
  // 비밀 키: trim 후 비어있으면 미포함
  // 설정 키(llmProvider/모델): 항상 포함 (사용자가 명시적으로 토글했을 수 있음)
  const payload = {
    llmProvider: llmProvider,
    geminiVideoModel: geminiVideoModel,
    claudeModel: claudeModel,
  };
  const maybeAdd = (k, v) => { const t = (v || '').trim(); if (t) payload[k] = t; };
  maybeAdd('youtube', yt);
  maybeAdd('claude', claude);
  maybeAdd('gemini', gemini);
  maybeAdd('openai', openai);
  maybeAdd('tts', tts);
  maybeAdd('elevenlabs', elevenlabs);
  maybeAdd('pexels', pexels);
  maybeAdd('googleAiStudio', googleAiStudio);
  maybeAdd('perplexity', perplexity);

  const result = await setApiKeys(payload);
  if (!result || !result.ok) throw new Error((result && result.error) || 'API 키 저장에 실패했습니다.');
  return result;
}

// ── LLM 선택 탭 ──
export function llmTabClick(selected) {
  ['llmClaude', 'llmGemini', 'llmChatgpt'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.classList[id === selected ? 'add' : 'remove']('on');
  });
  const keyMap = { llmClaude: 'keyClaude', llmGemini: 'keyGemini', llmChatgpt: 'keyChatgpt' };
  Object.values(keyMap).forEach(id => {
    const e = document.getElementById(id);
    if (e) { const wrap = e.closest('.key-input-wrap'); if (wrap) wrap.style.display = id === keyMap[selected] ? 'flex' : 'none'; }
  });
  const gf = document.getElementById('gaiStudioField');
  if (gf) { gf.style.opacity = selected === 'llmGemini' ? '0.5' : '1'; gf.style.pointerEvents = selected === 'llmGemini' ? 'none' : 'auto'; }
  const gn = document.getElementById('gaiStudioNote');
  if (gn) gn.style.display = selected === 'llmGemini' ? 'block' : 'none';
  const cf = document.getElementById('claudeModelField');
  if (cf) cf.style.display = selected === 'llmClaude' ? 'block' : 'none';
  // P0-C: Gemini 탭 선택 시 Google AI Studio 키 상태 표시 동기화
  const gaiStatus = document.getElementById('keyGaiStudio_status');
  if (gaiStatus) {
    if (selected === 'llmGemini') {
      gaiStatus.textContent = '\u2191';
      gaiStatus.title = 'Gemini 키가 자동으로 적용됩니다';
      gaiStatus.style.color = 'var(--blu)';
    } else {
      // Claude/ChatGPT 탭: 독립 검증 상태로 복원
      const inp = document.getElementById('keyGaiStudio');
      if (inp && inp.value.trim()) {
        gaiStatus.textContent = '';
        gaiStatus.title = '';
        // blur 이벤트를 트리거해서 독립 검증 실행
        inp.dispatchEvent(new Event('blur'));
      } else {
        gaiStatus.textContent = '';
        gaiStatus.title = '';
      }
    }
  }
}

// ═══════════════════════════════════════
// P0-1: DOM 전용 라벨 빌더 (innerHTML 완전 제거)
// ═══════════════════════════════════════
function _mkLabelDOM(mainText, badgeText, badgeColor) {
  const label = el('label', { style: 'font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap' });
  label.appendChild(document.createTextNode(mainText));
  if (badgeText) {
    label.appendChild(el('span', { style: 'font-size:12px;color:' + (badgeColor || 'var(--red)') + ';font-weight:400', textContent: badgeText }));
  }
  return label;
}

// ═══════════════════════════════════════
// P0-3: 필드별 키 보기/숨기기 + 5초 자동 숨김
// ═══════════════════════════════════════
const _autoHideTimers = {};

function _createEyeToggle(inputId) {
  const btn = el('button', {
    className: 'btn bg',
    style: 'padding:4px 8px;font-size:14px;flex-shrink:0;border-radius:6px;min-width:32px;line-height:1',
    textContent: '\uD83D\uDC41'
  });
  btn.title = '키 보기 (5초 후 자동 숨김)';
  btn.type = 'button';
  btn.addEventListener('click', () => {
    const inp = $(inputId);
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      inp.setAttribute('data-key-field', '1');
      btn.textContent = '\uD83D\uDD12';
      btn.title = '키 숨기기';
      if (_autoHideTimers[inputId]) clearTimeout(_autoHideTimers[inputId]);
      _autoHideTimers[inputId] = setTimeout(() => {
        if (inp.type === 'text') {
          inp.type = 'password';
          btn.textContent = '\uD83D\uDC41';
          btn.title = '키 보기 (5초 후 자동 숨김)';
        }
      }, TIMING.AUTO_HIDE_KEY);
    } else {
      inp.type = 'password';
      btn.textContent = '\uD83D\uDC41';
      btn.title = '키 보기 (5초 후 자동 숨김)';
      if (_autoHideTimers[inputId]) { clearTimeout(_autoHideTimers[inputId]); _autoHideTimers[inputId] = null; }
    }
  });
  return btn;
}

// ═══════════════════════════════════════
// P0-2: 인라인 검증 상태 표시
// ═══════════════════════════════════════
function _createInlineStatus(inputId) {
  return el('span', {
    id: inputId + '_status',
    style: 'font-size:11px;font-weight:500;min-width:20px;flex-shrink:0;text-align:center;transition:all .2s'
  });
}

function _setInlineStatus(inputId, state, msg) {
  const s = $(inputId + '_status');
  if (!s) return;
  if (state === 'loading') { s.textContent = '\u23F3'; s.title = '검증 중...'; s.style.color = 'var(--t3)'; }
  else if (state === 'ok') { s.textContent = '\u2713'; s.title = msg || '연결 성공'; s.style.color = 'var(--grn)'; }
  else if (state === 'fail') { s.textContent = '\u2717'; s.title = msg || '연결 실패'; s.style.color = 'var(--red)'; }
  else if (state === 'warn') { s.textContent = '\u26A0'; s.title = msg || ''; s.style.color = 'var(--yel)'; }
  else { s.textContent = ''; s.title = ''; }
}

const _validateTimers = {};

function _bindInlineValidation(inputId, provider) {
  const inp = $(inputId);
  if (!inp) return;
  const handler = () => {
    // P0-C: keyGaiStudio는 Gemini 탭 선택 시 독립 검증하지 않음
    if (inputId === 'keyGaiStudio') {
      const geminiTab = document.getElementById('llmGemini');
      if (geminiTab && geminiTab.classList.contains('on')) {
        const s = $(inputId + '_status');
        if (s) { s.textContent = '\u2191'; s.title = 'Gemini 키가 자동으로 적용됩니다'; s.style.color = 'var(--blu)'; }
        return;
      }
    }
    const key = inp.value.trim();
    if (!key) { _setInlineStatus(inputId, 'clear'); return; }
    if (_validateTimers[inputId]) clearTimeout(_validateTimers[inputId]);
    _validateTimers[inputId] = setTimeout(async () => {
      _setInlineStatus(inputId, 'loading');
      try {
        const result = await validateSingleKey(provider, key);
        if (result.skip) { _setInlineStatus(inputId, 'clear'); }
        else if (result.ok && result.formatOnly) { _setInlineStatus(inputId, 'warn', result.msg || '형식만 확인됨 (실제 호출 시 검증)'); }
        else if (result.ok) { _setInlineStatus(inputId, 'ok', result.msg || '연결 성공'); }
        else { _setInlineStatus(inputId, 'fail', result.msg || '연결 실패'); }
      } catch (e) {
        _setInlineStatus(inputId, 'fail', '테스트 오류: ' + (e.message || '').substring(0, 40));
      }
    }, 800);
  };
  inp.addEventListener('blur', handler);
  if (inp.value.trim()) setTimeout(handler, 300);
}

// ═══════════════════════════════════════
// DOM 헬퍼
// ═══════════════════════════════════════
// ★ v3.6.2 P0-1: saved 상태일 때 value를 비우고 placeholder로 안내한다.
//   value 인자는 무시되고 saved bool/string에 따라 표시만 바뀐다.
function _placeholderFor(saved, fallback) {
  return saved ? '저장됨 — 변경 시에만 다시 입력' : (fallback || '');
}

function _mkKeyField(mainLabel, badgeText, badgeColor, id, savedFlag, placeholder, noteText, opts) {
  opts = opts || {};
  const field = el('div', { className: 'field', id: opts.fieldId || '' });
  if (opts.fieldStyle) field.style.cssText = opts.fieldStyle;
  field.appendChild(_mkLabelDOM(mainLabel, badgeText, badgeColor));
  const inputWrap = el('div', { className: 'key-input-wrap', style: 'display:flex;align-items:center;gap:6px' });
  const inp = el('input', { className: 'inp', id: id, style: 'font-family:var(--mono);font-size:13px;flex:1' + (opts.inputStyle || '') });
  // ★ P0-1: saved 키는 value를 비우고 placeholder로만 안내
  inp.type = 'password';
  inp.value = '';
  inp.placeholder = _placeholderFor(!!savedFlag, placeholder);
  if (savedFlag) inp.dataset.saved = '1';
  if (opts.display) inputWrap.style.display = opts.display;
  inputWrap.appendChild(inp);
  inputWrap.appendChild(_createEyeToggle(id));
  inputWrap.appendChild(_createInlineStatus(id));
  field.appendChild(inputWrap);
  if (noteText) field.appendChild(el('p', { style: 'font-size:11px;color:var(--t4);margin-top:4px;line-height:1.5', textContent: noteText }));
  // saved 키: 저장됨 뱃지를 라벨 옆에 표시
  if (savedFlag) {
    const lbl = field.querySelector('label');
    if (lbl) lbl.appendChild(el('span', {
      style: 'margin-left:8px;font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(13,146,84,.1);color:var(--grn)',
      textContent: '\u2713 저장됨'
    }));
  }
  return field;
}

function _mkSelect(id, options, selectedValue, style) {
  const sel = el('select', { className: 'inp', id: id, style: style || 'font-size:13px;padding:10px 14px' });
  options.forEach(o => {
    const opt = el('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function _mkStepHeader(step, color, title, subtitle) {
  const row = el('div', { style: 'margin-bottom:6px;display:flex;align-items:center;gap:8px' });
  row.appendChild(el('span', { style: 'font-size:13px;font-weight:700;color:' + color, textContent: step }));
  row.appendChild(el('span', { style: 'font-size:13px;font-weight:600;color:var(--t1)', textContent: title }));
  row.appendChild(el('span', { style: 'font-size:11px;color:var(--t4)', textContent: subtitle }));
  return row;
}

function _mkLlmTab(id, label, isOn) {
  return el('div', { className: 'tag' + (isOn ? ' on' : ''), id: id, style: 'padding:10px 16px;font-size:13px;cursor:pointer;flex:1;text-align:center', textContent: label });
}

// ═══════════════════════════════════════
// API 키 폼 DOM 빌더 (P0-1: innerHTML 제로)
// ═══════════════════════════════════════
export function buildApiKeyFormDOM(keys, btnLabel, container) {
  const lp = keys.llmProvider || 'claude';
  const isGemini = lp === 'gemini';
  const isChatgpt = lp === 'chatgpt';
  const isClaude = !isGemini && !isChatgpt;
  const hasOptionalKeys = !!(keys.tts || keys.elevenlabs || keys.pexels || keys.perplexity);

  container.textContent = '';

  container.appendChild(el('h2', { className: 'pt', textContent: '\u2699\uFE0F API 키 설정' }));
  container.appendChild(el('p', { className: 'pd', textContent: '각 서비스의 API 키를 등록해주세요. 키는 이 컴퓨터에만 저장되며 서버로 전송되지 않습니다.' }));

  // P0-1: 가이드 배너 (DOM only)
  const guide = el('div', { style: 'margin-bottom:16px;padding:12px 16px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.15);border-radius:var(--r2);display:flex;align-items:center;gap:10px;flex-wrap:wrap' });
  guide.appendChild(el('span', { style: 'font-size:16px', textContent: '\uD83D\uDCD6' }));
  const guideText = el('div', { style: 'flex:1;font-size:13px;color:var(--t2);line-height:1.5;min-width:200px' });
  guideText.appendChild(el('strong', { textContent: '처음이신가요?' }));
  guideText.appendChild(document.createTextNode(' API 키 발급 방법을 단계별로 안내해드립니다.'));
  guide.appendChild(guideText);
  const guideLink = el('a', { id: 'apiGuideLink', style: 'font-size:12px;color:var(--acc);white-space:nowrap;text-decoration:none;font-weight:700;background:var(--acc-bg);padding:4px 10px;border-radius:6px;border:1px solid var(--acc-ring);cursor:pointer', textContent: '\uD83D\uDCD6 발급 가이드 \u2197' });
  guideLink.href = '#'; guideLink.target = '_blank'; guideLink.rel = 'noopener';
  guideLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.electronAPI && window.electronAPI.openApiGuide) {
      window.electronAPI.openApiGuide();
    } else {
      window.open('api-key-guide/index.html', '_blank');
    }
  });
  guide.appendChild(guideLink);
  [{ text: 'Google Cloud \u2197', href: 'https://console.cloud.google.com/apis', color: '#4285F4' },
   { text: 'AI Studio \u2197', href: 'https://aistudio.google.com/apikey', color: '#4285F4' },
   { text: 'Claude \u2197', href: 'https://console.anthropic.com/settings/keys', color: '#8B5CF6' }
  ].forEach(lnk => {
    const a = el('a', { style: 'font-size:12px;color:' + lnk.color + ';white-space:nowrap;text-decoration:none;font-weight:600;cursor:pointer', textContent: lnk.text });
    a.href = lnk.href; a.target = '_blank'; a.rel = 'noopener';
    a.addEventListener('click', (e) => { e.preventDefault(); window.open(lnk.href, '_blank'); });
    guide.appendChild(a);
  });
  container.appendChild(guide);

  // ═══ 1단계: 필수 키 ═══
  // ★ v3.6.2 P0-1: keys.X는 Electron에서는 bool, 웹에서는 string. 두 환경 모두 !! 변환으로 saved 판정.
  container.appendChild(_mkStepHeader('1단계', 'var(--acc)', '필수 설정', '— 이것만 있으면 바로 시작할 수 있습니다'));
  const reqCard = el('div', { className: 'cd', style: 'padding:24px;border-color:var(--acc-ring)' });
  reqCard.appendChild(_mkKeyField('YouTube API Key', '*필수', 'var(--red)', 'keyYt', !!keys.youtube, 'AIza...', 'Google Cloud Console \u2192 YouTube Data API v3 활성화 \u2192 API 키'));

  // LLM 선택
  const llmField = el('div', { className: 'field' });
  llmField.appendChild(_mkLabelDOM('AI 모델 선택', '*필수 (택 1)', 'var(--red)'));
  const llmTabs = el('div', { style: 'display:flex;gap:8px;margin-bottom:10px' });
  llmTabs.appendChild(_mkLlmTab('llmClaude', 'Claude', isClaude));
  llmTabs.appendChild(_mkLlmTab('llmGemini', 'Gemini', isGemini));
  llmTabs.appendChild(_mkLlmTab('llmChatgpt', 'ChatGPT', isChatgpt));
  llmTabs.querySelectorAll('[id]').forEach(t => { t.dataset.llm = t.id; });
  llmField.appendChild(llmTabs);
  // ★ v3.6.2 P0-1: LLM 입력도 placeholder 모드 (saved 시 value 비움)
  const mkLlmInput = (id, savedFlag, fallbackPh, show) => {
    const wrap = el('div', { className: 'key-input-wrap', style: 'display:' + (show ? 'flex' : 'none') + ';align-items:center;gap:6px' });
    const inp = el('input', { className: 'inp', id: id, style: 'font-family:var(--mono);font-size:13px;flex:1' });
    inp.type = 'password';
    inp.value = '';
    inp.placeholder = _placeholderFor(!!savedFlag, fallbackPh);
    if (savedFlag) inp.dataset.saved = '1';
    wrap.appendChild(inp);
    wrap.appendChild(_createEyeToggle(id));
    wrap.appendChild(_createInlineStatus(id));
    return wrap;
  };
  llmField.appendChild(mkLlmInput('keyClaude', !!keys.claude, 'sk-ant-...', isClaude));
  llmField.appendChild(mkLlmInput('keyGemini', !!keys.gemini, 'AIza...', isGemini));
  llmField.appendChild(mkLlmInput('keyChatgpt', !!keys.openai, 'sk-...', isChatgpt));
  llmField.appendChild(el('p', { style: 'font-size:11px;color:var(--t4);margin-top:4px;line-height:1.5', textContent: 'Claude: console.anthropic.com | Gemini: aistudio.google.com | ChatGPT: platform.openai.com\n\uD83D\uDCA1 Gemini를 선택하면 같은 키로 영상 분석(Google AI)도 가능합니다.' }));
  reqCard.appendChild(llmField);

  // Google AI
  // ★ v3.6.2 P0-1: Gemini 탭일 때는 자동 적용 안내, 그 외는 saved 플래그
  const gaiField = _mkKeyField('Google AI 키 (영상 분석)', '*필수', 'var(--red)', 'keyGaiStudio', isGemini ? false : !!keys.googleAiStudio, isGemini ? 'Gemini 키가 자동 적용됩니다' : 'aistudio.google.com에서 발급한 키 입력', 'YouTube 영상을 AI로 직접 분석할 때 사용합니다. Gemini 키와 동일한 Google AI Studio 키입니다.', { fieldId: 'gaiStudioField', fieldStyle: isGemini ? 'opacity:0.5;pointer-events:none' : '' });
  // P0-1: DOM으로 gaiNote 조립
  const gaiNote = el('div', { id: 'gaiStudioNote', style: 'display:' + (isGemini ? 'block' : 'none') + ';margin-top:8px;padding:10px 14px;background:rgba(66,133,244,.06);border:1px solid rgba(66,133,244,.15);border-radius:var(--r2);font-size:12px;color:#4285F4;line-height:1.6' });
  gaiNote.appendChild(document.createTextNode('\uD83D\uDCA1 '));
  gaiNote.appendChild(el('strong', { textContent: 'AI 모델로 Gemini를 선택하면 같은 키가 영상 분석에도 자동 적용됩니다.' }));
  gaiNote.appendChild(document.createTextNode(' 별도 입력이 필요 없습니다.'));
  gaiField.appendChild(gaiNote);
  reqCard.appendChild(gaiField);
  container.appendChild(reqCard);

  // 시작 가능 안내
  const startHint = el('div', { style: 'margin:16px 0;padding:14px 18px;background:rgba(13,146,84,.06);border:1px solid rgba(13,146,84,.15);border-radius:var(--r2);display:flex;align-items:center;gap:10px' });
  startHint.appendChild(el('span', { style: 'font-size:18px', textContent: '\u2705' }));
  const startHintText = el('div');
  startHintText.appendChild(el('div', { style: 'font-size:13px;font-weight:600;color:var(--grn)', textContent: '위 필수 키만 입력하면 바로 시작할 수 있습니다' }));
  startHintText.appendChild(el('div', { style: 'font-size:11px;color:var(--t3);margin-top:2px', textContent: '음성 생성, 풋티지, 팩트체크 강화 등은 아래 선택 설정에서 나중에 추가할 수 있어요.' }));
  startHint.appendChild(startHintText);
  container.appendChild(startHint);

  // ═══ 2단계: 선택 키 ═══
  container.appendChild(_mkStepHeader('2단계', 'var(--t3)', '선택 설정', '— 음성·풋티지·팩트체크 등 추가 기능'));
  const optToggle = el('div', { id: 'optionalKeysToggle', style: 'cursor:pointer;padding:14px 20px;background:var(--white);border:1px solid var(--bdr);border-radius:var(--r2);display:flex;align-items:center;justify-content:space-between;transition:all .2s' });
  const optLeft = el('div', { style: 'display:flex;align-items:center;gap:10px' });
  optLeft.appendChild(el('span', { style: 'font-size:16px', textContent: '\u2699\uFE0F' }));
  const optInfo = el('div');
  optInfo.appendChild(el('div', { style: 'font-size:14px;font-weight:600;color:var(--t1)', textContent: '고급 설정 열기' }));
  optInfo.appendChild(el('div', { style: 'font-size:11px;color:var(--t4);margin-top:2px', textContent: 'TTS 음성 · ElevenLabs · Pexels 풋티지 · Perplexity 팩트체크 · 모델 선택' }));
  optLeft.appendChild(optInfo);
  optToggle.appendChild(optLeft);
  optToggle.appendChild(el('span', { id: 'optionalKeysArrow', style: 'font-size:14px;color:var(--t3);transition:transform .3s', textContent: '\u25BC' }));
  container.appendChild(optToggle);

  const optBody = el('div', { id: 'optionalKeysBody', style: 'display:' + (hasOptionalKeys ? 'block' : 'none') });
  const optCard = el('div', { className: 'cd', style: 'padding:24px;margin-top:2px;border-top:none;border-top-left-radius:0;border-top-right-radius:0' });
  optCard.appendChild(_mkKeyField('Google TTS API Key', '(선택 — AI 음성 생성)', 'var(--t4)', 'keyTts', !!keys.tts, 'AIza...', 'Google Cloud Console \u2192 Cloud Text-to-Speech API 활성화'));
  optCard.appendChild(_mkKeyField('ElevenLabs API Key', '(선택 — 프리미엄 음성)', 'var(--t4)', 'keyEl', !!keys.elevenlabs, '프리미엄 음성을 사용하려면 입력', ''));
  optCard.appendChild(_mkKeyField('Pexels API Key', '(선택 — 무료 영상 소스)', 'var(--t4)', 'keyPexels', !!keys.pexels, 'pexels.com/api (무료)', ''));
  optCard.appendChild(_mkKeyField('Perplexity API Key', '(선택 — 팩트체크 강화)', 'var(--t4)', 'keyPerp', !!keys.perplexity, '팩트체크 강화용', ''));

  const modelSection = el('div', { style: 'border-top:1px solid var(--bdr);padding-top:16px;margin-top:8px' });
  const geminiModelField = el('div', { className: 'field' });
  geminiModelField.appendChild(el('label', { style: 'font-weight:600', textContent: '\uD83C\uDFAC 영상 분석 AI 모델' }));
  geminiModelField.appendChild(_mkSelect('geminiVideoModel', [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (기본 — 정확하고 안정적)' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (최신 — 최고 성능, 비용 높음)' }
  ], (keys.geminiVideoModel === 'gemini-2.0-flash' || keys.geminiVideoModel === 'gemini-2.5-flash') ? 'gemini-2.5-pro' : (keys.geminiVideoModel || 'gemini-2.5-pro')));
  geminiModelField.appendChild(el('p', { style: 'font-size:11px;color:var(--t4);margin-top:4px;line-height:1.5', textContent: '영상 분석(Step 4)에서 사용할 AI 모델입니다.' }));
  modelSection.appendChild(geminiModelField);

  const claudeModelField = el('div', { className: 'field', id: 'claudeModelField', style: isClaude ? '' : 'display:none' });
  claudeModelField.appendChild(el('label', { style: 'font-weight:600', textContent: '\uD83E\uDDE0 Claude 대본 생성 모델' }));
  claudeModelField.appendChild(_mkSelect('claudeModel', [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (기본 — 빠르고 효율적)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (프리미엄 — 더 깊은 분석, 속도 느림, 비용 높음)' }
  ], keys.claudeModel || 'claude-sonnet-4-20250514'));
  claudeModelField.appendChild(el('p', { style: 'font-size:11px;color:var(--t4);margin-top:4px;line-height:1.5', textContent: '대본 생성·팩트체크·풋티지 브리프에서 사용할 Claude 모델입니다.' }));
  modelSection.appendChild(claudeModelField);
  optCard.appendChild(modelSection);
  optBody.appendChild(optCard);
  container.appendChild(optBody);

  // 비용 안내
  const costCard = el('div', { style: 'padding:14px 18px;background:rgba(184,138,0,.04);border:1px solid rgba(184,138,0,.15);border-radius:var(--r2);margin-top:16px' });
  const costHeader = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' });
  costHeader.appendChild(el('span', { style: 'font-size:16px', textContent: '\uD83D\uDCB0' }));
  costHeader.appendChild(el('span', { style: 'font-size:13px;font-weight:600;color:var(--t1)', textContent: 'API 비용 안내' }));
  costCard.appendChild(costHeader);
  const costBody = el('div', { style: 'font-size:12px;color:var(--t2);line-height:1.8' });
  ['\u2022 YouTube API: 무료 (일일 10,000 쿼리 — 보통 충분)',
   '\u2022 Google AI Studio (Gemini): 무료 한도 넉넉 (분당 15회)',
   '\u2022 Claude: 가입 시 $5 무료 크레딧 · 이후 사용량 과금',
   '\u2022 Google TTS: 월 400만자 무료 · 일반 사용 시 무료 범위 내',
   '\u2022 ElevenLabs: 월 1만자 무료 · 긴 대본은 유료 전환 가능',
   '\u2022 Pexels: 완전 무료 (월 200회 검색)'
  ].forEach(t => { costBody.appendChild(el('div', { textContent: t })); });
  costBody.appendChild(el('div', { style: 'margin-top:8px;padding-top:8px;border-top:1px solid rgba(184,138,0,.12);font-size:11px;color:var(--t3)', textContent: '\uD83D\uDCA1 필수 키(YouTube + AI 모델 + Google AI)만 사용하면 대부분 무료 범위에서 이용 가능합니다. 비용은 각자의 API 계정에서 직접 발생합니다.' }));
  costCard.appendChild(costBody);
  container.appendChild(costCard);

  // ═══ 저장 정책 안내 카드 ═══
  const policyCard = el('div', { style: 'padding:14px 18px;background:var(--bg);border:1px solid var(--bdr);border-radius:var(--r2);margin-top:16px' });
  const policyHdr = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px' });
  policyHdr.appendChild(el('span', { style: 'font-size:14px', textContent: '\uD83D\uDCCB' }));
  policyHdr.appendChild(el('span', { style: 'font-size:13px;font-weight:700;color:var(--t1)', textContent: '데이터 저장 안내' }));
  policyCard.appendChild(policyHdr);
  const policyItems = [
    { icon: '\uD83D\uDD11', label: 'API 키', desc: '이 기기에만 저장 (서버 전송 없음)' },
    { icon: '\uD83D\uDC64', label: '로그인', desc: '이 기기에 유지될 수 있음' },
    { icon: '\uD83D\uDCBE', label: '작업 진행 상태', desc: '중간까지 자동 임시 저장 (6단계까지)' },
    { icon: '\uD83D\uDCC2', label: '히스토리', desc: 'ZIP 다운로드 완료 시 저장' },
    { icon: '\u26A0\uFE0F', label: '공용 PC 이용 시', desc: '공용 PC 모드 사용 또는 종료 전 로그아웃 + 키 삭제 권장' },
  ];
  policyItems.forEach(item => {
    const row = el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px' });
    row.appendChild(el('span', { style: 'font-size:12px;width:20px;text-align:center;flex-shrink:0', textContent: item.icon }));
    row.appendChild(el('span', { style: 'font-weight:600;color:var(--t1);min-width:90px;flex-shrink:0', textContent: item.label }));
    row.appendChild(el('span', { style: 'color:var(--t3)', textContent: item.desc }));
    policyCard.appendChild(row);
  });
  container.appendChild(policyCard);

  // ═══ 보안 안내 (P0-1: innerHTML 제거, P0-4: 공용 PC 모드) ═══
  const secBox = el('div', { style: 'padding:14px 18px;background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.15);border-radius:var(--r2);margin-top:16px' });
  const secRow = el('div', { style: 'display:flex;align-items:flex-start;gap:10px;margin-bottom:10px' });
  secRow.appendChild(el('span', { style: 'font-size:16px;flex-shrink:0', textContent: '\uD83D\uDD12' }));
  const secText = el('div', { style: 'font-size:12px;color:var(--t2);line-height:1.6' });
  const secLine1 = el('div');
  secLine1.appendChild(el('strong', { textContent: 'API 키는 이 기기에만 저장됩니다.' }));
  secLine1.appendChild(document.createTextNode(' '));
  secLine1.appendChild(el('span', { id: 'storageStatusBadge' }));
  secText.appendChild(secLine1);
  secText.appendChild(el('div', { textContent: '회사 서버로 전송되지 않으며, API 비용은 각자의 계정에서 직접 발생합니다.' }));
  secText.appendChild(el('div', { textContent: '공용 PC에서는 사용을 권장하지 않습니다. 사용 후 반드시 아래 버튼으로 키를 삭제해주세요.' }));
  secText.appendChild(el('div', { textContent: '공용 PC 모드는 정상 종료·로그아웃 기준으로 흔적 삭제를 돕습니다. 강제 종료·OS 크래시 상황에서는 일부 흔적이 남을 수 있습니다.' }));
  secRow.appendChild(secText);
  secBox.appendChild(secRow);

  // P0-4: 공용 PC 모드 (구 세션 전용 모드)
  const sessionRow = el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:rgba(184,138,0,.06);border:1px solid rgba(184,138,0,.12);border-radius:var(--r)', id: 'sessionOnlyRow' });
  const sessionCheck = el('input', { id: 'sessionOnlyCheck' });
  sessionCheck.type = 'checkbox'; sessionCheck.checked = _sessionOnlyMode;
  sessionCheck.style.cssText = 'accent-color:var(--yel);cursor:pointer;width:16px;height:16px;flex-shrink:0';
  sessionRow.appendChild(sessionCheck);
  const sessionLabel = el('div', { style: 'font-size:12px;color:var(--t2);line-height:1.4;cursor:pointer' });
  sessionLabel.appendChild(el('strong', { style: 'color:var(--yel)', textContent: '공용 PC 모드' }));
  sessionLabel.appendChild(document.createTextNode(' — 정상 종료/로그아웃 시 API 키, 로그인, 작업 기록을 자동 삭제합니다'));
  sessionLabel.addEventListener('click', () => { sessionCheck.checked = !sessionCheck.checked; sessionCheck.dispatchEvent(new Event('change')); });
  sessionRow.appendChild(sessionLabel);
  secBox.appendChild(sessionRow);

  const secActions = el('div', { style: 'display:flex;align-items:center;gap:8px;padding-top:10px;border-top:1px solid rgba(6,182,212,.12);flex-wrap:wrap' });
  secActions.appendChild(el('button', { className: 'btn bs', id: 'clearAllKeysBtn', style: 'font-size:11px;padding:5px 12px;color:var(--red);border-color:rgba(201,42,42,.25)', textContent: '\uD83D\uDDD1 전체 삭제' }));
  // 키 내보내기/가져오기 (Electron 전용)
  if (window.electronAPI && window.electronAPI.exportApiKeys) {
    secActions.appendChild(el('button', { className: 'btn bs', id: 'exportKeysBtn', style: 'font-size:11px;padding:5px 12px', textContent: '\uD83D\uDCE4 키 내보내기' }));
    secActions.appendChild(el('button', { className: 'btn bs', id: 'importKeysBtn', style: 'font-size:11px;padding:5px 12px', textContent: '\uD83D\uDCE5 키 가져오기' }));
  }
  secActions.appendChild(el('span', { id: 'lastSavedInfo', style: 'font-size:11px;color:var(--t4);margin-left:auto' }));
  secBox.appendChild(secActions);
  container.appendChild(secBox);

  // 버튼
  container.appendChild(el('div', { id: 'keyValidationArea', style: 'margin-top:16px' }));
  const btnRow = el('div', { style: 'display:flex;gap:10px;margin-top:20px' });
  btnRow.appendChild(el('button', { className: 'btn bs btn-lg', id: 'validateKeysBtn', style: 'flex:0 0 auto;gap:6px', textContent: '\uD83D\uDD0D 연결 테스트' }));
  btnRow.appendChild(el('button', { className: 'btn bp btn-lg', id: 'saveKeysBtn', style: 'flex:1', textContent: btnLabel }));
  container.appendChild(btnRow);
}

// ═══════════════════════════════════════
// 이벤트 바인딩
// ═══════════════════════════════════════
export function bindFormEvents(validateAllKeys) {
  // P0-4: 저장 방식 표시 + safeStorage 불가 시 모달
  const storageBadge = $('storageStatusBadge');
  if (storageBadge) {
    const isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
    if (isElectron && window.electronAPI.getStorageStatus) {
      storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--bg2);color:var(--t3)';
      storageBadge.textContent = '확인 중...';
      window.electronAPI.getStorageStatus().then(status => {
        if (status && status.encrypted) {
          storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(13,146,84,.1);color:var(--grn)';
          storageBadge.textContent = '\uD83D\uDD12 OS 보안 저장소 (키체인/DPAPI)';
          const sr = $('sessionOnlyRow'); if (sr) sr.style.display = 'none';
        } else {
          storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(201,42,42,.1);color:var(--red)';
          storageBadge.textContent = '\u26A0 OS 보안 저장소 사용 불가 — API 키 저장 미지원';
          _showUnsafeStorageWarning();
        }
      }).catch(() => {
        storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(201,42,42,.1);color:var(--red)';
        storageBadge.textContent = '\u26A0 저장 방식 확인 실패';
      });
    } else if (isElectron) {
      storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(13,146,84,.1);color:var(--grn)';
      storageBadge.textContent = '\uD83D\uDD12 OS 보안 저장소 (키체인/DPAPI)';
      const sr = $('sessionOnlyRow'); if (sr) sr.style.display = 'none';
    } else {
      storageBadge.style.cssText = 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(201,42,42,.1);color:var(--red)';
      storageBadge.textContent = '\u26A0 브라우저 로컬 저장소 (공용 PC 비권장)';
      _showUnsafeStorageWarning();
    }
  }

  // P0-4: 세션 전용 모드 체크박스
  const sessionCheck = $('sessionOnlyCheck');
  if (sessionCheck) {
    sessionCheck.addEventListener('change', () => {
      _sessionOnlyMode = sessionCheck.checked;
      // main process에 모드 전달 (before-quit 동기 삭제용)
      if (window.electronAPI && window.electronAPI.setSessionOnlyMode) {
        window.electronAPI.setSessionOnlyMode(_sessionOnlyMode);
      }
      if (_sessionOnlyMode) toast('공용 PC 모드: 정상 종료/로그아웃 시 사용 흔적이 삭제됩니다. 강제 종료 시 일부 흔적이 남을 수 있습니다.');
    });
  }

  // API 키 발급 가이드 링크 — 웹에서는 인라인 핸들러로 처리됨
  // LLM 탭
  document.querySelectorAll('[data-llm]').forEach(tab => {
    tab.addEventListener('click', () => { llmTabClick(tab.dataset.llm); });
  });
  // 선택 설정 접기/펼치기
  const optToggle = $('optionalKeysToggle');
  const optBody = $('optionalKeysBody');
  const optArrow = $('optionalKeysArrow');
  if (optToggle && optBody) {
    if (optBody.style.display !== 'none' && optArrow) {
      optArrow.style.transform = 'rotate(180deg)';
      optToggle.style.borderBottomLeftRadius = '0';
      optToggle.style.borderBottomRightRadius = '0';
      optToggle.style.borderBottom = 'none';
      optToggle.querySelector('div > div > div:first-child').textContent = '고급 설정 접기';
    }
    optToggle.addEventListener('click', () => {
      const isHidden = optBody.style.display === 'none';
      optBody.style.display = isHidden ? 'block' : 'none';
      if (optArrow) optArrow.style.transform = isHidden ? 'rotate(180deg)' : '';
      optToggle.style.borderBottomLeftRadius = isHidden ? '0' : '';
      optToggle.style.borderBottomRightRadius = isHidden ? '0' : '';
      optToggle.style.borderBottom = isHidden ? 'none' : '';
      const label = optToggle.querySelector('div > div > div:first-child');
      if (label) label.textContent = isHidden ? '고급 설정 접기' : '고급 설정 열기';
    });
  }
  // 연결 테스트
  const valBtn = $('validateKeysBtn');
  if (valBtn) valBtn.addEventListener('click', () => { validateAllKeys(); });
  // 키 전체 삭제
  const clearBtn = $('clearAllKeysBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const ok = await confirmModal('저장된 API 키를 전부 삭제합니다.\n삭제 후에는 다시 입력해야 합니다.\n계속하시겠습니까?', { confirmText: '전체 삭제', cancelText: '취소', danger: true });
      if (!ok) return;
      if (window.electronAPI && window.electronAPI.clearApiKeys) await window.electronAPI.clearApiKeys();
      try { localStorage.removeItem('yt_api_keys'); } catch(e) {}
      setApiKeys({});
      toast('저장된 키가 모두 삭제되었습니다');
      runStep(2);
    });
  }
  // 저장된 키 개수 표시
  // ★ v3.6.2 P0-1: 비밀 키만 카운트 (bool/string 양쪽 환경 호환)
  const savedInfo = $('lastSavedInfo');
  if (savedInfo) {
    const keys = getApiKeys();
    const SECRET_FIELDS = ['youtube','claude','gemini','openai','tts','elevenlabs','pexels','googleAiStudio','perplexity'];
    const count = SECRET_FIELDS.filter(k => {
      const v = keys[k];
      return v === true || (typeof v === 'string' && v.trim());
    }).length;
    savedInfo.textContent = count > 0 ? '현재 ' + count + '개 키 저장됨' : '저장된 키 없음';
  }

  // ═══ 키 내보내기/가져오기 (Electron 전용) ═══
  // ★ v3.5.10: safeStorage 미지원 환경에서는 내보내기/가져오기 차단
  const exportBtn = $('exportKeysBtn');
  if (exportBtn && window.electronAPI && window.electronAPI.exportApiKeys) {
    exportBtn.addEventListener('click', async () => {
      const pw = await promptModal('내보내기 비밀번호를 설정하세요\n가져올 때 동일한 비밀번호가 필요합니다.', { placeholder: '4자 이상 비밀번호', confirmText: '내보내기', inputType: 'password' });
      if (!pw) return;
      if (pw.length < 4) { toast('비밀번호는 4자 이상이어야 합니다', 'err'); return; }
      exportBtn.disabled = true; exportBtn.textContent = '내보내는 중...';
      const result = await window.electronAPI.exportApiKeys(pw);
      exportBtn.disabled = false; exportBtn.textContent = '\uD83D\uDCE4 키 내보내기';
      if (result.ok) toast('API 키를 파일로 내보냈습니다. 안전한 곳에 보관하세요.');
      else if (result.error !== '취소됨') toast(result.error || '내보내기 실패', 'err');
    });
  }
  const importBtn = $('importKeysBtn');
  if (importBtn && window.electronAPI && window.electronAPI.importApiKeys) {
    importBtn.addEventListener('click', async () => {
      const pw = await promptModal('내보낼 때 설정한 비밀번호를 입력하세요.', { placeholder: '비밀번호 입력', confirmText: '가져오기', inputType: 'password' });
      if (!pw) return;
      importBtn.disabled = true; importBtn.textContent = '가져오는 중...';
      const result = await window.electronAPI.importApiKeys(pw);
      importBtn.disabled = false; importBtn.textContent = '\uD83D\uDCE5 키 가져오기';
      if (result.ok) {
        // ★ P1-fix: import 성공 후 렌더러 캐시 강제 재로드 (옛날 키 상태 방지)
        await reloadApiKeys();
        toast(result.count + '개 키를 가져왔습니다.');
        setTimeout(() => { runStep(2); }, 500);
      } else if (result.error !== '취소됨') toast(result.error || '가져오기 실패', 'err');
    });
  }

  // ═══ P0-2: 필드별 인라인 검증 바인딩 ═══
  _bindInlineValidation('keyYt', 'youtube');
  _bindInlineValidation('keyClaude', 'claude');
  _bindInlineValidation('keyGemini', 'gemini');
  _bindInlineValidation('keyChatgpt', 'openai');
  _bindInlineValidation('keyGaiStudio', 'gemini');
  _bindInlineValidation('keyTts', 'tts');
  _bindInlineValidation('keyEl', 'elevenlabs');
  _bindInlineValidation('keyPexels', 'pexels');
  _bindInlineValidation('keyPerp', 'perplexity');
}

// ═══════════════════════════════════════
// P0-4: safeStorage 불가 경고 모달 (세션 내 1회)
// ═══════════════════════════════════════
let _unsafeStorageWarningShown = false;

async function _showUnsafeStorageWarning() {
  if (_unsafeStorageWarningShown) return;
  try { if (sessionStorage.getItem('_unsafe_storage_warned')) return; } catch(e) {}
  _unsafeStorageWarningShown = true;
  try { sessionStorage.setItem('_unsafe_storage_warned', '1'); } catch(e) {}

  await confirmModal(
    '\u26A0\uFE0F 저장소 지원 안내\n\n' +
    '이 환경에서는 OS 보안 저장소(키체인/DPAPI)를 사용할 수 없어\n' +
    'Electron 앱에서 API 키를 저장할 수 없습니다.\n\n' +
    '키 저장, 저장된 키 테스트, 내보내기/가져오기는 지원되지 않습니다.\n' +
    'OS 보안 저장소가 동작하는 환경에서 다시 실행해주세요.',
    { confirmText: '확인', cancelText: null, danger: false }
  );
}
