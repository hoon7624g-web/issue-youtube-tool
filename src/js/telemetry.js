// ═══════════════════════════════════════
// telemetry.js — 익명 운영 이벤트 (v3.6.0)
// 키/콘텐츠 미전송, step 진입/완료/기능 사용만 기록
// 서버 장애 시 무시 (fire-and-forget)
// ═══════════════════════════════════════
import { getToken } from '../client-proxy.js';
import { CONFIG } from '../config.js';
import { isSessionOnlyMode } from './pipeline/apikeys-form.js';

const _queue = [];
let _flushTimer = null;
const FLUSH_INTERVAL = 30000; // 30초마다 배치 전송
const MAX_QUEUE = 50;

// ── 이벤트 기록 (큐에 추가) ──
export function trackEvent(event, data) {
  if (!getToken()) return; // 미로그인 시 무시
  if (isSessionOnlyMode()) return; // 공용 PC 모드에서는 서버 전송 안 함
  _queue.push({
    e: event,
    d: data || {},
    t: Date.now()
  });
  if (_queue.length >= MAX_QUEUE) _flush();
  if (!_flushTimer) {
    _flushTimer = setInterval(_flush, FLUSH_INTERVAL);
  }
}

// ── 편의 함수 ──
export function trackStep(step, action) {
  // action: 'enter' | 'complete' | 'fail'
  trackEvent('step', { s: step, a: action });
}

export function trackFeature(feature) {
  // feature: 'voice_gen' | 'footage_search' | 'factcheck' | 'zip_download' | 'key_test' | 'pexels_dl'
  trackEvent('feat', { f: feature });
}

// ── step별 API 호출 추적 (운영 관측성) ──
export function trackApiCall(step, provider, success) {
  // provider: 'claude' | 'gemini' | 'openai' | 'perplexity' | 'tts' | 'elevenlabs' | 'youtube' | 'pexels' | 'ai_studio'
  // success: true | false
  trackEvent('api', { s: step, p: provider, ok: success ? 1 : 0 });
}

// ── 배치 전송 (fire-and-forget) ──
async function _flush() {
  if (!_queue.length) return;

  try {
    const token = getToken();
    if (!token) return;

    const batch = _queue.slice(0, MAX_QUEUE);
    await fetch(CONFIG.PROXY_BASE + '/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ events: batch })
    });

    _queue.splice(0, batch.length);
  } catch (_) {
    // 서버 미지원 또는 네트워크 오류 → 조용히 무시하고 다음 flush 때 재시도
  }
}

// ── 앱 종료 시 잔여 이벤트 전송 ──
export function flushTelemetry() {
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  if (isSessionOnlyMode()) {
    _queue.length = 0; // 공용 PC 모드: 서버 전송 없이 큐만 비움
    return;
  }
  _flush();
}

// 페이지 unload 시 전송 시도
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushTelemetry);
}
