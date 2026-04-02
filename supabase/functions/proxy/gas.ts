// ── GAS Proxy: issuelink + subtitle ──

import { json, checkRate, logUsage } from "./utils.ts";

export async function handleGAS(cors: Record<string, string>, url: URL, svc: any, userId: string, userRole = "user") {
  const rate = await checkRate(svc, userId, "gas", userRole);
  if (!rate.allowed) return json(cors, { error: "요청 한도 초과" }, 429);
  const rh = rate.rateHeaders || {};
  const gasUrl = Deno.env.get("GAS_URL");
  if (!gasUrl) return json(cors, { error: "GAS not configured" }, 500);
  const action = url.searchParams.get("action") || "";
  if (!["issuelink", "subtitle"].includes(action)) return json(cors, { error: "허용되지 않은 action입니다" }, 400);
  const allowedParams: Record<string, string[]> = { issuelink: ["action","cat"], subtitle: ["action","videoId"] };
  const safeParams = new URLSearchParams();
  (allowedParams[action] || []).forEach(k => { const v = url.searchParams.get(k); if (v) safeParams.set(k, v); });

  // issuelink는 30분 캐시
  if (action === "issuelink") {
    const cacheKey = "gas:issuelink:" + (url.searchParams.get("cat") || "all");
    try {
      const { data: cached } = await svc.from("youtube_cache")
        .select("result").eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString()).single();
      if (cached) { await logUsage(svc, userId, "gas_cache", 200, 0); return json(cors, cached.result, 200, rh); }
    } catch (_) { /* 캐시 미스 */ }

    const start = Date.now();
    const resp = await fetch(`${gasUrl}?${safeParams}`, { redirect: "follow" });
    const data = await resp.json();
    await logUsage(svc, userId, "gas", resp.status, Date.now() - start);
    if (!resp.ok) return json(cors, { error: "GAS API 오류", code: "UPSTREAM_ERROR", detail: data }, 502);

    try {
      await svc.from("youtube_cache").upsert({
        cache_key: cacheKey, endpoint: "gas", result: data,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }, { onConflict: "cache_key" });
    } catch (_) { /* 캐시 저장 실패해도 응답에 영향 없음 */ }

    return json(cors, data, 200, rh);
  }

  // subtitle은 캐싱 안 함
  const start = Date.now();
  const resp = await fetch(`${gasUrl}?${safeParams}`, { redirect: "follow" });
  const data = await resp.json();
  await logUsage(svc, userId, "gas", resp.status, Date.now() - start);
  if (!resp.ok) return json(cors, { error: "GAS API 오류", code: "UPSTREAM_ERROR", detail: data }, 502);
  return json(cors, data, 200, rh);
}
