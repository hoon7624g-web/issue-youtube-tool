// ═══════════════════════════════════════
// cache.js — 클라이언트 메모리 캐시
// Trends, 이슈링크 등 반복 호출 데이터를 캐싱
// ═══════════════════════════════════════

const _cache = {};

export function cacheGet(key, ttlMs = 600000) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts >= ttlMs) {
    delete _cache[key];
    return null;
  }
  return entry.data;
}

export function cacheSet(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

export function cacheClear(key) {
  if (key) delete _cache[key];
  else Object.keys(_cache).forEach((k) => delete _cache[k]);
}
