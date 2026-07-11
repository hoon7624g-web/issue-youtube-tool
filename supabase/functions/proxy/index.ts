// ═══════════════════════════════════════════════════════════
// 이슈 유튜브 제작툴 — Supabase Edge Function (API Proxy v3.6.2)
// Supabase Auth + profiles.approval_status 기반 인증
// ═══════════════════════════════════════════════════════════
// 배포: supabase functions deploy proxy --no-verify-jwt
// ═══════════════════════════════════════════════════════════

import {
  getCorsHeaders,
  json,
  getServiceClient,
  validateUser,
  checkRate,
  logUsage,
  notifySlack,
  getClientIp,
  sha256Hex,
} from './utils.ts';
import { handleSignup, handleLogin, handleRefresh } from './auth.ts';
import { handleAdmin } from './admin.ts';
import { handleYouTube } from './youtube.ts';
import { handleTrends } from './trends.ts';
import { handleRealtimeKeywords } from './realtime-keywords.ts';
import { handleIssueLink } from './issuelink.ts';
import { handleLLM, handleLLMStream } from './llm.ts';
import { handleTTS, handleElevenLabs } from './media.ts';
import { handleGAS } from './gas.ts';

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/proxy/, '');
  const svc = getServiceClient();

  if (path === '/' || path === '/health' || path === '')
    return json(cors, { status: 'ok', version: '3.6.2' });

  // ════════════════════════════════════════════════════════════
  // ⚠️ 공개 엔드포인트 (인증 불필요) — 여기 위에만 추가 가능
  // 이 함수는 --no-verify-jwt로 배포되므로, 아래 validateUser()
  // 이전에 추가한 엔드포인트는 인증 없이 접근 가능합니다.
  // 새 공개 엔드포인트는 반드시 IP Rate Limit을 포함하세요.
  // ════════════════════════════════════════════════════════════
  if (path === '/auth/signup' && req.method === 'POST') {
    const ip = getClientIp(req);
    const since = new Date(Date.now() - 60000).toISOString();
    const { count } = await svc
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('endpoint', 'signup')
      .eq('user_id', ip)
      .gte('created_at', since);
    if ((count || 0) >= 5)
      return json(cors, { error: '가입 요청이 너무 많습니다. 잠시 후 다시 시도하세요.' }, 429);
    const t0 = Date.now();
    const resp = await handleSignup(cors, req, svc);
    await svc.from('usage_logs').insert({
      user_id: ip,
      endpoint: 'signup',
      status_code: resp.status,
      response_ms: Date.now() - t0,
    });
    return resp;
  }
  if (path === '/auth/login' && req.method === 'POST') {
    const ip = getClientIp(req);
    // ★ v3.6.2 P1-1: 계정 단위 brute-force 방어 추가
    //   - IP 단위 (기존): 같은 IP에서 5분 내 10회 실패 → 차단
    //   - 계정 단위 (신규): 같은 이메일에 대해 IP 무관 5분 내 10회 실패 → 차단
    //   - 실패만 카운트 (status >= 400) — 정상 사용자가 비번 한 번 틀려도 잠기지 않음
    let accountKey = '';
    try {
      const body = await req.clone().json();
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email) accountKey = await sha256Hex(email);
    } catch (_) {
      /* body 파싱 실패는 handleLogin에서 처리 */
    }

    const since = new Date(Date.now() - 300000).toISOString();
    const { count: ipFailCount } = await svc
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('endpoint', 'login')
      .eq('user_id', ip)
      .gte('status_code', 400)
      .gte('created_at', since);
    let accountFailCount = 0;
    if (accountKey) {
      const { count } = await svc
        .from('usage_logs')
        .select('*', { count: 'exact', head: true })
        .eq('endpoint', 'login-account')
        .eq('user_id', accountKey)
        .gte('status_code', 400)
        .gte('created_at', since);
      accountFailCount = count || 0;
    }
    if ((ipFailCount || 0) >= 10 || accountFailCount >= 10) {
      notifySlack(
        'login',
        429,
        `Brute force 의심: IP_FAIL=${ipFailCount || 0}, ACCOUNT_FAIL=${accountFailCount}, hash=${accountKey.slice(0, 12)}...`,
        ip
      );
      return json(cors, { error: '로그인 시도가 너무 많습니다. 5분 후 다시 시도하세요.' }, 429);
    }
    const t0 = Date.now();
    const resp = await handleLogin(cors, req, svc);
    // ★ v3.6.2 P1-1: IP 로그 + 계정 로그 동시 적재 (계정 식별자가 있는 경우)
    const logRows: Array<Record<string, unknown>> = [
      { user_id: ip, endpoint: 'login', status_code: resp.status, response_ms: Date.now() - t0 },
    ];
    if (accountKey) {
      logRows.push({
        user_id: accountKey,
        endpoint: 'login-account',
        status_code: resp.status,
        response_ms: Date.now() - t0,
      });
    }
    await svc.from('usage_logs').insert(logRows);
    return resp;
  }
  if (path === '/auth/refresh' && req.method === 'POST') {
    const ip = getClientIp(req);
    const since = new Date(Date.now() - 300000).toISOString();
    const { count } = await svc
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('endpoint', 'refresh')
      .eq('user_id', ip)
      .gte('created_at', since);
    if ((count || 0) >= 30)
      return json(cors, { error: '토큰 갱신 요청이 너무 많습니다. 5분 후 다시 시도하세요.' }, 429);
    const t0 = Date.now();
    const resp = await handleRefresh(cors, req);
    await svc.from('usage_logs').insert({
      user_id: ip,
      endpoint: 'refresh',
      status_code: resp.status,
      response_ms: Date.now() - t0,
    });
    return resp;
  }
  // ★ P2-13: /api/config를 공개 엔드포인트로 이동 (모델명/제한값은 민감 정보 아님)
  // 클라이언트 부팅 시 인증 전에 호출되므로 인증 불필요
  if (path === '/api/config') {
    return json(cors, {
      DEFAULT_GEMINI_MODEL: Deno.env.get('DEFAULT_GEMINI_MODEL') || 'gemini-3.1-pro-preview',
      DEFAULT_CLAUDE_MODEL: Deno.env.get('DEFAULT_CLAUDE_MODEL') || 'claude-sonnet-4-20250514',
      MAX_OUTPUT_TOKENS: parseInt(Deno.env.get('MAX_OUTPUT_TOKENS') || '16384'),
      MAX_OUTPUT_TOKENS_SHORT: parseInt(Deno.env.get('MAX_OUTPUT_TOKENS_SHORT') || '4096'),
    });
  }
  // ═══ 공개 엔드포인트 끝 — 이 아래에 인증 없는 엔드포인트 추가 금지 ═══

  // ── Admin (Bearer 토큰 + role=admin만 허용) ──
  if (path.startsWith('/admin/')) {
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const adminUser = await validateUser(authHeader);
      if (
        adminUser &&
        !(adminUser as any)._error &&
        !(adminUser as any).rejected &&
        adminUser.role === 'admin'
      ) {
        return handleAdmin(cors, path, req, svc);
      }
      if (adminUser && adminUser.role !== 'admin') {
        return json(cors, { error: '관리자 권한이 없습니다', code: 'NOT_ADMIN' }, 403);
      }
    }
    return json(cors, { error: '관리자 인증이 필요합니다' }, 403);
  }

  // ════════════════════════════════════════════════════════════
  // 🔒 인증 필수 영역 — 여기 아래의 모든 엔드포인트는 인증됨
  // ════════════════════════════════════════════════════════════
  const authHeader = req.headers.get('Authorization') || '';

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json(cors, { error: '로그인이 필요합니다', code: 'AUTH_REQUIRED' }, 401);
  }

  const user = await validateUser(authHeader);
  if (!user || (user as any)._error) {
    return json(cors, { error: '로그인이 필요합니다', code: 'AUTH_REQUIRED' }, 401);
  }
  if ((user as any).rejected)
    return json(cors, { error: '관리자 승인 대기 중입니다', code: 'APPROVAL_PENDING' }, 403);

  const userId = user.id;
  const userRole = user.role || 'user';
  try {
    // ★ maybeCleanupLogs 제거 — 요청 경로에서 확률적 DB 삭제는 tail latency 유발
    // 로그 정리는 /admin/cleanup 엔드포인트 또는 Supabase pg_cron으로 처리
    if (path.startsWith('/api/youtube/'))
      return handleYouTube(cors, path, url, svc, userId, userRole);
    if (path === '/api/trends') {
      const trendRate = await checkRate(svc, userId, 'trends', userRole);
      if (!trendRate.allowed)
        return json(cors, { error: '요청 한도 초과', code: 'RATE_LIMIT' }, 429);
      const trendResult = await handleTrends(cors);
      await logUsage(svc, userId, 'trends', trendResult.status, 0);
      return trendResult;
    }
    if (path === '/api/realtime-keywords') {
      const rkRate = await checkRate(svc, userId, 'trends', userRole);
      if (!rkRate.allowed) return json(cors, { error: '요청 한도 초과', code: 'RATE_LIMIT' }, 429);
      const rkResult = await handleRealtimeKeywords(cors);
      await logUsage(svc, userId, 'realtime-keywords', rkResult.status, 0);
      return rkResult;
    }
    if (path === '/api/issuelink') {
      const ilRate = await checkRate(svc, userId, 'issuelink', userRole);
      if (!ilRate.allowed) return json(cors, { error: '요청 한도 초과', code: 'RATE_LIMIT' }, 429);
      const ilResult = await handleIssueLink(cors);
      await logUsage(svc, userId, 'issuelink', ilResult.status, 0);
      return ilResult;
    }
    // ════════════════════════════════════════════════════════════
    // WEB_CLIENT_ONLY — 웹 버전 지원을 위해 활성화 (v3.6.0-web)
    // 대상: /api/llm, /api/llm/stream, /api/tts, /api/elevenlabs
    // ════════════════════════════════════════════════════════════
    if (path === '/api/llm/stream' && req.method === 'POST') {
      return handleLLMStream(cors, req, svc, userId, userRole);
    }
    if (path === '/api/llm' && req.method === 'POST') {
      return handleLLM(cors, req, svc, userId, userRole);
    }
    if (path === '/api/tts' && req.method === 'POST') {
      return handleTTS(cors, req, svc, userId, userRole);
    }
    if (path.startsWith('/api/elevenlabs')) {
      return handleElevenLabs(cors, path, req, svc, userId, userRole);
    }

    if (path.startsWith('/api/gas')) return handleGAS(cors, url, svc, userId, userRole);
    if (path === '/api/me') return json(cors, user);

    // P2-20: 텔레메트리 수집 (익명 이벤트)
    if (path === '/api/telemetry' && req.method === 'POST') {
      try {
        const body = await req.json();
        const events = body.events;
        if (Array.isArray(events) && events.length > 0 && events.length <= 100) {
          const rows = events.map((ev: any) => ({
            user_id: userId,
            event_type: String(ev.e || '').substring(0, 50),
            event_data: JSON.stringify(ev.d || {}).substring(0, 500),
            client_ts: ev.t || Date.now(),
          }));
          await svc
            .from('telemetry_events')
            .insert(rows)
            .catch(() => {});
        }
      } catch (_) {}
      return json(cors, { ok: true });
    }

    return json(cors, { error: 'Not found' }, 404);
  } catch (err) {
    const msg = (err as Error).message;
    const stack = ((err as Error).stack || '').split('\n').slice(0, 3).join(' | ');
    await notifySlack(path, 500, `${msg}\n📍 ${req.method} ${path}\n🔍 ${stack}`, userId);
    await logUsage(svc, userId, path, 500, 0, `${msg} [${req.method} ${path}]`);
    return json(cors, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }, 500);
  }
});
