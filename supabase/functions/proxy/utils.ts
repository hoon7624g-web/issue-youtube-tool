// ═══════════════════════════════════════════════════════════
// 공통 유틸리티 — CORS, 응답 헬퍼, 인증, Rate Limit, 로깅
// ═══════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export { createClient };

// ── CORS: 허용된 Origin만 ──
const ALLOWED_ORIGINS = [
  "https://issue-youtube-tool.vercel.app",
  "null",  // Electron file:// — 3-6: 장기적으로 제거 목표. 현재는 X-App-Client 헤더로 추가 검증.
  "http://localhost:5173",  // Vite dev server (개발 모드)
  "https://youtube-dosa-web-v3-6-0.vercel.app",  // 웹 테스트 버전
  "https://dist-seven-mu-61.vercel.app",  // 웹 테스트 버전 (dist 프로젝트)
];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  // ★ P1-6 + Fix #7: "null" origin은 Electron/dev에서만 허용
  // X-App-Client만으로는 스푸핑 가능 → User-Agent 이중 검증 추가
  // ⚠️ 이 검증은 방어 계층일 뿐, 핵심 인증은 Bearer 토큰에 의존합니다.
  if (origin === "null") {
    const appClient = req.headers.get("X-App-Client") || "";
    const ua = req.headers.get("User-Agent") || "";
    const isElectronUA = ua.includes("Electron/") || ua.includes("issue-youtube-tool");
    const isDevClient = appClient === "dev" && (ua.includes("Mozilla/") || ua.includes("Node"));
    if (!(appClient === "electron" && isElectronUA) && !isDevClient) {
      // Electron UA 불일치 또는 dev가 아닌 null origin → CORS 거부
      console.warn("[CORS] Rejecting null origin — X-App-Client:", appClient, "UA:", ua.substring(0, 60));
      return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Client",
        "Access-Control-Max-Age": "86400",
      };
    }
  }
  const allowed = ALLOWED_ORIGINS.some(o => origin === o) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Client",
    "Access-Control-Max-Age": "86400",
  };
}

// ★ Fix: IP 추출 정규화 — x-forwarded-for 첫 번째 IP만 사용, cf-connecting-ip 우선
export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

// ── 응답 헬퍼 ──
export function json(cors: Record<string, string>, data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function rawResponse(cors: Record<string, string>, body: ReadableStream | ArrayBuffer | null, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { status, headers: { ...cors, ...headers } });
}

// ── Supabase 클라이언트 (top-level 재사용) ──
const _svcClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export function getServiceClient() { return _svcClient; }

export function getUserClient(authHeader: string) {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
}

// ── Auth 검증 + 승인 상태 확인 ──
// ★ v3.5.8 + P2-10: profiles 조회에 30초 TTL 캐시 추가 (Map 기반 — GC 친화적)
// Edge Function cold start 시 리셋 — best-effort 캐시
const _profileCache = new Map<string, { data: any; ts: number }>();
const PROFILE_CACHE_TTL = 30 * 1000; // 30초
const PROFILE_CACHE_MAX = 500; // ★ Fix #9: 최대 항목 수

// ★ Fix #9 + P2-10: 캐시 삽입 전 만료/과잉 항목 정리 (Map 기반)
function _pruneProfileCache() {
  const now = Date.now();
  // 1차: 만료된 항목 제거
  for (const [k, v] of _profileCache) {
    if (now - v.ts > PROFILE_CACHE_TTL) _profileCache.delete(k);
  }
  // 2차: 여전히 상한 초과 시 가장 오래된 항목부터 제거
  if (_profileCache.size > PROFILE_CACHE_MAX) {
    const sorted = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const excess = _profileCache.size - PROFILE_CACHE_MAX;
    for (let i = 0; i < excess; i++) _profileCache.delete(sorted[i][0]);
  }
}

export async function validateUser(authHeader: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { _error: "no_bearer" };
  try {
    const userClient = getUserClient(authHeader);
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return { _error: "getUser_failed" };

    // ★ v3.5.8 + P2-10: profiles 캐시 확인 (Map 기반)
    const cached = _profileCache.get(user.id);
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      return cached.data;
    }

    const svc = getServiceClient();
    const { data: profile } = await svc.from("profiles")
      .select("id, email, full_name, name, cohort, role, approval_status")
      .eq("id", user.id).single();
    if (!profile) return { _error: "no_profile" };

    const result = profile.approval_status !== "승인완료"
      ? { ...profile, rejected: true }
      : profile;

    // 캐시 저장 (승인 상태와 무관하게 — rejected도 캐시해서 재조회 방지)
    _pruneProfileCache(); // ★ Fix #9: 삽입 전 만료/과잉 항목 정리
    _profileCache.set(user.id, { data: result, ts: Date.now() });

    return result;
  } catch (err) {
    console.error("[Auth] error:", (err as Error).message);
    return { _error: "exception" };
  }
}

// ── Rate Limiting (DB 기반, fallback: 하드코딩) ──
const DEFAULT_LIMITS: Record<string, { limit: number; window: number }> = {
  youtube: { limit: 100, window: 3600 }, llm: { limit: 60, window: 3600 },
  tts: { limit: 30, window: 3600 }, elevenlabs: { limit: 20, window: 3600 },
  gas: { limit: 60, window: 3600 }, trends: { limit: 30, window: 3600 },
};

// 3-7: rate_config 인메모리 캐시 (5분 TTL)
const _rateConfigCache: Record<string, { data: { limit: number; window: number }; ts: number }> = {};
const RATE_CONFIG_TTL = 5 * 60 * 1000;

async function getRateConfig(svc: any, endpoint: string) {
  const cached = _rateConfigCache[endpoint];
  if (cached && Date.now() - cached.ts < RATE_CONFIG_TTL) return cached.data;
  try {
    const { data } = await svc.from("rate_config")
      .select("max_requests, window_seconds").eq("endpoint", endpoint).single();
    if (data) {
      const result = { limit: data.max_requests, window: data.window_seconds };
      _rateConfigCache[endpoint] = { data: result, ts: Date.now() };
      return result;
    }
  } catch (_) { /* DB 실패 시 기본값 사용 */ }
  const fallback = DEFAULT_LIMITS[endpoint] || { limit: 50, window: 3600 };
  _rateConfigCache[endpoint] = { data: fallback, ts: Date.now() };
  return fallback;
}

export async function checkRate(svc: any, userId: string, endpoint: string, userRole?: string) {
  const bypassed = { allowed: true, current: 0, max: 999, bypassed: true, nearLimit: false, rateHeaders: {} as Record<string, string> };
  if (userRole === "admin") return bypassed;
  try {
    const { data: bypass } = await svc.from("demo_bypass")
      .select("id").eq("user_id", userId).eq("active", true)
      .gt("expires_at", new Date().toISOString()).limit(1);
    if (bypass && bypass.length > 0) return bypassed;
  } catch (_) { /* demo_bypass 테이블 없어도 정상 동작 */ }

  const c = await getRateConfig(svc, endpoint);
  const since = new Date(Date.now() - c.window * 1000).toISOString();
  const { count } = await svc.from("usage_logs").select("*", { count: "exact", head: true })
    .eq("user_id", userId).eq("endpoint", endpoint).gte("created_at", since);
  const current = count || 0;
  const nearLimit = current >= c.limit * 0.8;
  const rateHeaders: Record<string, string> = nearLimit
    ? { "X-Rate-Warning": `${endpoint} 사용량 ${current}/${c.limit} (${Math.round(current / c.limit * 100)}%)` }
    : {};
  return { allowed: current < c.limit, current, max: c.limit, nearLimit, rateHeaders };
}

// ── 사용량 로깅 ──
export async function logUsage(svc: any, userId: string, endpoint: string, status = 200, ms = 0, errorDetail = "") {
  await svc.from("usage_logs").insert({
    user_id: userId, endpoint, status_code: status, response_ms: ms,
    ...(errorDetail ? { error_details: errorDetail } : {})
  });
}

// ── Slack 에러 알림 (집계 기반) ──
// ★ v3.5.8: 동작 보장 범위 명시
//
// [보장됨]
//   - 500번대 에러: 1분 쿨다운으로 즉시 Slack 전송
//   - system userId: 운영 알림 즉시 전송
//   - 모든 에러: console.error 로깅
//
// [best-effort — 보장 안 됨]
//   - 4xx 에러 집계 (5분 내 5건+ 시 알림): Edge Function cold start마다
//     _errorBuckets가 리셋되므로, 요청이 분산되면 임계치에 도달하지 못할 수 있음.
//     정확한 집계가 필요하면 Redis 또는 DB 기반으로 전환 필요.
//
const _errorBuckets: Record<string, { count: number; firstAt: number; lastNotified: number; samples: string[] }> = {};
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5분
const ERROR_THRESHOLD = 5;

export async function notifySlack(endpoint: string, status: number, errorMsg: string, userId = "") {
  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

  // 항상 콘솔에 로깅
  console.error(`[Error] ${endpoint} ${status}: ${errorMsg} (user: ${userId.substring(0, 8) || "unknown"})`);

  if (!webhookUrl) return;

  // "system" userId는 운영 알림 → 즉시 전송 (키 로테이션 등)
  if (userId === "system") {
    try {
      const text = `ℹ️ *이슈유튜브 운영 알림*\n• 엔드포인트: \`${endpoint}\`\n• 상태: ${status}\n• 내용: ${errorMsg}\n• 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
      await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    } catch (_) {}
    return;
  }

  // 3-8: 500번대 에러는 cold start 리셋 관계없이 즉시 알림 (1분 쿨다운)
  if (status >= 500) {
    const cooldownKey = `_500_${endpoint}`;
    const now500 = Date.now();
    if (!_errorBuckets[cooldownKey] || now500 - _errorBuckets[cooldownKey].lastNotified > 60000) {
      if (!_errorBuckets[cooldownKey]) _errorBuckets[cooldownKey] = { count: 0, firstAt: now500, lastNotified: 0, samples: [] };
      _errorBuckets[cooldownKey].lastNotified = now500;
      try {
        const text = `🔥 *이슈유튜브 서버 에러*\n• 엔드포인트: \`${endpoint}\`\n• 상태: ${status}\n• 내용: ${errorMsg.substring(0, 200)}\n• 유저: ${userId.substring(0, 8) || "unknown"}\n• 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
        await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      } catch (_) {}
    }
    // 500은 즉시 전송 후 집계에도 포함 (아래로 계속)
  }

  // 집계 로직
  const now = Date.now();
  if (!_errorBuckets[endpoint]) {
    _errorBuckets[endpoint] = { count: 0, firstAt: now, lastNotified: 0, samples: [] };
  }
  const bucket = _errorBuckets[endpoint];

  // 윈도우 만료 → 리셋
  if (now - bucket.firstAt > ERROR_WINDOW_MS) {
    bucket.count = 0;
    bucket.firstAt = now;
    bucket.samples = [];
  }

  bucket.count++;
  if (bucket.samples.length < 3) {
    bucket.samples.push(`${status}: ${errorMsg.substring(0, 80)}`);
  }

  // 임계치 도달 + 최근 5분 내 미알림
  if (bucket.count >= ERROR_THRESHOLD && now - bucket.lastNotified > ERROR_WINDOW_MS) {
    try {
      const sampleText = bucket.samples.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
      const text = `🚨 *이슈유튜브 에러 집계*\n• 엔드포인트: \`${endpoint}\`\n• 5분간 ${bucket.count}건 에러 발생\n• 샘플:\n${sampleText}\n• 시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
      await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      bucket.lastNotified = now;
      bucket.count = 0;
      bucket.samples = [];
    } catch (_) { /* Slack 알림 실패해도 서비스 영향 없음 */ }
  }
}

// P3-14: maybeCleanupLogs 제거 — index.ts에서 호출 해제됨 (tail latency 유발)
// 로그 정리는 /admin/cleanup 엔드포인트 또는 Supabase pg_cron으로 처리
