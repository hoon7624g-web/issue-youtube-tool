// ── Google Trends: 실시간 인기 키워드 (10분 캐시) ──

import { json, getServiceClient, notifySlack } from './utils.ts';

export async function handleTrends(cors: Record<string, string>) {
  const svc = getServiceClient();
  try {
    const { data: cached } = await svc
      .from('youtube_cache')
      .select('result')
      .eq('cache_key', 'trends:kr')
      .gt('expires_at', new Date().toISOString())
      .single();
    if (cached) return json(cors, cached.result);
  } catch (_) {
    /* 캐시 미스 */
  }

  try {
    const resp = await fetch('https://trends.google.com/trending/rss?geo=KR');
    if (!resp.ok) return json(cors, { error: 'Google Trends 오류', code: 'UPSTREAM_ERROR' }, 502);
    const xml = await resp.text();
    const titles: string[] = [];
    const regex = /<item>[\s\S]*?<title>([^<]+)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const kw = match[1].trim();
      if (kw && titles.length < 20) titles.push(kw);
    }
    const trafficRegex = /<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/g;
    const traffics: string[] = [];
    while ((match = trafficRegex.exec(xml)) !== null) {
      traffics.push(match[1].trim());
    }
    const koEnRegex = /[가-힣a-zA-Z]/;
    const excludeRegex = /[\u0600-\u06FF\u0E00-\u0E7F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
    const keywords = titles
      .map((t, i) => ({ keyword: t, traffic: traffics[i] || '', source: 'google_trends', rank: 0 }))
      .filter((k) => koEnRegex.test(k.keyword) && !excludeRegex.test(k.keyword))
      .map((k, i) => ({ ...k, rank: i + 1 }));
    const result = { keywords, source: 'google_trends', geo: 'KR', count: keywords.length };

    try {
      await svc.from('youtube_cache').upsert(
        {
          cache_key: 'trends:kr',
          endpoint: 'trends',
          result,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    } catch (_) {
      /* 캐시 저장 실패해도 응답에 영향 없음 */
    }

    return json(cors, result);
  } catch (err) {
    console.error('[Trends] error:', (err as Error).message);
    notifySlack('trends', 502, (err as Error).message);
    return json(cors, { error: 'Google Trends 연결 실패' }, 502);
  }
}
