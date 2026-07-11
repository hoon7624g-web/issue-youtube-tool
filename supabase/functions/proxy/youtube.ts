// ── YouTube Proxy: search, videos, channels (캐싱 + 키 로테이션) ──

import { json, checkRate, logUsage, notifySlack } from "./utils.ts";

// ── YouTube API 키 로테이션 ──
// 환경변수: YOUTUBE_API_KEY (필수), YOUTUBE_API_KEY_2 (선택)
// 첫 번째 키로 403 발생 시 두 번째 키로 자동 재시도
async function ytApiFetch(endpoint: string, params: URLSearchParams): Promise<Response> {
  const key1 = Deno.env.get("YOUTUBE_API_KEY")!;
  const key2 = Deno.env.get("YOUTUBE_API_KEY_2") || "";

  params.set("key", key1);
  const resp1 = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${params}`);

  if (resp1.status === 403 && key2) {
    // 첫 번째 키 쿼터 초과 → 두 번째 키로 재시도
    console.warn(`[YouTube] KEY_1 403 → KEY_2로 재시도 (endpoint: ${endpoint})`);
    notifySlack("youtube", 403, `KEY_1 쿼터 초과 → KEY_2 fallback (${endpoint})`, "system");
    params.set("key", key2);
    return fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${params}`);
  }

  return resp1;
}

export async function handleYouTube(cors: Record<string, string>, path: string, url: URL, svc: any, userId: string, userRole = "user") {
  const rate = await checkRate(svc, userId, "youtube", userRole);
  if (!rate.allowed) return json(cors, { error: "요청 한도 초과", code: "RATE_LIMIT" }, 429);
  const rh = rate.rateHeaders || {};
  const start = Date.now();
  const sub = path.replace("/api/youtube/", "");
  if (!["search", "videos", "channels"].includes(sub)) return json(cors, { error: "Unsupported" }, 400);
  const params = new URLSearchParams(url.search);
  params.delete("key");

  // ── 캐싱: search 엔드포인트만 캐싱 (가장 비싼 호출) ──
  if (sub === "search") {
    // ★ Fix: 캐시 키를 전체 파라미터 기반으로 정규화 — order/regionCode 등 누락 방지
    const cacheParams = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const cacheKey = "search:" + cacheParams.map(([k, v]) => k + "=" + v).join("&");
    try {
      const { data: cached } = await svc.from("youtube_cache")
        .select("result").eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString()).single();
      if (cached) {
        await logUsage(svc, userId, "youtube_cache", 200, Date.now() - start);
        return json(cors, cached.result, 200, rh);
      }
    } catch (_) { /* 캐시 미스 — 정상 */ }

    const resp = await ytApiFetch("search", params);
    const data = await resp.json();
    await logUsage(svc, userId, "youtube", resp.status, Date.now() - start);
    if (!resp.ok) return json(cors, { error: "YouTube API 오류", code: "UPSTREAM_ERROR", upstream_status: resp.status }, 502);

    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    try {
      await svc.from("youtube_cache").upsert({
        cache_key: cacheKey, endpoint: "search", result: data, expires_at: expiresAt,
      }, { onConflict: "cache_key" });
    } catch (_) { /* 캐시 저장 실패해도 응답에 영향 없음 */ }

    return json(cors, data, 200, rh);
  }

  // ── videos, channels는 캐싱 없이 바로 호출 ──
  const resp = await ytApiFetch(sub, params);
  const data = await resp.json();
  await logUsage(svc, userId, "youtube", resp.status, Date.now() - start);
  if (!resp.ok) return json(cors, { error: "YouTube API 오류", code: "UPSTREAM_ERROR", upstream_status: resp.status }, 502);
  return json(cors, data, 200, rh);
}
