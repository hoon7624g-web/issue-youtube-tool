// ── 실시간 인기 검색어: adsensefarm.kr PHP API 직접 호출 (줌 + 네이트 + 구글트렌드, 10분 캐시) ──

import { json, getServiceClient, notifySlack } from './utils.ts';

const BASE = 'https://adsensefarm.kr/realtime/';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://adsensefarm.kr/realtime/',
};

async function fetchKeywords(
  endpoint: string
): Promise<{ keywords: { keyword: string; rank: number }[]; time: string }> {
  try {
    const resp = await fetch(BASE + endpoint, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(endpoint + ' HTTP ' + resp.status);
    const d = await resp.json();
    if (d.result !== 'success' || !Array.isArray(d.data)) return { keywords: [], time: '' };
    const keywords = d.data
      .filter((kw: any) => kw && typeof kw === 'string')
      .slice(0, 10)
      .map((kw: string, i: number) => ({ keyword: kw.trim(), rank: i + 1 }));
    return { keywords, time: d.nowtime || '' };
  } catch (e) {
    console.warn('[RealtimeKW] ' + endpoint + ' failed:', (e as Error).message);
    return { keywords: [], time: '' };
  }
}

export async function handleRealtimeKeywords(cors: Record<string, string>) {
  const svc = getServiceClient();

  // ── 캐시 확인 (10분) ──
  try {
    const { data: cached } = await svc
      .from('youtube_cache')
      .select('result')
      .eq('cache_key', 'realtime-kw:kr')
      .gt('expires_at', new Date().toISOString())
      .single();
    if (cached) return json(cors, cached.result);
  } catch (_) {
    /* 캐시 미스 */
  }

  // ── 3개 API 병렬 호출 ──
  const [zumData, nateData, googleData] = await Promise.all([
    fetchKeywords('zum.php'),
    fetchKeywords('nate.php'),
    fetchKeywords('googletrend.php'),
  ]);

  const result = {
    zum: zumData.keywords,
    nate: nateData.keywords,
    google: googleData.keywords,
    source: 'adsensefarm',
    time: zumData.time || nateData.time || googleData.time || '',
    count: zumData.keywords.length + nateData.keywords.length + googleData.keywords.length,
  };

  // ── 캐시 저장 (10분) ──
  if (result.count > 0) {
    try {
      await svc.from('youtube_cache').upsert(
        {
          cache_key: 'realtime-kw:kr',
          endpoint: 'realtime-keywords',
          result,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        { onConflict: 'cache_key' }
      );
    } catch (_) {}
  }

  return json(cors, result);
}
