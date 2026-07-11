// ═══════════════════════════════════════════════════════════
// client-proxy-media.js — YouTube, ElevenLabs, TTS, patchApi
// v3.6.0 — async/await 전환
//
// 보안 참고: ElevenLabs/TTS는 Electron IPC를 우선 사용.
// 웹 환경에서는 렌더러에서 직접 fetch (개발/테스트 전용).
// ═══════════════════════════════════════════════════════════
import { toast, mockWait as wait, b64toBlob, friendlyError, scoreVids } from './js/utils.js';

// ── 웹 fallback 경고 (1회만) ──
// ★ P1-13: Electron 앱에서 IPC 미연결 시 직접 fetch 차단 (llm 쪽과 동일 정책)
const _webFallbackWarned = {};
function _warnWebFallback(provider) {
  if (window.electronAPI && window.electronAPI.isElectron) {
    throw new Error(provider + ' IPC 연결 실패 — 앱을 재시작해주세요. (preload 로드 오류)');
  }
  if (_webFallbackWarned[provider]) return;
  _webFallbackWarned[provider] = true;
  console.warn(
    '[보안 경고] ' +
      provider +
      ' API를 브라우저에서 직접 호출합니다. API 키가 DevTools에 노출될 수 있습니다. 프로덕션에서는 Electron 빌드를 사용하세요.'
  );
}

function _createRequestId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function _abortError() {
  return new Error('사용자가 작업을 취소했습니다.');
}

async function _invokeAbortableMedia(invokeFactory, cancelFactory, signal) {
  const requestId = _createRequestId();
  if (!signal) return invokeFactory(requestId);
  if (signal.aborted) throw _abortError();

  let removeAbort = () => {};
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => {
      Promise.resolve(cancelFactory(requestId)).catch(() => {});
      reject(_abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbort = () => {
      try {
        signal.removeEventListener('abort', onAbort);
      } catch (_) {}
    };
  });

  try {
    return await Promise.race([Promise.resolve(invokeFactory(requestId)), abortPromise]);
  } finally {
    removeAbort();
  }
}
import { S, sSet } from './js/state.js';
import { M } from './js/mock-data.js';
import { registerAction } from './js/router.js';
import { shared } from './js/shared.js';
import {
  checkThrottle,
  getApiKeys,
  hasYtKey,
  hasKey,
  proxyFetch,
  TTS_CHUNK_SIZE,
  TTS_CHUNK_MIN_BREAK,
  fetchWithTimeout,
} from './client-proxy-auth.js';
import { callLLM } from './client-proxy-llm.js';
import { cacheGet, cacheSet } from './js/cache.js';

// ── YouTube API ──
// ★ P2-fix: signal 파라미터 추가 — 취소/timeout 지원
export async function ytFetch(endpoint, params, { signal } = {}) {
  params = params || {};
  // Electron: Main IPC로 키 노출 방지
  if (window.electronAPI && window.electronAPI.ytFetch) {
    const r = await window.electronAPI.ytFetch(endpoint, params);
    // IPC 경로에서는 signal 직접 전달 불가 — 반환 후 signal 체크
    if (signal && signal.aborted) throw new Error('사용자가 작업을 취소했습니다.');
    if (r.status === 403) {
      const reason =
        (r.data &&
          r.data.error &&
          r.data.error.errors &&
          r.data.error.errors[0] &&
          r.data.error.errors[0].reason) ||
        '';
      if (reason === 'quotaExceeded')
        throw new Error(
          'YouTube API 일일 할당량을 초과했습니다. 한국 시간 오후 4시경(태평양 자정)에 초기화됩니다.'
        );
      throw new Error('YouTube API 키가 유효하지 않습니다. 설정을 확인해주세요.');
    }
    if (r.status === 400) throw new Error((r.data && r.data.error) || 'YouTube API 요청 오류');
    if (r.status >= 400) throw new Error('YouTube API 오류: ' + r.status);
    return r.data;
  }
  // 웹 환경 (개발/테스트 전용)
  _warnWebFallback('YouTube');
  const keys = getApiKeys();
  if (!keys.youtube) throw new Error('YouTube API 키를 설정해주세요');
  params.key = keys.youtube;
  const qs = Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&');
  const r = await fetch(
    'https://www.googleapis.com/youtube/v3/' + endpoint + '?' + qs,
    signal ? { signal } : undefined
  );
  if (r.status === 403) {
    try {
      const d = await r.json();
      const reason =
        (d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason) || '';
      if (reason === 'quotaExceeded')
        throw new Error(
          'YouTube API 일일 할당량을 초과했습니다. 한국 시간 오후 4시경(태평양 자정)에 초기화됩니다.'
        );
    } catch (e) {
      if (e.message.includes('할당량')) throw e;
    }
    throw new Error('YouTube API 키가 유효하지 않습니다. 설정을 확인해주세요.');
  }
  if (r.status === 400) throw new Error('YouTube API 요청 오류');
  if (!r.ok) throw new Error('YouTube API 오류: ' + r.status);
  return r.json();
}

// ── ElevenLabs ──
export async function genElevenLabs(text, voiceId, { signal } = {}) {
  checkThrottle();
  const keys = getApiKeys();
  if (!keys.elevenlabs) throw new Error('ElevenLabs API 키를 설정해주세요.');
  if (!voiceId) throw new Error('ElevenLabs 음성 ID가 없습니다.');
  if (window.electronAPI && window.electronAPI.callElevenLabsTTS) {
    const elSpeed = S.voice.voiceSpeed || 1.0;
    const r = await _invokeAbortableMedia(
      (requestId) =>
        window.electronAPI.callElevenLabsTTS(text.substring(0, 5000), voiceId, elSpeed, requestId),
      (requestId) =>
        window.electronAPI.cancelElevenLabsRequest
          ? window.electronAPI.cancelElevenLabsRequest(requestId)
          : Promise.resolve(),
      signal
    );
    if (!r) throw new Error('ElevenLabs IPC 응답 없음');
    if (r.cancelled) throw _abortError();
    if (r.status === 401) throw new Error('ElevenLabs API 키가 유효하지 않습니다.');
    if (r.error) throw new Error(r.error);
    if (!r.audioBase64) throw new Error('ElevenLabs 응답에 오디오 데이터가 없습니다');
    const blob = b64toBlob(r.audioBase64, 'audio/mp3');
    return {
      url: URL.createObjectURL(blob),
      blob,
      dur: Math.round(text.length / 6),
      provider: 'ElevenLabs',
      voiceName: '프리미엄 음성',
    };
  }
  _warnWebFallback('ElevenLabs');
  const r = await fetchWithTimeout(
    'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': keys.elevenlabs },
      body: JSON.stringify({
        text: text.substring(0, 5000),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.6,
          style: 0.25,
          use_speaker_boost: true,
        },
        speed: S.voice.voiceSpeed || 1.0,
      }),
      signal,
    },
    120000,
    signal
  );
  if (r.status === 401) throw new Error('ElevenLabs API 키가 유효하지 않습니다.');
  if (r.status === 402)
    throw new Error(
      'ElevenLabs 크레딧이 부족합니다. elevenlabs.io에서 무료 한도를 확인하거나 크레딧을 충전해주세요.'
    );
  if (r.status === 429)
    throw new Error('ElevenLabs 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
  if (!r.ok) throw new Error('ElevenLabs 오류: ' + r.status);
  const blob = await r.blob();
  return {
    url: URL.createObjectURL(blob),
    blob,
    dur: Math.round(text.length / 6),
    provider: 'ElevenLabs',
    voiceName: '프리미엄 음성',
  };
}

export async function uploadToElevenLabs(file) {
  const keys = getApiKeys();
  if (!keys.elevenlabs) throw new Error('ElevenLabs API 키를 설정해주세요.');

  // ── Electron: Main IPC 경유 (렌더러 키 미노출) ──
  if (window.electronAPI && window.electronAPI.uploadElevenLabsVoice) {
    // ★ P2-20: Uint8Array 직접 전달 (Array.from 숫자 배열 변환 제거 — 메모리 복제 방지)
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await window.electronAPI.uploadElevenLabsVoice({
      name: file.name || 'voice.mp3',
      type: file.type || 'audio/mpeg',
      bytes,
    });
    if (!result || !result.ok)
      throw new Error((result && result.error) || 'ElevenLabs 업로드 실패');
    return result.voiceId;
  }

  // ── 웹 fallback ──
  // ★ P1-fix: Electron 환경에서 IPC 없으면 fail closed (키 노출 차단)
  _warnWebFallback('ElevenLabs');
  const formData = new FormData();
  formData.append('name', '내 목소리 - ' + new Date().toLocaleDateString('ko'));
  formData.append('files', file);
  formData.append('description', 'Issue YouTube Tool custom voice');
  const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': keys.elevenlabs },
    body: formData,
  });
  if (!r.ok) throw new Error('ElevenLabs 업로드 오류: ' + r.status);
  const d = await r.json();
  return d.voice_id;
}

// ── Api 패치 (ApiObj를 파라미터로 받아 순환 import 방지) ──
export function patchApi(ApiObj) {
  if (!ApiObj || ApiObj.__proxyPatched) return;

  // Google Trends (4-3: 10분 캐시)
  ApiObj.getTrends = async () => {
    const cached = cacheGet('realtimeKw', 600000);
    if (cached) return cached;
    try {
      const r = await proxyFetch('/api/realtime-keywords');
      if (!r.ok) throw new Error('RealtimeKW: ' + r.status);
      const d = await r.json();
      const result = {
        zum: d.zum || [],
        nate: d.nate || [],
        google: d.google || [],
        source: d.source || 'adsensefarm',
      };
      cacheSet('realtimeKw', result);
      return result;
    } catch (e) {
      console.error('[RealtimeKW]', e.message);
      return { zum: [], nate: [], google: [], source: 'error' };
    }
  };

  // YouTube 검색
  ApiObj.getVids = async (kwLabels, duration, period) => {
    if (!hasYtKey()) {
      toast('YouTube API 키를 설정하면 실시간 영상을 검색합니다', 'err');
      await wait(600);
      const demo = M.videos.slice().sort((a, b) => b.score - a.score);
      demo._isDemo = true;
      return demo;
    }
    const days = {
      '1d': 1,
      '2d': 2,
      '3d': 3,
      '4d': 4,
      '5d': 5,
      '6d': 6,
      '7d': 7,
      '30d': 30,
      '1y': 365,
      '2y': 730,
      '3y': 1095,
      '4y': 1460,
      '5y': 1825,
    };
    const d = new Date();
    d.setDate(d.getDate() - (days[period] || 7));
    const since = d.toISOString();
    const mergedQ = kwLabels.join('|');

    // eslint-disable-next-line no-useless-catch -- mock fallback 제거 후 의도적으로 남긴 rethrow 지점(하단 catch 주석 참조)
    try {
      // ★ 개선: maxResults 50 (API 쿼터 동일) + 숏폼은 서버 필터 적용
      // YouTube videoDuration: 'short' (<4분), 'medium' (4~20분), 'long' (>20분)
      // 앱의 '롱폼'은 4분+ 이므로 medium+long을 한 번에 못 걸러서, 50개 받아 클라이언트 필터링
      // 앱의 '숏폼'은 <4분 = YouTube 'short'와 정확히 일치 → 서버 필터 사용
      const searchParams = {
        part: 'snippet',
        q: mergedQ,
        type: 'video',
        order: 'viewCount',
        publishedAfter: since,
        maxResults: 50,
        regionCode: 'KR',
        relevanceLanguage: 'ko',
      };
      if (duration === 'short') searchParams.videoDuration = 'short';
      const searchData = await ytFetch('search', searchParams);
      let allItems = searchData.items || [];

      // 중복 제거
      const seen = {};
      allItems = allItems.filter((i) => {
        const vid = i.id.videoId;
        if (vid && !seen[vid]) {
          seen[vid] = true;
          return true;
        }
        return false;
      });
      const ids = allItems.map((i) => i.id.videoId).filter(Boolean);
      if (!ids.length) return [];

      // 영상 상세 + 채널 구독자 병렬 조회
      // ★ P2-fix: search 결과에서 channelId 추출 → videos/channels 병렬화 (순차 3회 → search 후 병렬 2회)
      const chIdsFromSearch = [
        ...new Set(allItems.map((i) => i.snippet && i.snippet.channelId).filter(Boolean)),
      ];
      const [vd, cd] = await Promise.all([
        ytFetch('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') }),
        chIdsFromSearch.length > 0
          ? ytFetch('channels', { part: 'statistics', id: chIdsFromSearch.join(',') })
          : Promise.resolve({ items: [] }),
      ]);
      const cm = {};
      (cd.items || []).forEach((ch) => {
        cm[ch.id] = parseInt(ch.statistics.subscriberCount || 0);
      });

      return scoreVids(
        vd.items
          .map((it) => {
            let durSec = 0;
            const durStr = (it.contentDetails && it.contentDetails.duration) || '';
            const hm = durStr.match(/(\d+)H/);
            if (hm) durSec += parseInt(hm[1]) * 3600;
            const mm = durStr.match(/(\d+)M/);
            if (mm) durSec += parseInt(mm[1]) * 60;
            const sm = durStr.match(/(\d+)S/);
            if (sm) durSec += parseInt(sm[1]);
            let durText = '';
            if (durSec >= 3600)
              durText =
                Math.floor(durSec / 3600) +
                ':' +
                String(Math.floor((durSec % 3600) / 60)).padStart(2, '0') +
                ':' +
                String(durSec % 60).padStart(2, '0');
            else durText = Math.floor(durSec / 60) + ':' + String(durSec % 60).padStart(2, '0');
            return {
              id: it.id,
              title: it.snippet.title,
              ch: it.snippet.channelTitle,
              thumb: (it.snippet.thumbnails.high || it.snippet.thumbnails.default).url,
              date: it.snippet.publishedAt.substring(0, 10),
              views: parseInt(it.statistics.viewCount || 0),
              likes: parseInt(it.statistics.likeCount || 0),
              subs: cm[it.snippet.channelId] || 0,
              desc: it.snippet.description || '',
              score: 0,
              news: false,
              durSec,
              durText,
            };
          })
          .filter((v) => {
            // 한국어 콘텐츠 필터 — 제목에 한글이 포함된 영상만
            if (!/[가-힣]/.test(v.title)) return false;
            // 클라이언트 duration 필터 (4-2: 검색 1회화)
            if (duration === 'long') return v.durSec >= 240 && v.durSec <= 3600; // 4분~1시간
            if (duration === 'short') return v.durSec < 240; // 4분 미만
            return true; // 'any'
          })
      );
    } catch (e) {
      throw e; // ★ P1-fix: mock fallback 제거 — filterDuration()의 catch에서 에러 카드 + 재시도 UI 표시
    }
  };

  // Google TTS
  const GOOGLE_VOICE_MAP = {
    vc1: { name: 'ko-KR-Neural2-C', gender: 'MALE' },
    vc2: { name: 'ko-KR-Neural2-A', gender: 'FEMALE' },
    vc3: { name: 'ko-KR-Neural2-C', gender: 'MALE' },
    vc4: { name: 'ko-KR-Neural2-B', gender: 'FEMALE' },
    vc5: { name: 'ko-KR-Wavenet-A', gender: 'FEMALE' },
    vc6: { name: 'ko-KR-Wavenet-C', gender: 'MALE' },
    vc7: { name: 'ko-KR-Wavenet-B', gender: 'FEMALE' },
    vc8: { name: 'ko-KR-Wavenet-D', gender: 'FEMALE' },
    vc9: { name: 'ko-KR-Wavenet-C', gender: 'MALE' },
  };

  ApiObj.genVoice = async (text, voiceId, { signal } = {}) => {
    const script = text || S.script.es || (S.script.scr && S.script.scr.content) || '';
    if (!script) throw new Error('대본이 없습니다');
    if (voiceId === 'custom' && S.voice.elVoiceId)
      return genElevenLabs(script, S.voice.elVoiceId, { signal });
    if (voiceId === 'el-custom' && S.voice.customElVoiceId)
      return genElevenLabs(script, S.voice.customElVoiceId, { signal });
    const elVoice = M.voices.find((v) => v.id === voiceId && v.provider === 'elevenlabs');
    if (elVoice && elVoice.elId) {
      const r = await genElevenLabs(script, elVoice.elId, { signal });
      r.voiceName = elVoice.name;
      return r;
    }
    const keys = getApiKeys();
    if (keys.tts) {
      const voice = GOOGLE_VOICE_MAP[voiceId] || GOOGLE_VOICE_MAP['vc4'];
      const speed = S.voice.voiceSpeed || 1.0;

      // 1500자씩 청크 분할
      const chunks = [];
      let remaining = script;
      while (remaining.length > 0) {
        if (remaining.length <= TTS_CHUNK_SIZE) {
          chunks.push(remaining);
          break;
        }
        let cut = remaining.lastIndexOf('.', TTS_CHUNK_SIZE);
        if (cut < TTS_CHUNK_MIN_BREAK) cut = remaining.lastIndexOf(' ', TTS_CHUNK_SIZE);
        if (cut < TTS_CHUNK_MIN_BREAK) cut = TTS_CHUNK_SIZE;
        chunks.push(remaining.substring(0, cut + 1));
        remaining = remaining.substring(cut + 1).trim();
      }

      async function callTTS(chunk) {
        // Electron: Main IPC로 키 노출 방지
        if (window.electronAPI && window.electronAPI.callTTS) {
          const r = await _invokeAbortableMedia(
            (requestId) =>
              window.electronAPI.callTTS(chunk, voice.name, voice.gender, speed, requestId),
            (requestId) =>
              window.electronAPI.cancelTTSRequest
                ? window.electronAPI.cancelTTSRequest(requestId)
                : Promise.resolve(),
            signal
          );
          if (r && r.cancelled) throw _abortError();
          if (!r) throw new Error('TTS IPC 응답 없음');
          if (r.status === 403)
            throw new Error('Google TTS API 키가 유효하지 않거나 API가 활성화되지 않았습니다');
          if (r.error) throw new Error(r.error);
          if (!r.audioContent)
            throw new Error('TTS 응답에 오디오 데이터가 없습니다 (status: ' + r.status + ')');
          return b64toBlob(r.audioContent, 'audio/mp3');
        }
        _warnWebFallback('Google TTS');
        const r = await fetchWithTimeout(
          'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + keys.tts,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text: chunk },
              voice: { languageCode: 'ko-KR', name: voice.name, ssmlGender: voice.gender },
              audioConfig: { audioEncoding: 'MP3', speakingRate: speed, pitch: 0 },
            }),
            signal,
          },
          120000,
          signal
        );
        if (r.status === 403)
          throw new Error('Google TTS API 키가 유효하지 않거나 API가 활성화되지 않았습니다');
        if (!r.ok) {
          const d = await r.json();
          throw new Error((d.error && d.error.message) || 'TTS 오류: ' + r.status);
        }
        const d = await r.json();
        return b64toBlob(d.audioContent, 'audio/mp3');
      }

      // 순차 호출 후 합치기
      const blobs = [];
      for (const chunk of chunks) {
        blobs.push(await callTTS(chunk));
      }
      // ★ P1-fix: 멀티청크 blob을 합쳐서 단일 URL 제공 (MP3 프레임 구조 — concat 재생 가능)
      const merged = blobs.length === 1 ? blobs[0] : new Blob(blobs, { type: 'audio/mp3' });
      const dur = Math.round(script.length / 6 / speed);
      return {
        url: URL.createObjectURL(merged),
        blob: merged,
        parts: blobs,
        dur,
        provider: 'Google Cloud TTS',
        voiceName: voice.name,
        speed,
      };
    }
    await wait(2000);
    return M.voice;
  };

  ApiObj.genThumb = async (title, script) => {
    if (!hasKey('llm'))
      return ['충격! ' + title, '이것만 알면 인생이 바뀝니다', '아무도 몰랐던 진실'];
    const prompt =
      '당신은 유튜브 썸네일 카피라이터입니다.\n\n[영상 제목]\n' +
      title +
      '\n\n[대본 요약]\n' +
      (script || '').substring(0, 500) +
      '\n\n[규칙]\n- 각 문구는 15자 이내\n- 호기심, 충격, 반전\n\nJSON 배열로만 응답: ["문구1","문구2","문구3"]';
    const t = await callLLM(prompt);
    try {
      return JSON.parse(t.replace(/```json|```/g, '').trim());
    } catch (e) {
      return [t.substring(0, 30)];
    }
  };

  ApiObj.__proxyPatched = true;
}

// ── playVoicePreview / handleVoiceUpload ──
export function setupVoiceHandlers() {
  registerAction('playVoicePreview', async (btn) => {
    if (shared.previewAudio && !shared.previewAudio.paused) {
      shared.previewAudio.pause();
      if (shared.previewAudio.src && shared.previewAudio.src.startsWith('blob:'))
        try {
          URL.revokeObjectURL(shared.previewAudio.src);
        } catch (e) {}
      shared.previewAudio = null;
      if (shared.previewAnimId) {
        clearInterval(shared.previewAnimId);
        shared.previewAnimId = null;
      }
      btn.querySelector('span').textContent = '▶';
      document.getElementById('vpTime').textContent = '미리듣기';
      const bars = document.getElementById('vpWave');
      if (bars)
        for (let i = 0; i < bars.children.length; i++) bars.children[i].style.height = '6px';
      return;
    }
    const voiceRef = btn.dataset.voice;
    const provider = btn.dataset.provider || 'google';
    btn.disabled = true;
    btn.querySelector('span').textContent = '⏳';
    document.getElementById('vpTime').textContent = '로딩...';
    const sampleText =
      '여러분, 오늘 정말 놀라운 이야기를 들려드리려고 합니다. 최근 화제가 된 이 사건, 한번 자세히 살펴볼까요?';
    try {
      let audio;
      if (provider === 'elevenlabs') {
        const result = await genElevenLabs(sampleText, voiceRef);
        audio = new Audio(result.url);
      } else {
        const keys = getApiKeys();
        if (!keys.tts) {
          toast('Google TTS API 키를 설정해주세요', 'err');
          btn.querySelector('span').textContent = '▶';
          document.getElementById('vpTime').textContent = '미리듣기';
          btn.disabled = false;
          return;
        }
        // Electron: Main IPC로 키 노출 방지
        if (window.electronAPI && window.electronAPI.callTTS) {
          const r = await window.electronAPI.callTTS(
            sampleText,
            voiceRef,
            'FEMALE',
            S.voice.voiceSpeed || 1.0
          );
          if (!r || r.error) throw new Error((r && r.error) || 'TTS IPC 응답 없음');
          if (!r.audioContent) throw new Error('TTS 응답에 오디오 데이터가 없습니다');
          audio = new Audio('data:audio/mp3;base64,' + r.audioContent);
        } else {
          _warnWebFallback('Google TTS');
          const r = await fetchWithTimeout(
            'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + keys.tts,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: { text: sampleText },
                voice: { languageCode: 'ko-KR', name: voiceRef },
                audioConfig: {
                  audioEncoding: 'MP3',
                  speakingRate: S.voice.voiceSpeed || 1.0,
                  pitch: 0,
                },
              }),
            },
            120000
          );
          const d = await r.json();
          if (!d.audioContent) throw new Error('TTS 실패');
          audio = new Audio('data:audio/mp3;base64,' + d.audioContent);
        }
      }
      if (
        shared.previewAudio &&
        shared.previewAudio.src &&
        shared.previewAudio.src.startsWith('blob:')
      )
        try {
          URL.revokeObjectURL(shared.previewAudio.src);
        } catch (e) {}
      shared.previewAudio = audio;
      audio.play();
      btn.disabled = false;
      btn.querySelector('span').textContent = '⏸';
      document.getElementById('vpTime').textContent = '재생 중';
      const bars = document.getElementById('vpWave').children;
      shared.previewAnimId = setInterval(() => {
        if (!shared.previewAudio) {
          clearInterval(shared.previewAnimId);
          shared.previewAnimId = null;
          return;
        }
        for (let i = 0; i < bars.length; i++) {
          bars[i].style.height = 6 + Math.random() * 14 + 'px';
          bars[i].style.background = shared.previewAudio.paused ? 'var(--bg3)' : 'var(--acc)';
        }
      }, 150);
      audio.onended = () => {
        clearInterval(shared.previewAnimId);
        shared.previewAnimId = null;
        btn.querySelector('span').textContent = '▶';
        document.getElementById('vpTime').textContent = '미리듣기';
        for (let i = 0; i < bars.length; i++) bars[i].style.height = '6px';
      };
    } catch (e) {
      toast(friendlyError(e), 'err');
      btn.querySelector('span').textContent = '▶';
      document.getElementById('vpTime').textContent = '미리듣기';
      btn.disabled = false;
    }
  });

  registerAction('handleVoiceUpload', async (input) => {
    const file = input.files[0];
    if (!file) return;
    const keys = getApiKeys();
    if (!keys.elevenlabs) {
      document.getElementById('uploadStatus').textContent = 'ElevenLabs 키를 먼저 설정해주세요';
      document.getElementById('uploadStatus').style.color = 'var(--red)';
      return;
    }
    document.getElementById('uploadStatus').textContent = '업로드 중...';
    document.getElementById('uploadStatus').style.color = 'var(--t3)';
    try {
      const voiceId = await uploadToElevenLabs(file);
      sSet({ 'voice.selVoice': 'custom', 'voice.elVoiceId': voiceId });
      document.getElementById('uploadStatus').textContent = '✓ 목소리 학습 완료';
      document.getElementById('uploadStatus').style.color = 'var(--grn)';
    } catch (e) {
      document.getElementById('uploadStatus').textContent = friendlyError(e);
      document.getElementById('uploadStatus').style.color = 'var(--red)';
    }
  });
}
