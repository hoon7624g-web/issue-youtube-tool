// ═══════════════════════════════════════
// pipeline/apikeys.js — API 키 설정 오케스트레이터
// v3.6.0 — apikeys-form.js, apikeys-validation.js로 분리 후 통합 진입점
// ═══════════════════════════════════════
import { $, toast, confirmModal, el } from '../utils.js';
import { S, sSet } from '../state.js';
import { getApiKeys, hasApiKeys } from '../../client-proxy.js';
import { registerStep, registerAction, runStep, runAction } from '../router.js';
import { syncSb } from '../ui.js';

// ── 분리된 모듈 import ──
import { saveApiKeys, buildApiKeyFormDOM, bindFormEvents, isSessionOnlyMode } from './apikeys-form.js';
import { validateAllKeys } from './apikeys-validation.js';

// ═══════════════════════════════════════
// 공용 렌더링
// ═══════════════════════════════════════
export function _renderApiKeyForm(target, btnLabel, onSave) {
  const keys = getApiKeys();
  target.removeAttribute('data-ok');
  buildApiKeyFormDOM(keys, btnLabel, $('p2'));
  bindFormEvents(validateAllKeys);
  $('saveKeysBtn').addEventListener('click', async () => {
    const isElectronSafe = !!(window.electronAPI && window.electronAPI.isElectron);
    if (!isElectronSafe) {
      const ok = await confirmModal(
        '현재 환경에서는 OS 보안 저장소를 사용할 수 없어, API 키가 브라우저 로컬 저장소에 평문으로 저장됩니다.\n\n공용 PC에서는 사용 후 반드시 키를 삭제해주세요.\n계속 저장하시겠습니까?',
        { confirmText: '저장', cancelText: '취소', danger: true }
      );
      if (!ok) return;
    }
    try {
      const saved = await saveApiKeys();
      if (!saved) return;
      toast('키 저장 완료. 연결 테스트 중...');
      const result = await validateAllKeys();
      target.removeAttribute('data-ok');
      if (result && result.requiredFailCount === 0) {
        if (result.optionalFailCount > 0) {
          toast('필수 키 정상! 선택 키 일부에 문제가 있지만 시작합니다.');
        } else {
          toast('모든 키가 정상입니다!');
        }
        setTimeout(() => { onSave(); }, 600);
      } else {
        toast('필수 키에 문제가 있습니다. 위 결과를 확인해주세요.', 'err');
      }
    } catch (e) {
      toast((e && e.message) || 'API 키 저장 실패', 'err');
    }
  });
}

// ═══════════════════════════════════════
// 목표 기반 온보딩
// ═══════════════════════════════════════
let _selectedGoal = null;

const GOALS = [
  { id: 'script_only', icon: '📝', title: '대본만 빠르게 뽑고 싶어요', desc: 'YouTube + AI 모델 키만 있으면 됩니다', keys: ['youtube', 'llm', 'googleAiStudio'], color: '#2563EB' },
  { id: 'with_verify', icon: '✅', title: '팩트 검증까지 하고 싶어요', desc: '+ Perplexity 키를 추가하면 검증 품질 UP', keys: ['youtube', 'llm', 'googleAiStudio', 'perplexity'], color: '#059669' },
  { id: 'with_voice', icon: '🔊', title: '음성까지 만들고 싶어요', desc: '+ TTS 키로 AI 음성을 생성합니다', keys: ['youtube', 'llm', 'googleAiStudio', 'tts', 'elevenlabs'], color: '#7C3AED' },
  { id: 'full', icon: '🎬', title: '소스영상까지 자동으로 받고 싶어요', desc: '모든 기능을 활용합니다', keys: ['youtube', 'llm', 'googleAiStudio', 'tts', 'elevenlabs', 'pexels', 'perplexity'], color: 'var(--acc)' }
];

function _showGoalSelector() {
  const p2 = $('p2');
  p2.textContent = '';
  p2.appendChild(el('h2', { className: 'pt', textContent: '무엇을 만들고 싶으세요?' }));
  p2.appendChild(el('p', { className: 'pd', textContent: '목표에 따라 필요한 API 키가 달라집니다. 나중에 언제든 추가할 수 있어요.' }));
  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px;max-width:640px' });
  GOALS.forEach((g) => {
    const card = el('div', { className: 'cd', style: 'cursor:pointer;padding:20px;border-left:4px solid ' + g.color + ';transition:all .2s' });
    card.addEventListener('mouseenter', () => { card.style.borderColor = g.color; card.style.transform = 'translateY(-2px)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--bdr)'; card.style.borderLeftColor = g.color; card.style.transform = ''; });
    const header = el('div', { className: 'fx-row-10', style: 'margin-bottom:8px' });
    header.appendChild(el('span', { style: 'font-size:24px', textContent: g.icon }));
    header.appendChild(el('span', { style: 'font-size:14px;font-weight:700;color:var(--t1)', textContent: g.title }));
    card.appendChild(header);
    card.appendChild(el('div', { style: 'font-size:12px;color:var(--t3);line-height:1.5', textContent: g.desc }));
    const keyCount = g.keys.filter(k => k !== 'llm').length;
    card.appendChild(el('div', { style: 'margin-top:10px;font-size:11px;font-weight:600;color:' + g.color, textContent: 'API 키 ' + keyCount + '개 필요' }));
    card.addEventListener('click', () => {
      _selectedGoal = g.id;
      _renderApiKeyForm($('p2'), '저장하고 시작하기 \u2192', () => { runStep(2); });
      _highlightGoalFields(g);
    });
    grid.appendChild(card);
  });
  p2.appendChild(grid);
  const skipRow = el('div', { style: 'margin-top:20px;text-align:center' });
  const skipBtn = el('button', { className: 'btn bg t-sm-t3', textContent: '목표 없이 직접 설정하기 →' });
  skipBtn.addEventListener('click', () => { _selectedGoal = null; _renderApiKeyForm($('p2'), '저장하고 시작하기 \u2192', () => { runStep(2); }); });
  skipRow.appendChild(skipBtn);
  p2.appendChild(skipRow);
}

function _highlightGoalFields(goal) {
  const optionalKeys = ['tts', 'elevenlabs', 'pexels', 'perplexity'];
  const needsOptional = goal.keys.some(k => optionalKeys.includes(k));
  if (needsOptional) {
    const optBody = $('optionalKeysBody');
    const optArrow = $('optionalKeysArrow');
    const optToggle = $('optionalKeysToggle');
    if (optBody && optBody.style.display === 'none') {
      optBody.style.display = 'block';
      if (optArrow) optArrow.style.transform = 'rotate(180deg)';
      if (optToggle) { optToggle.style.borderBottomLeftRadius = '0'; optToggle.style.borderBottomRightRadius = '0'; optToggle.style.borderBottom = 'none'; const label = optToggle.querySelector('div > div > div:first-child'); if (label) label.textContent = '고급 설정 접기'; }
    }
  }
  const fieldMap = { tts: 'keyTts', elevenlabs: 'keyEl', pexels: 'keyPexels', perplexity: 'keyPerp' };
  const needsAnyOptional = goal.keys.some(k => optionalKeys.includes(k));
  optionalKeys.forEach(k => {
    const input = $(fieldMap[k]); if (!input) return;
    const field = input.closest('.field'); if (!field) return;
    if (goal.keys.includes(k)) {
      field.style.display = '';
      const badge = el('span', { style: 'font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + goal.color + '15;color:' + goal.color + ';margin-left:6px', textContent: '← 이 목표에 필요' });
      badge.className = 'goal-badge';
      const label = field.querySelector('label');
      if (label && !label.querySelector('.goal-badge')) label.appendChild(badge);
    } else { field.style.display = 'none'; }
  });
  if (!needsAnyOptional) {
    const optToggle = $('optionalKeysToggle'); const optBody = $('optionalKeysBody');
    if (optToggle) optToggle.style.display = 'none';
    if (optBody) optBody.style.display = 'none';
  }
}

export function showApiKeySettings() {
  const keys = getApiKeys();
  // ★ v3.6.2 P0-1: bool/string 양쪽 환경 호환
  const hasAnyKey = Object.values(keys).some(v => v === true || (typeof v === 'string' && v.trim()));
  if (!hasAnyKey) { _showGoalSelector(); }
  else { _renderApiKeyForm($('p2'), '저장하고 시작하기 \u2192', () => { runStep(2); }); }
}

// ═══════════════════════════════════════
// Step/Action 등록
// ═══════════════════════════════════════

registerAction('openApiKeySettings', () => {
  document.querySelectorAll('.pnl').forEach(p => { p.classList.remove('on'); });
  const p2 = $('p2'); if (!p2) return;
  p2.classList.add('on');
  _renderApiKeyForm(p2, '저장하기', () => { syncSb(); runAction('showP'); });
  // ★ 돌아가기 버튼 (폼 렌더 후 맨 위에 삽입)
  const backBtn = el('button', { className: 'btn bs back-link', textContent: '\u2190 돌아가기' });
  backBtn.addEventListener('click', () => { syncSb(); runAction('showP'); });
  p2.insertBefore(backBtn, p2.firstChild);
});

registerAction('openMySettings', () => {
  document.querySelectorAll('.pnl').forEach(p => { p.classList.remove('on'); });
  const p2 = $('p2'); if (!p2) return;
  p2.classList.add('on');
  p2.textContent = '';
  // ★ 돌아가기 버튼
  const msBackTop = el('button', { className: 'btn bs back-link', textContent: '\u2190 돌아가기' });
  msBackTop.addEventListener('click', () => { syncSb(); runAction('showP'); });
  p2.appendChild(msBackTop);
  const wrap = el('div', { style: 'max-width:600px;margin:0 auto' });
  wrap.appendChild(el('h2', { className: 'pt', textContent: '\uD83C\uDFA4 내 설정' }));
  wrap.appendChild(el('p', { className: 'pd', textContent: '내 목소리를 등록하면 AI가 유사한 음성을 생성합니다' }));
  const voiceCard = el('div', { className: 'cd', style: 'margin-bottom:16px' });
  const voiceHeader = el('div', { className: 'st fx-row' });
  voiceHeader.appendChild(document.createTextNode('내 목소리'));
  voiceHeader.appendChild(el('span', { className: 'bdg', style: 'font-size:10px;background:rgba(139,92,246,.1);color:#8B5CF6', textContent: 'ElevenLabs' }));
  voiceCard.appendChild(voiceHeader);
  const uploadRow = el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:12px' });
  const voiceLabel = el('label', { id: 'voiceUploadLabel', style: 'display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:var(--r2);border:1.5px dashed var(--bdr2);cursor:pointer;color:var(--t2);font-size:13px;font-weight:500;transition:all .2s;background:var(--bg)' });
  voiceLabel.appendChild(el('span', { style: 'font-size:18px', textContent: '\uD83C\uDFA4' }));
  voiceLabel.appendChild(document.createTextNode(' 음성 파일 업로드 (.mp3, .wav)'));
  const fileInput = el('input', { id: 'voiceFileInput', style: 'display:none' });
  fileInput.type = 'file'; fileInput.accept = '.mp3,.wav';
  voiceLabel.appendChild(fileInput);
  uploadRow.appendChild(voiceLabel);
  uploadRow.appendChild(el('span', { id: 'uploadStatus', className: 't-xs-t3', textContent: (S.voice && S.voice.elVoiceId ? '\u2713 등록됨' : '') }));
  voiceCard.appendChild(uploadRow);
  voiceCard.appendChild(el('p', { style: 'font-size:11px;color:var(--t4);line-height:1.6', textContent: 'ElevenLabs API 키가 설정되어야 합니다. 30초~3분 분량의 깨끗한 음성 파일을 권장합니다.' }));
  voiceCard.appendChild(el('p', { style: 'font-size:10px;color:var(--t4);line-height:1.5;margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr)', textContent: '\uD83D\uDD12 음성 파일은 ElevenLabs 서버로 전송되어 AI 음성 모델이 생성됩니다. 회사 서버에는 저장되지 않습니다.' }));
  wrap.appendChild(voiceCard);
  const speedCard = el('div', { className: 'cd' });
  speedCard.appendChild(el('div', { className: 'st', textContent: '\uD83C\uDFC3 기본 음성 속도' }));
  const speedRow = el('div', { style: 'display:flex;align-items:center;gap:16px;padding:8px 0' });
  const slider = el('input', { id: 'msSpeedSlider', style: 'flex:1;accent-color:var(--acc);height:6px;cursor:pointer' });
  slider.type = 'range'; slider.min = '1.0'; slider.max = '1.5'; slider.step = '0.1';
  slider.value = String(S.voice ? S.voice.voiceSpeed || 1.0 : 1.0);
  speedRow.appendChild(slider);
  speedRow.appendChild(el('span', { id: 'msSpeedValue', className: 'speed-display', textContent: (S.voice ? (S.voice.voiceSpeed || 1.0).toFixed(1) : '1.0') + 'x' }));
  speedCard.appendChild(speedRow);
  wrap.appendChild(speedCard);
  const backBtn = el('button', { className: 'btn bp btn-lg', style: 'margin-top:20px', id: 'msBack', textContent: '\u2190 돌아가기' });
  wrap.appendChild(backBtn);
  p2.appendChild(wrap);
  voiceLabel.addEventListener('mouseenter', () => { voiceLabel.style.borderColor = '#8B5CF6'; });
  voiceLabel.addEventListener('mouseleave', () => { voiceLabel.style.borderColor = 'var(--bdr2)'; });
  fileInput.addEventListener('change', () => { runAction('handleVoiceUpload', fileInput); });
  slider.addEventListener('input', () => { const v = parseFloat(slider.value); sSet({ 'voice.voiceSpeed': v }); $('msSpeedValue').textContent = v.toFixed(1) + 'x'; });
  backBtn.addEventListener('click', () => { syncSb(); runAction('showP'); });
});
