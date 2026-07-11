// ═══════════════════════════════════════════════════════════
// client-proxy.js — barrel re-export
// v3.6.0 — auth / llm / media 3분할 후 기존 import 호환용
// ★ P1-fix: snapshot const → runtime getter 전환
// ═══════════════════════════════════════════════════════════
export {
  // auth
  initSession,
  getSession,
  setSession,
  clearSession,
  getToken,
  getUser,
  initApiKeys,
  getApiKeys,
  setApiKeys,
  hasApiKeys,
  reloadApiKeys,
  isKeySaved,
  onSessionStorageFail,
  cfg,
  hasKey,
  hasYtKey,
  proxyFetch,
  clearRefreshInterval,
  authLogin,
  authSignup,
  checkThrottle,
  fetchWithTimeout,
  // 정적 값
  PROXY_BASE,
  TTS_CHUNK_SIZE,
  TTS_CHUNK_MIN_BREAK,
  // 동적 값 (runtime getter)
  getDefaultGeminiModel,
  getDefaultClaudeModel,
  getDefaultOpenAIModel,
  getMaxPromptChars,
  getMaxPromptCharsPro,
  getMaxOutputTokens,
  getMaxOutputTokensShort,
  // CONFIG 자체 (소비자가 CONFIG.xxx 직접 참조용)
  CONFIG,
} from './client-proxy-auth.js';

export {
  // llm
  callLLM,
  callLLMPro,
  callLLMStream,
  callGeminiVideo,
  callGeminiVideoStream,
  callPerplexity,
  resolveProvider,
} from './client-proxy-llm.js';

export {
  // media
  ytFetch,
  genElevenLabs,
  uploadToElevenLabs,
  patchApi,
  setupVoiceHandlers,
} from './client-proxy-media.js';
