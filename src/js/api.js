// ═══════════════════════════════════════
// api.js — API 호출 (ES Module)
// ═══════════════════════════════════════
import { mockWait as wait, extractJSON, cleanAI, toast } from './utils.js';
import { S, sSet } from './state.js';
import { K } from './constants.js';
import { M } from './mock-data.js';
import { PROMPT } from './prompts.js';
import { cacheGet, cacheSet } from './cache.js';
import {
  cfg, hasKey, getApiKeys, authLogin, callLLM,
  callLLMStream, callGeminiVideo, callGeminiVideoStream, callPerplexity,
  proxyFetch
} from '../client-proxy.js';

// ── 분석 결과 파싱 (공용) ──
function parseAnalysisResult(t) {
  const j = extractJSON(t);
  if (j) {
    let summary = j.summary;
    if (Array.isArray(summary)) summary = summary.join(' ');
    if (typeof summary === 'string' && summary.length > 10) {
      return {
        summary: cleanAI(summary),
        hooks: Array.isArray(j.hooks) ? j.hooks.map(h => cleanAI(h)) : ['분석 결과를 확인하세요'],
        structure: Array.isArray(j.structure) ? j.structure.map(s => cleanAI(s)) : ['전체 내용 참조'],
        reasons: Array.isArray(j.reasons) ? j.reasons.map(r => cleanAI(r)) : ['AI 분석 완료']
      };
    }
  }
  let cleaned = (t || '').replace(/```[a-z]*|```/g, '').replace(/^\s*\{[\s\S]*$/, '').trim();
  if (cleaned.length < 30) cleaned = (t || '').replace(/```[a-z]*|```/g, '').substring(0, 500);
  console.warn('[Analyze] JSON parse failed, using text fallback');
  return { summary: cleanAI(cleaned.substring(0, 500)) || '분석 완료', hooks: ['분석 결과를 확인하세요'], structure: ['전체 내용 참조'], reasons: ['AI 분석 완료'] };
}

function finalizeAnalysisMeta(result, meta = {}) {
  const out = result && typeof result === 'object' ? { ...result } : { ...parseAnalysisResult('') };
  if (!out._method) out._method = meta.method || 'title_only';
  if (meta.requestedMethod) out._requestedMethod = meta.requestedMethod;
  if (meta.usedFallback) out._usedFallback = true;
  if (meta.fallbackReason) out._fallbackReason = String(meta.fallbackReason);
  return out;
}

function resolveFallbackMethod(transcript) {
  const raw = typeof transcript === 'string' ? transcript : '';
  return raw.trim().length > 50 ? 'subtitle' : 'title_only';
}

const _fallbackNoticeShown = new Set();

function showFallbackNoticeOnce(key, message) {
  if (!key || !message || _fallbackNoticeShown.has(key)) return;
  _fallbackNoticeShown.add(key);
  toast(message);
}

// ── JSON 파싱 실패 시 1회 재시도 래퍼 ──
async function callLLMWithJsonRetry(prompt, parseFn, fallback, options = {}) {
  const raw = await callLLM(prompt, { signal: options.signal });
  const parsed = parseFn(raw);
  if (parsed !== null) return parsed;
  console.warn('[JSON retry] First attempt failed, retrying...');
  const retryPrompt = prompt + '\n\n[중요] 이전 응답이 올바른 JSON이 아니었습니다. 반드시 순수 JSON만 응답하세요. 마크다운 코드블록(```)으로 감싸지 마세요.';
  const raw2 = await callLLM(retryPrompt, { signal: options.signal });
  const parsed2 = parseFn(raw2);
  if (parsed2 !== null) return parsed2;

  console.warn('[JSON retry] Retry failed, using fallback');
  showFallbackNoticeOnce(options.noticeKey, options.noticeMessage);
  return fallback;
}

// ── 숏폼 JSON 파싱 (공통) ──
function _parseShortsJSON(t) {
  const j = extractJSON(t);
  if (Array.isArray(j) && j.length > 0) return j;
  if (j && Array.isArray(j.shorts) && j.shorts.length > 0) return j.shorts;
  return null;
}

// ★ P2-14: LLM 응답에서 title+content JSON 또는 텍스트 fallback 파싱 (중복 제거)
function parseLLMScript(rawText) {
  const clean = (rawText || '').replace(/```[a-z]*|```/g, '').trim();
  try {
    const j = JSON.parse(clean);
    if (j.title && j.content) return { title: cleanAI(j.title), content: cleanAI(j.content) };
  } catch(e) { /* not JSON */ }
  const lines = clean.split('\n');
  let title = cleanAI(lines[0].replace(/^#+\s*|^\*+\s*/g, '').trim());
  let content = cleanAI(lines.slice(1).join('\n').trim());
  if (!content || content.length < 100) { content = cleanAI(clean); title = 'AI 생성 대본'; }
  return { title, content };
}

async function _genShortsWithRetry(prompt, { signal } = {}) {
  const result = await callLLMWithJsonRetry(prompt, _parseShortsJSON, [], {
      noticeKey: 'gen-shorts-json-fallback',
      noticeMessage: '숏폼 대본 생성에 실패했습니다. 롱폼 대본은 정상 생성됩니다.',
      signal,
    });
  return (result || []).map(s => ({ title: cleanAI(s.title || ''), content: cleanAI(s.content || '') }));
}

function normalizeFactCheckItem(item) {
  if (!item || typeof item !== 'object') return null;
  const text = cleanAI(item.text || '').trim();
  const note = cleanAI(item.note || '').trim();
  const rawStatus = typeof item.st === 'string' ? item.st.trim().toLowerCase() : '';
  const st = rawStatus === 'safe' || rawStatus === 'warning' || rawStatus === 'uncertain' ? rawStatus : 'uncertain';
  if (!text && !note) return null;
  return { text, note, st };
}

function normalizeFootageSceneItem(item) {
  if (!item || typeof item !== 'object') return null;
  const rawAltEn = Array.isArray(item.altEn)
    ? item.altEn
    : (typeof item.altEn === 'string' ? item.altEn.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const altEn = Array.from(new Set(rawAltEn.filter((x) => typeof x === 'string').map((x) => cleanAI(x).trim()).filter(Boolean))).slice(0, 8);
  const normalized = {
    scene: typeof item.scene === 'string' ? cleanAI(item.scene).trim() : '',
    text: cleanAI(item.text || '').trim(),
    purpose: cleanAI(item.purpose || '').trim(),
    label: cleanAI(item.label || '').trim(),
    ko: cleanAI(item.ko || '').trim(),
    cut: typeof item.cut === 'string' ? cleanAI(item.cut).trim() : '',
    mainEn: typeof item.mainEn === 'string' ? cleanAI(item.mainEn).trim() : '',
    altEn,
  };
  if (!normalized.scene && !normalized.text && !normalized.purpose && !normalized.label && !normalized.ko && !normalized.cut && !normalized.mainEn && !normalized.altEn.length) {
    return null;
  }
  return normalized;
}

export const Api = {
  login: (email, password) => {
    if (!email || !password) return Promise.reject(new Error('이메일과 비밀번호를 입력하세요'));
    return authLogin(email, password).then(user => {
      return { id: user.id, name: user.name || user.email, email: user.email, role: user.role || 'user', cohort: user.cohort || '' };
    }).catch(e => {
      if (e.message === 'Failed to fetch' || e.message === '프록시 미연결') {
        throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.');
      }
      throw e;
    });
  },

  getKw: () => {
    return wait(400).then(() => {
      let stored; try { stored = JSON.parse(localStorage.getItem('yt_a_kw')); } catch(e) {}
      return (stored || M.keywords).filter(k => { return k.on !== false; });
    });
  },

  getIssueLink: async () => {
    // 클라이언트 캐시 (10분 — 서버도 10분 캐시하므로 부담 없음)
    const cached = cacheGet('issueLink', 600000);
    if (cached) return cached;
    const _store = (d) => { cacheSet('issueLink', d); return d; };

    // 1순위: 서버 프록시 경유 (안정적 — 서버에서 크롤링 + 캐시)
    try {
      const r = await proxyFetch('/api/issuelink');
      if (r.ok) {
        const d = await r.json();
        if (d.hotKeywords && d.hotKeywords.length > 0) {
          if (d._stale) console.log('[IssueLink] 서버 만료 캐시 사용');
          return _store({ hotKeywords: d.hotKeywords, source: d.source || 'issuelink', posts: [] });
        }
      }
    } catch (e) { console.warn('[IssueLink] 서버 요청 실패:', e.message); }

    // 2순위: Electron IPC 직접 크롤링 (서버 불가 시 fallback)
    if (window.electronAPI && window.electronAPI.isElectron && window.electronAPI.getIssueLink) {
      try {
        const d = await window.electronAPI.getIssueLink();
        if (d.hotKeywords && d.hotKeywords.length > 0) {
          return _store({ hotKeywords: d.hotKeywords, source: 'issuelink', posts: [] });
        }
      } catch (e) { console.warn('[IssueLink] IPC 실패:', e.message); }
    }

    return { hotKeywords: [], source: 'none', posts: [] };
  },

  getSubtitle: videoId => {
    if (!videoId) return Promise.resolve({ text: '', error: 'no videoId' });
    if (window.electronAPI && window.electronAPI.isElectron) {
      return window.electronAPI.getSubtitle(videoId).then(d => { if (d.error) console.warn('Subtitle:', d.error); return d; });
    }
    // 웹 환경: 서버 프록시 경유 (GAS_URL은 서버 환경변수로 관리)
    return proxyFetch('/api/gas?action=subtitle&videoId=' + encodeURIComponent(videoId)).then(r => { return r.json(); }).then(d => { if (d.error) console.warn('Subtitle:', d.error); return d; }).catch(e => { console.error('Subtitle error:', e); return { text: '', error: e.message }; });
  },

  // NOTE: getVids, genVoice, genThumb은 mock 기본값.
  // client-proxy.js의 patchApi()가 런타임에 실제 API 구현으로 덮어씀.
  getVids: (kwLabels, duration) => {
    return wait(600).then(() => { return M.videos.slice().sort((a, b) => { return b.score - a.score; }); });
  },

  analyze: (v, transcript, { signal } = {}) => {
    if (!hasKey('llm')) return wait(2000).then(() => { return Object.assign({}, M.analysis, { _isDemo: true }); });
    const keys = getApiKeys();
    const gaiKey = keys.googleAiStudio || keys.gemini;
    const fallbackMethod = resolveFallbackMethod(transcript);
    if (gaiKey && v.id) {
      return callGeminiVideo(v.id, PROMPT.ANALYZE_VIDEO(v), { signal })
        .then(raw => finalizeAnalysisMeta(parseAnalysisResult(raw), { method: 'video', requestedMethod: 'video' }))
        .catch(e => {
          return Api._analyzeFallback(v, transcript, { signal }).then(result => finalizeAnalysisMeta(result, {
            method: fallbackMethod,
            requestedMethod: 'video',
            usedFallback: true,
            fallbackReason: e && e.message ? e.message : e
          }));
        });
    }
    return Api._analyzeFallback(v, transcript, { signal }).then(result => finalizeAnalysisMeta(result, { method: fallbackMethod }));
  },

  // ── 영상 분석 (스트리밍 — 실시간 텍스트 표시) ──
  analyzeStream: async (v, transcript, onChunk, { signal } = {}) => {
    if (!hasKey('llm')) { await wait(2000); return Object.assign({}, M.analysis, { _isDemo: true }); }
    const keys = getApiKeys();
    const gaiKey = keys.googleAiStudio || keys.gemini;
    const fallbackMethod = resolveFallbackMethod(transcript);
    if (gaiKey && v.id) {
      try {
        const rawText = await callGeminiVideoStream(v.id, PROMPT.ANALYZE_VIDEO(v), {
          signal,
          onChunk: (chunk, fullSoFar) => {
            if (onChunk) onChunk(chunk, fullSoFar);
          }
        });
        return finalizeAnalysisMeta(parseAnalysisResult(rawText), { method: 'video', requestedMethod: 'video' });
      } catch (e) {
        const fallback = await Api._analyzeFallback(v, transcript, { signal });
        return finalizeAnalysisMeta(fallback, {
          method: fallbackMethod,
          requestedMethod: 'video',
          usedFallback: true,
          fallbackReason: e && e.message ? e.message : e
        });
      }
    }
    const fallback = await Api._analyzeFallback(v, transcript, { signal });
    return finalizeAnalysisMeta(fallback, { method: fallbackMethod });
  },

  _analyzeFallback: async (v, transcript, { signal } = {}) => {
    const prompt = PROMPT.ANALYZE_TEXT(v, transcript);
    const strictParse = (t) => {
      const j = extractJSON(t);
      if (j && typeof j.summary === 'string' && j.summary.length > 10 && Array.isArray(j.hooks)) return j;
      return null;
    };
    const result = await callLLMWithJsonRetry(prompt, strictParse, null, {
      noticeKey: 'analyze-json-fallback',
      noticeMessage: '영상 분석 응답 형식이 불안정해 텍스트 fallback으로 보정했습니다.',
      signal,
    });
    const parsed = result ? parseAnalysisResult(JSON.stringify(result)) : parseAnalysisResult(await callLLM(prompt, { signal }));
    return finalizeAnalysisMeta(parsed, { method: resolveFallbackMethod(transcript) });
  },

  genScript: (ana, sty, styPrompt) => {
    if (!hasKey('llm')) return wait(2500).then(() => { return Object.assign({}, M.script, { _isDemo: true }); });
    const styleBlock = PROMPT.buildStyleBlock(sty, styPrompt);
    const transcriptBlock = PROMPT.buildTranscriptBlock(S.video.transcript);
    const prompt = PROMPT.GEN_SHORT_SINGLE(ana, styleBlock, transcriptBlock);
    return callLLM(prompt).then(t => parseLLMScript(t));
  },

  // ★ P2-15: async/await 통일 (.then 체이닝 제거)
  genScriptDual: async (ana, sty, styPrompt) => {
    if (!hasKey('llm')) { await wait(2500); return { longform: Object.assign({}, M.script, { _isDemo: true }), shorts: [], _isDemo: true }; }
    const styleBlock = PROMPT.buildStyleBlock(sty, styPrompt);
    const transcriptBlock = PROMPT.buildTranscriptBlock(S.video.transcript);
    const anaBlock = PROMPT.buildAnaBlock(ana);
    const lfPrompt = PROMPT.GEN_LONGFORM(ana, styleBlock, transcriptBlock);

    const lfRaw = await callLLM(lfPrompt);
    const longform = parseLLMScript(lfRaw);

    const sfPrompt = PROMPT.GEN_SHORTS_FROM_LONGFORM(longform.title, longform.content, anaBlock);
    let shorts = [];
    try { shorts = await _genShortsWithRetry(sfPrompt); }
    catch(e) { console.warn('[genShorts] failed:', e.message); }
    return { longform, shorts };
  },

  // ── 4-1: 스트리밍 대본 생성 (롱폼만 실시간 표시, 숏폼은 기존 방식) ──
  genScriptDualStream: async (ana, sty, styPrompt, onLfChunk, onShortsStart, { signal } = {}) => {
    if (!hasKey('llm')) { await wait(2500); return { longform: Object.assign({}, M.script, { _isDemo: true }), shorts: [], _isDemo: true }; }
    const styleBlock = PROMPT.buildStyleBlock(sty, styPrompt);
    const transcriptBlock = PROMPT.buildTranscriptBlock(S.video.transcript);
    const anaBlock = PROMPT.buildAnaBlock(ana);
    const lfPrompt = PROMPT.GEN_LONGFORM(ana, styleBlock, transcriptBlock);

    // 1단계: 롱폼 스트리밍 생성
    const rawText = await callLLMStream(lfPrompt, {
      signal,
      onChunk: (chunk, fullSoFar) => {
        if (onLfChunk) onLfChunk(chunk, fullSoFar);
      }
    });

    // 롱폼 파싱
    const longform = parseLLMScript(rawText);

    // 2단계: 숏폼 5개 (JSON 재시도 적용)
    if (onShortsStart) onShortsStart(longform);
    let shorts = [];
    try {
      const sfPrompt = PROMPT.GEN_SHORTS_FROM_LONGFORM(longform.title, longform.content, anaBlock);
      shorts = await _genShortsWithRetry(sfPrompt, { signal });
    } catch (e) {
      console.warn('[genShorts] failed:', e.message);
    }

    return { longform, shorts };
  },

  genShortsOnly: async (ana, sty, styPrompt, { signal } = {}) => {
    if (!hasKey('llm')) { await wait(2500); return { longform: null, shorts: [], _isDemo: true }; }
    const styleBlock = PROMPT.buildStyleBlock(sty, styPrompt);
    const anaBlock = PROMPT.buildAnaBlock(ana);
    const transcriptBlock = (S.video.transcript && S.video.transcript.length > 50)
      ? '\n[원본 자막]\n' + S.video.transcript.substring(0, 3000) + '\n' : '';

    const prompt = PROMPT.GEN_SHORTS_ONLY(anaBlock, styleBlock, transcriptBlock);
    const shorts = await _genShortsWithRetry(prompt, { signal });
    return { longform: null, shorts: shorts };
  },

  factCheck: async (sc, { signal } = {}) => {
    if (!hasKey('llm')) { await wait(1800); const demo = M.fcs.slice(); demo._isDemo = true; return demo; }
    const videoTitle = S.video.sv ? S.video.sv.title : '';
    const trimmedSc = sc.length > 4000 ? sc.substring(0, 4000) + '\n[... 이하 생략]' : sc;
    const trimmedT = (S.video.transcript && S.video.transcript.length > 50)
      ? '\n[원본 자막]\n' + S.video.transcript.substring(0, 2000) + '\n' : '';
    const prompt = PROMPT.FACTCHECK(videoTitle, trimmedSc, trimmedT);
    const parseFc = t => {
      const j = extractJSON(t);
      if (!Array.isArray(j)) return null;
      const normalized = j.map(normalizeFactCheckItem).filter(Boolean);
      return j.length > 0 && !normalized.length ? null : normalized;
    };
    const keys = getApiKeys();
    if (keys.perplexity) {
      try {
        const raw = await callPerplexity(prompt, { signal });
        const result = parseFc(raw);
        if (!result) throw new Error('Perplexity 팩트체크 응답을 파싱할 수 없습니다');
        sSet({ [K.SCRIPT_FACT_CHECKED_BY]: 'perplexity' });
        return result;
      } catch (e) {
        sSet({ [K.SCRIPT_FACT_CHECKED_BY]: 'llm' });
      }
    } else {
      sSet({ [K.SCRIPT_FACT_CHECKED_BY]: 'llm' });
    }
    // ★ P2-fix: mock fallback 제거 — 파싱 실패 시 null 반환 후 throw
    const fcResult = await callLLMWithJsonRetry(prompt, parseFc, null, {
      noticeKey: 'factcheck-json-fallback',
      noticeMessage: '팩트체크 응답 형식이 불안정합니다. 다시 시도해주세요.',
      signal,
    });
    if (fcResult == null) throw new Error('팩트체크 AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    return fcResult;
  },

  extractKw: async (sc, { signal } = {}) => {
    if (!hasKey('llm')) { await wait(1200); const demo = M.ekw.slice(); demo._isDemo = true; return demo; }
    const videoTitle = S.video.sv ? S.video.sv.title : '';
    const trimLimit = sc.length > 3000 ? 8000 : 3000;
    const trimmed = sc.length > trimLimit ? sc.substring(0, trimLimit) + '\n\n[... 이하 생략, 총 ' + sc.length + '자]' : sc;
    const prompt = PROMPT.EXTRACT_KW(videoTitle, trimmed);
    const parseKw = t => {
      const j = extractJSON(t);
      if (!Array.isArray(j)) return null;
      const normalized = j.map(normalizeFootageSceneItem).filter(Boolean);
      return j.length > 0 && !normalized.length ? null : normalized;
    };
    // ★ P2-fix: mock fallback 제거 — 파싱 실패 시 null 반환 후 throw
    const ekwResult = await callLLMWithJsonRetry(prompt, parseKw, null, {
      noticeKey: 'extractkw-json-fallback',
      noticeMessage: '풋티지 브리프 응답 형식이 불안정합니다. 다시 시도해주세요.',
      signal,
    });
    if (ekwResult == null) throw new Error('풋티지 브리프 AI 응답을 파싱할 수 없습니다. 다시 시도해주세요.');
    return ekwResult;
  },

  getTrends: () => { return Promise.resolve([]); },
  genVoice: (text, voiceId) => { return wait(2000).then(() => { return M.voice; }); },
  genThumb: (title, script) => { return wait(1500).then(() => { return ['충격! ' + title, '이것만 알면 인생이 바뀝니다', '아무도 몰랐던 진실']; }); }
};

// ★ Fix #11 + P2-9: 길이 내림차순 정렬 후 짧은 키워드가 이미 유지된 긴 키워드에 포함되는지만 확인
export function smartDedup(labels) {
  // 긴 키워드 우선 — 짧은 키워드가 긴 키워드의 부분 문자열이면 제거
  const sorted = [...labels].sort((a, b) => b.length - a.length);
  const kept = [];
  for (const item of sorted) {
    const isDuplicate = kept.some(longer => longer.indexOf(item) !== -1);
    if (!isDuplicate) kept.push(item);
  }
  // 원래 순서 유지 — Set으로 O(1) 조회
  const keptSet = new Set(kept);
  return labels.filter(a => keptSet.has(a));
}
