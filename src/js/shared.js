// ═══════════════════════════════════════
// shared.js — 모듈 간 공유 가변 상태
// window._pexelsDL, window._previewAudio 등 전역 변수를 모듈로 전환
// ═══════════════════════════════════════

export const shared = {
  // step8-footage: Pexels 다운로드 목록
  pexelsDL: [],

  // voice preview: 오디오 재생 상태
  previewAudio: null,
  previewAnimId: null,

  // step10-result: 현재 결과 페이지
  resultPage: 0,

  // step2-keywords: 이슈링크 키워드 맵
  ilKw: {},
};

// ═══════════════════════════════════════
// 자막 프리페치 + 캐시 (Step 4 → Step 5 병렬화)
// ═══════════════════════════════════════
const _subCache = {};  // videoId → { text, language, ... }
let _subPrefetchPromise = null;
let _subPrefetchVideoId = null;

export function prefetchSubtitle(videoId) {
  if (!videoId) return;
  // 이미 캐시에 있으면 스킵
  if (_subCache[videoId]) return;
  // 이미 같은 영상 프리페치 중이면 스킵
  if (_subPrefetchVideoId === videoId && _subPrefetchPromise) return;

  _subPrefetchVideoId = videoId;

  if (window.electronAPI && window.electronAPI.isElectron && window.electronAPI.getSubtitle) {
    console.log('[SubPrefetch] 자막 프리페치 시작:', videoId);
    _subPrefetchPromise = window.electronAPI.getSubtitle(videoId).then(sub => {
      const text = sub.text || '';
      if (text && text.length > 30) {
        _subCache[videoId] = sub;
        console.log('[SubPrefetch] 캐시 완료:', text.length + '자');
      }
      return sub;
    }).catch(e => {
      console.warn('[SubPrefetch] 실패:', e.message);
      return { text: '', error: e.message };
    });
  }
}

export async function getCachedSubtitle(videoId) {
  // 1순위: 캐시 히트
  if (_subCache[videoId]) {
    console.log('[SubCache] 캐시 히트:', videoId);
    return _subCache[videoId];
  }
  // 2순위: 프리페치 진행 중이면 대기
  if (_subPrefetchVideoId === videoId && _subPrefetchPromise) {
    console.log('[SubCache] 프리페치 대기 중...');
    const sub = await _subPrefetchPromise;
    return sub;
  }
  // 3순위: 캐시 미스 → 새로 요청
  if (window.electronAPI && window.electronAPI.isElectron && window.electronAPI.getSubtitle) {
    const sub = await window.electronAPI.getSubtitle(videoId);
    const text = sub.text || '';
    if (text && text.length > 30) {
      _subCache[videoId] = sub;
    }
    return sub;
  }
  return { text: '', error: 'no Electron API' };
}
