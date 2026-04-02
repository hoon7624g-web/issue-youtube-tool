// ═══════════════════════════════════════════════
// main/config.js — Main process 설정값 (모델명, 제한값 등)
// v3.6.0 — shared-config.json에서 공용 값 import (src/config.js와 자동 동기화)
// ═══════════════════════════════════════════════
const path = require('path');
const shared = require(path.join(__dirname, '..', 'shared-config.json'));

const MAIN_CONFIG = {
  // ── 공용 값 (shared-config.json에서 가져옴) ──
  DEFAULT_GEMINI_MODEL: shared.DEFAULT_GEMINI_MODEL,
  DEFAULT_CLAUDE_MODEL: shared.DEFAULT_CLAUDE_MODEL,
  DEFAULT_OPENAI_MODEL: shared.DEFAULT_OPENAI_MODEL,
  MAX_OUTPUT_TOKENS: shared.MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_SHORT: shared.MAX_OUTPUT_TOKENS_SHORT,
  MAX_PROMPT_CHARS: shared.MAX_PROMPT_CHARS,
  MAX_PROMPT_CHARS_PRO: shared.MAX_PROMPT_CHARS_PRO,

  // ★ v3.5.8: allowlist + 에러 메시지 (shared-config.json 단일 소스)
  ALLOWED_GEMINI_MODELS: new Set(shared.ALLOWED_GEMINI_MODELS || []),
  ALLOWED_CLAUDE_MODELS: new Set(shared.ALLOWED_CLAUDE_MODELS || []),
  ERR: shared.ERROR_MESSAGES || {},

  // ── Main process 전용 (타임아웃) ──
  LLM_TIMEOUT: 300000,
  PERPLEXITY_TIMEOUT: 120000,
};

module.exports = { MAIN_CONFIG };
