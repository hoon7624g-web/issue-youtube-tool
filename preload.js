const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getSubtitle: (videoId) => ipcRenderer.invoke('get-subtitle', videoId),
  getIssueLink: () => ipcRenderer.invoke('get-issuelink'),
  callClaude: (prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-claude', prompt, model, maxTokens, requestId),
  callGemini: (prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-gemini', prompt, model, maxTokens, requestId),
  callGeminiVideo: (videoId, prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-gemini-video', videoId, prompt, model, maxTokens, requestId),
  callOpenAI: (prompt, maxTokens, requestId) =>
    ipcRenderer.invoke('call-openai', prompt, maxTokens, requestId),
  callPerplexity: (prompt, maxTokens, requestId) =>
    ipcRenderer.invoke('call-perplexity', prompt, maxTokens, requestId),

  // YouTube / Pexels IPC (렌더러 키 노출 방지)
  ytFetch: (endpoint, params) => ipcRenderer.invoke('yt-fetch', endpoint, params),
  pexelsSearch: (query) => ipcRenderer.invoke('pexels-search', query),

  // TTS / ElevenLabs IPC (렌더러에 키 노출 방지)
  callTTS: (text, voiceName, gender, speed, requestId) =>
    ipcRenderer.invoke('call-tts', text, voiceName, gender, speed, requestId),
  callElevenLabsTTS: (text, voiceId, speed, requestId) =>
    ipcRenderer.invoke('call-elevenlabs-tts', text, voiceId, speed, requestId),
  uploadElevenLabsVoice: (payload) => ipcRenderer.invoke('upload-elevenlabs-voice', payload),

  // LLM 스트리밍 (4-1) — requestId 기반 이벤트 분리
  callClaudeStream: (prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-claude-stream', prompt, model, maxTokens, requestId),
  callGeminiStream: (prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-gemini-stream', prompt, model, maxTokens, requestId),
  callGeminiVideoStream: (videoId, prompt, model, maxTokens, requestId) =>
    ipcRenderer.invoke('call-gemini-video-stream', videoId, prompt, model, maxTokens, requestId),
  cancelLLMStream: (requestId) => ipcRenderer.invoke('cancel-llm-stream', requestId),
  cancelLLMRequest: (requestId) => ipcRenderer.invoke('cancel-llm-request', requestId),
  cancelTTSRequest: (requestId) => ipcRenderer.invoke('cancel-tts-request', requestId),
  cancelElevenLabsRequest: (requestId) =>
    ipcRenderer.invoke('cancel-elevenlabs-request', requestId),
  // ★ v3.5.8→v3.6.0: onLLMStream 통합 API — done/error 시 3개 리스너 자동 해제
  onLLMStream: (requestId, { onChunk, onDone, onError } = {}) => {
    const cleanups = [];
    let settled = false;
    const autoClean = () => {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
    };

    const chunkHandler = (e, rid, chunk) => {
      if (rid === requestId && onChunk) onChunk(chunk);
    };
    ipcRenderer.on('llm-stream-chunk', chunkHandler);
    cleanups.push(() => ipcRenderer.removeListener('llm-stream-chunk', chunkHandler));

    const doneHandler = (e, rid, fullText) => {
      if (rid === requestId) {
        autoClean();
        if (onDone) onDone(fullText);
      }
    };
    ipcRenderer.on('llm-stream-done', doneHandler);
    cleanups.push(() => ipcRenderer.removeListener('llm-stream-done', doneHandler));

    const errorHandler = (e, rid, error) => {
      if (rid === requestId) {
        autoClean();
        if (onError) onError(error);
      }
    };
    ipcRenderer.on('llm-stream-error', errorHandler);
    cleanups.push(() => ipcRenderer.removeListener('llm-stream-error', errorHandler));

    return autoClean;
  },
  openIndex: () => ipcRenderer.invoke('open-index'),
  openApiGuide: () => ipcRenderer.invoke('open-api-guide'),
  openPerplexity: (query) => ipcRenderer.invoke('open-perplexity', query),

  // ★ v3.6.2 P0-1: API 키 상태 조회 — 비밀 키는 bool/모델은 string 으로만 반환
  // 렌더러는 getApiKeyStatus만 사용. getApiKeys는 호환을 위해 유지하지만 동일하게 status snapshot 반환.
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'), // DEPRECATED — v3.7에서 제거 예정
  setApiKeys: (keys) => ipcRenderer.invoke('set-api-keys', keys),
  deleteApiKey: (keyName) => ipcRenderer.invoke('delete-api-key', keyName),
  clearApiKeys: () => ipcRenderer.invoke('clear-api-keys'),
  migrateApiKeys: (legacyKeys) => ipcRenderer.invoke('migrate-api-keys', legacyKeys),
  setSessionOnlyMode: (enabled) => ipcRenderer.invoke('set-session-only-mode', enabled),

  // 세션 토큰 암호화 저장 (safeStorage)
  getSession: () => ipcRenderer.invoke('get-session'),
  setSession: (s) => ipcRenderer.invoke('set-session', s),
  clearSession: () => ipcRenderer.invoke('clear-session'),

  // 실제 저장 방식 상태 (safeStorage 가용 여부)
  getStorageStatus: () => ipcRenderer.invoke('get-storage-status'),

  // API 키 내보내기/가져오기 (암호화 파일)
  // ★ v3.6.2 P0-1: rendererKeys 인자 제거 — main이 자체 보관 키를 사용
  exportApiKeys: (password) => ipcRenderer.invoke('export-api-keys', password),
  importApiKeys: (password) => ipcRenderer.invoke('import-api-keys', password),

  // API 키 연결 테스트 (Main Process에서 실행 — 렌더러 키 미노출)
  testApiKey: (provider) => ipcRenderer.invoke('test-api-key', provider),
  testApiKeyDirect: (provider, key) => ipcRenderer.invoke('test-api-key-direct', provider, key),

  // FFmpeg 영상 자동 조립
  ffmpegCheck: () => ipcRenderer.invoke('ffmpeg-check'),
  ffmpegAssemble: (params) => ipcRenderer.invoke('ffmpeg-assemble', params),
  onFFmpegProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('ffmpeg-progress', handler);
    return () => ipcRenderer.removeListener('ffmpeg-progress', handler);
  },

  // Remotion 숏폼 영상 생성
  remotionCheck: () => ipcRenderer.invoke('remotion-check'),
  remotionRender: (params) => ipcRenderer.invoke('remotion-render', params),
  remotionRenderThumbnail: (params) => ipcRenderer.invoke('remotion-render-thumbnail', params),
  onRemotionProgress: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('remotion-progress', handler);
    return () => ipcRenderer.removeListener('remotion-progress', handler);
  },

  // ★ v4: 썸네일 생성기 전용 IPC
  remotionThumbnailBatch: (params) => ipcRenderer.invoke('remotion-thumbnail-batch', params),
  remotionThumbnailSaveHQ: (params) => ipcRenderer.invoke('remotion-thumbnail-save-hq', params),
  remotionSelectLocalImage: () => ipcRenderer.invoke('remotion-select-local-image'),
  remotionSelectLogoImage: () => ipcRenderer.invoke('remotion-select-logo-image'),

  // 자동 업데이트
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openUpdatePage: () => ipcRenderer.invoke('open-update-page'),
  onUpdateStatus: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (e, pct) => callback(pct);
    ipcRenderer.on('update-progress', handler);
    return () => ipcRenderer.removeListener('update-progress', handler);
  },
});
