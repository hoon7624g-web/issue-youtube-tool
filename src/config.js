// ═══════════════════════════════════════
// config.js — 환경값 중앙 관리
// v3.6.0 — 모델명/제한값은 shared-config.json에서 가져옴 (main/config.js와 자동 동기화)
// ═══════════════════════════════════════
import shared from '../shared-config.json';

export const CONFIG = {
  // ── 서버 URL ──
  // 빌드 시 VITE_PROXY_BASE 로 오버라이드 가능(.env 참고). 미설정 시 기본값 사용.
  PROXY_BASE: import.meta.env.VITE_PROXY_BASE || 'https://wotseowsskgobnusiacg.supabase.co/functions/v1/proxy',

  // ── 공용 값 (shared-config.json — 기본값, 서버에서 동적 갱신 가능) ──
  DEFAULT_GEMINI_MODEL: shared.DEFAULT_GEMINI_MODEL,
  DEFAULT_CLAUDE_MODEL: shared.DEFAULT_CLAUDE_MODEL,
  DEFAULT_OPENAI_MODEL: shared.DEFAULT_OPENAI_MODEL,
  MAX_PROMPT_CHARS: shared.MAX_PROMPT_CHARS,
  MAX_PROMPT_CHARS_PRO: shared.MAX_PROMPT_CHARS_PRO,
  MAX_OUTPUT_TOKENS: shared.MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_SHORT: shared.MAX_OUTPUT_TOKENS_SHORT,

  // ── TTS 설정 ──
  TTS_CHUNK_SIZE: 1500,
  TTS_CHUNK_MIN_BREAK: 500,

  // ── 클라이언트 쓰로틀링 ──
  API_RATE_LIMIT: 20,
  API_RATE_WINDOW: 60000,

  // ── SSE 스트리밍 ──
  // 부분 응답 임계값 — 이 길이 이상이면 스트림 에러 시에도 부분 결과를 성공 취급
  // 너무 짧으면 JSON 파싱 실패 확률 높고, 너무 길면 정상 결과를 버리게 됨
  // 롱폼 대본 최소 유효 길이 기준 (제목+첫 문단 정도)
  SSE_PARTIAL_THRESHOLD: 500,

  // ── 비밀번호 규칙 ──
  PW_MIN_LENGTH: 8,
  PW_REQUIRE_ALPHA: true,
  PW_REQUIRE_DIGIT: true,
};

// ★ v3.5.8: 서버 응답 모델명을 allowlist로 검증 (shared-config.json 단일 소스)
const ALLOWED_GEMINI_MODELS = new Set(shared.ALLOWED_GEMINI_MODELS || []);
const ALLOWED_CLAUDE_MODELS = new Set(shared.ALLOWED_CLAUDE_MODELS || []);

// P2-19: 서버에서 최신 모델명/설정값을 가져와 CONFIG에 병합 (부팅 시 1회)
export async function fetchServerConfig() {
  try {
    // ★ Fix: Electron file://에서 Origin: null → X-App-Client 헤더 필수 (P1-6 CORS 강화 대응)
    const headers = {
      'X-App-Client': (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron) ? 'electron' : 'dev'
    };
    const r = await fetch(CONFIG.PROXY_BASE + '/api/config', { headers, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const data = await r.json();
    // ★ v3.5.8: allowlist 검증 — 서버 오작동/잘못된 값 전파 방지
    if (data.DEFAULT_GEMINI_MODEL && ALLOWED_GEMINI_MODELS.has(data.DEFAULT_GEMINI_MODEL)) {
      CONFIG.DEFAULT_GEMINI_MODEL = data.DEFAULT_GEMINI_MODEL;
    }
    if (data.DEFAULT_CLAUDE_MODEL && ALLOWED_CLAUDE_MODELS.has(data.DEFAULT_CLAUDE_MODEL)) {
      CONFIG.DEFAULT_CLAUDE_MODEL = data.DEFAULT_CLAUDE_MODEL;
    }
    if (data.MAX_OUTPUT_TOKENS && typeof data.MAX_OUTPUT_TOKENS === 'number'
        && data.MAX_OUTPUT_TOKENS > 0 && data.MAX_OUTPUT_TOKENS <= 32768) {
      CONFIG.MAX_OUTPUT_TOKENS = data.MAX_OUTPUT_TOKENS;
    }
    if (data.MAX_OUTPUT_TOKENS_SHORT && typeof data.MAX_OUTPUT_TOKENS_SHORT === 'number'
        && data.MAX_OUTPUT_TOKENS_SHORT > 0 && data.MAX_OUTPUT_TOKENS_SHORT <= 16384) {
      CONFIG.MAX_OUTPUT_TOKENS_SHORT = data.MAX_OUTPUT_TOKENS_SHORT;
    }
  } catch (e) {
    console.warn('[Config] server config fallback:', e.message || e);
  }
}
