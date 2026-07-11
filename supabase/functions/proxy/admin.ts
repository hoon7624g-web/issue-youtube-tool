// ── Admin Handlers: 사용자 관리, 통계, Rate Limit, 데모 모드, 정리 ──

import { json } from './utils.ts';

export async function handleAdmin(
  cors: Record<string, string>,
  path: string,
  req: Request,
  svc: any
) {
  if (path === '/admin/users') {
    const { data } = await svc
      .from('profiles')
      .select('id, email, full_name, name, phone, cohort, role, approval_status, created_at')
      .order('created_at', { ascending: false });
    return json(cors, data || []);
  }
  if (path === '/admin/approve' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
    }
    if (
      !body.user_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)
    )
      return json(cors, { error: '유효하지 않은 사용자 ID' }, 400);
    const { data } = await svc
      .from('profiles')
      .update({ approval_status: '승인완료' })
      .eq('id', body.user_id)
      .select()
      .single();
    if (!data) return json(cors, { error: '사용자를 찾을 수 없습니다' }, 404);
    return json(cors, { message: '승인 완료', user: data });
  }
  if (path === '/admin/reject' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
    }
    if (
      !body.user_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)
    )
      return json(cors, { error: '유효하지 않은 사용자 ID' }, 400);
    const { data } = await svc
      .from('profiles')
      .update({ approval_status: '대기중' })
      .eq('id', body.user_id)
      .select()
      .single();
    if (!data) return json(cors, { error: '사용자를 찾을 수 없습니다' }, 404);
    return json(cors, { message: '승인 취소', user: data });
  }
  if (path === '/admin/stats') {
    const { data } = await svc.from('profiles').select('approval_status');
    const total = data?.length || 0;
    const approved = data?.filter((p: any) => p.approval_status === '승인완료').length || 0;
    return json(cors, { total, approved, pending: total - approved });
  }

  // ── 사용량 통계 ──
  if (path === '/admin/usage') {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '7');
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: logs } = await svc
      .from('usage_logs')
      .select('endpoint, status_code, response_ms, created_at, user_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000);

    if (!logs)
      return json(cors, {
        endpoints: {},
        topUsers: [],
        daily: [],
        totalCalls: 0,
        estimatedCost: 0,
      });

    const endpoints: Record<string, { count: number; errors: number; avgMs: number }> = {};
    const userCounts: Record<string, number> = {};
    const dailyCounts: Record<string, Record<string, number>> = {};
    const epResponseTimes: Record<string, number[]> = {};

    for (const log of logs) {
      const ep = log.endpoint;
      if (!endpoints[ep]) endpoints[ep] = { count: 0, errors: 0, avgMs: 0 };
      endpoints[ep].count++;
      if (log.status_code >= 400) endpoints[ep].errors++;
      endpoints[ep].avgMs += log.response_ms || 0;
      userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
      const day = log.created_at.substring(0, 10);
      if (!dailyCounts[day]) dailyCounts[day] = {};
      dailyCounts[day][ep] = (dailyCounts[day][ep] || 0) + 1;
      // p50/p95 계산용 응답시간 수집
      if (log.response_ms > 0) {
        if (!epResponseTimes[ep]) epResponseTimes[ep] = [];
        epResponseTimes[ep].push(log.response_ms);
      }
    }

    for (const ep of Object.keys(endpoints)) {
      endpoints[ep].avgMs = Math.round(endpoints[ep].avgMs / endpoints[ep].count);
    }

    // ── p50/p95 계산 ──
    function percentile(arr: number[], p: number): number {
      const sorted = arr.slice().sort((a, b) => a - b);
      const idx = Math.ceil((sorted.length * p) / 100) - 1;
      return sorted[Math.max(0, idx)];
    }
    const percentiles: Record<string, { p50: number; p95: number; count: number }> = {};
    for (const [ep, times] of Object.entries(epResponseTimes)) {
      if (times.length >= 2) {
        percentiles[ep] = {
          p50: Math.round(percentile(times, 50)),
          p95: Math.round(percentile(times, 95)),
          count: times.length,
        };
      }
    }

    const topUserIds = Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const userIds = topUserIds.map((u) => u[0]);
    const { data: profiles } = await svc
      .from('profiles')
      .select('id, email, full_name, name')
      .in('id', userIds);
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => {
      profileMap[p.id] = p;
    });

    const topUsers = topUserIds.map(([id, count]) => ({
      email: profileMap[id]?.email || id.substring(0, 8),
      name: profileMap[id]?.full_name || profileMap[id]?.name || '',
      count,
    }));

    const daily = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, eps]) => ({
        date,
        ...eps,
        total: Object.values(eps).reduce((a, b) => a + b, 0),
      }));

    const costMap: Record<string, number> = {
      llm: 0.015,
      tts: 0.006,
      elevenlabs: 0.03,
      youtube: 0.0001,
      gas: 0,
    };
    let estimatedCost = 0;
    for (const [ep, info] of Object.entries(endpoints)) {
      estimatedCost += (costMap[ep] || 0) * info.count;
    }

    return json(cors, {
      totalCalls: logs.length,
      endpoints,
      topUsers,
      daily,
      percentiles,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      period: { days, since },
    });
  }

  // ── Rate Limit 설정 조회/수정 ──
  if (path === '/admin/rate-config') {
    if (req.method === 'POST') {
      let body: any;
      try {
        body = await req.json();
      } catch (_) {
        return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
      }
      if (!body.endpoint || !body.max_requests || !body.window_seconds) {
        return json(cors, { error: 'endpoint, max_requests, window_seconds 필수' }, 400);
      }
      if (body.max_requests < 1 || body.max_requests > 10000)
        return json(cors, { error: 'max_requests는 1~10000 범위' }, 400);
      if (body.window_seconds < 60 || body.window_seconds > 86400)
        return json(cors, { error: 'window_seconds는 60~86400 범위' }, 400);
      const { data, error } = await svc
        .from('rate_config')
        .upsert(
          {
            endpoint: body.endpoint,
            max_requests: body.max_requests,
            window_seconds: body.window_seconds,
            description: body.description || '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        )
        .select()
        .single();
      if (error) return json(cors, { error: error.message }, 500);
      return json(cors, { message: '설정 저장 완료', config: data });
    }
    const { data } = await svc.from('rate_config').select('*').order('endpoint');
    return json(cors, data || []);
  }

  // ── 데모 모드 (웨비나용 Rate Limit 면제) ──
  if (path === '/admin/demo-bypass' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
    }
    if (
      !body.user_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)
    )
      return json(cors, { error: '유효하지 않은 사용자 ID' }, 400);
    const hours = body.hours || 3;
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
    const { data, error } = await svc
      .from('demo_bypass')
      .upsert(
        {
          user_id: body.user_id,
          active: true,
          expires_at: expiresAt,
          created_by: 'admin',
          note: body.note || '웨비나 데모',
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    if (error) return json(cors, { error: error.message }, 500);
    return json(cors, { message: `${hours}시간 데모 모드 활성화`, bypass: data });
  }
  if (path === '/admin/demo-bypass' && req.method === 'DELETE') {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
    }
    if (
      !body.user_id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.user_id)
    )
      return json(cors, { error: '유효하지 않은 사용자 ID' }, 400);
    await svc.from('demo_bypass').update({ active: false }).eq('user_id', body.user_id);
    return json(cors, { message: '데모 모드 해제' });
  }
  if (path === '/admin/demo-bypass' && req.method === 'GET') {
    const { data } = await svc
      .from('demo_bypass')
      .select('*')
      .eq('active', true)
      .gt('expires_at', new Date().toISOString());
    return json(cors, data || []);
  }

  // ── usage_logs 자동 정리 ──
  if (path === '/admin/cleanup' && req.method === 'POST') {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
    }
    const days = Math.max(Math.min(body.days || 90, 365), 30);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { count: targetCount } = await svc
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoff);

    if (!targetCount || targetCount === 0) {
      return json(cors, {
        message: '삭제할 로그가 없습니다',
        deleted: 0,
        cutoff_date: cutoff.substring(0, 10),
      });
    }

    let totalDeleted = 0;
    const BATCH = 1000;
    for (let i = 0; i < 100; i++) {
      const { data: batch, error } = await svc
        .from('usage_logs')
        .delete()
        .lt('created_at', cutoff)
        .limit(BATCH)
        .select('id');
      if (error) {
        console.error('[Cleanup] batch error:', error.message);
        break;
      }
      totalDeleted += batch?.length || 0;
      if (!batch || batch.length < BATCH) break;
    }

    return json(cors, {
      message: `${days}일 이전 로그 ${totalDeleted}건 삭제 완료`,
      deleted: totalDeleted,
      cutoff_date: cutoff.substring(0, 10),
      target_count: targetCount,
    });
  }

  // ── 만료된 youtube_cache 정리 ──
  if (path === '/admin/cleanup-cache' && req.method === 'POST') {
    const { data: expired, error } = await svc
      .from('youtube_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('cache_key');
    if (error) return json(cors, { error: error.message }, 500);
    return json(cors, {
      message: `만료 캐시 ${expired?.length || 0}건 삭제`,
      deleted: expired?.length || 0,
    });
  }

  return json(cors, { error: 'Unknown admin endpoint' }, 404);
}
