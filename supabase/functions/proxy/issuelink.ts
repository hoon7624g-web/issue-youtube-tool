// ── 이슈링크 핫이슈 키워드 (메인) + Google News (보조 fallback) ──
// 이슈링크가 메인 소스, 실패 시에만 Google News 보조
// 캐시 + 만료 캐시 반환으로 빈 결과 최소화

import { json, getServiceClient, notifySlack } from "./utils.ts";

const CACHE_KEY = "issuelink:hot";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분

// ── 이슈링크 크롤링 (메인) ──
async function crawlIssueLink(): Promise<{ keyword: string; rank: number }[]> {
  const resp = await fetch("https://www.issuelink.co.kr", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });

  if (!resp.ok) throw new Error("HTTP " + resp.status);

  const html = await resp.text();
  if (html.length < 500) throw new Error("HTML too short: " + html.length + "자");

  const keywords: { keyword: string; rank: number }[] = [];
  const seen = new Set<string>();

  // 다중 패턴 매칭 (가장 많이 매칭되는 걸 사용)
  const patterns: [RegExp, string][] = [
    [/class="[^"]*btn-danger[^"]*"[^>]*>([^<]+)/g, "btn-danger"],
    [/class="[^"]*btn[^"]*danger[^"]*"[^>]*>([^<]+)/g, "btn*danger"],
    [/class="[^"]*hot[_-]?keyword[^"]*"[^>]*>([^<]+)/g, "hot-keyword"],
    [/class="[^"]*badge[^"]*"[^>]*>([^<]{2,25})<\//g, "badge"],
    [/class="[^"]*keyword[^"]*"[^>]*>([^<]{2,25})<\//g, "keyword"],
    [/class="[^"]*issue[^"]*"[^>]*>([^<]{2,25})<\//g, "issue"],
    [/class="[^"]*rank[^"]*"[^>]*>([^<]{2,25})<\//g, "rank"],
    [/class="[^"]*tag[^"]*"[^>]*>\s*([가-힣a-zA-Z0-9\s]{2,25})\s*<\//g, "tag-ko"],
    [/<a[^>]*class="[^"]*"[^>]*>([가-힣]{2,20})<\/a>/g, "a-ko"],
    // 순위 + 키워드 패턴 (1. 키워드, #1 키워드 등)
    [/(?:^|\n)\s*(?:\d+[\.\)]\s*|#\d+\s*)([가-힣a-zA-Z0-9\s]{2,25})/gm, "numbered"],
  ];

  for (const [regex, patternName] of patterns) {
    let match;
    while ((match = regex.exec(html)) !== null && keywords.length < 10) {
      const text = match[1].trim();
      // 키워드 품질 필터: 한글 포함, 너무 짧거나 길지 않음, HTML 태그 아님
      if (
        text.length >= 2 && text.length <= 25 &&
        /[가-힣]/.test(text) &&
        !/</.test(text) &&
        !seen.has(text)
      ) {
        seen.add(text);
        keywords.push({ keyword: text, rank: keywords.length + 1 });
      }
    }
    if (keywords.length >= 8) {
      console.log("[IssueLink] 패턴 '" + patternName + "'으로 " + keywords.length + "개 매칭");
      break;
    }
    // 이 패턴으로 못 찾으면 다음 패턴 시도 (regex lastIndex 리셋)
  }

  // 디버깅: 어떤 패턴으로도 못 찾은 경우 HTML 샘플 로깅
  if (keywords.length === 0) {
    // class= 속성 목록 추출 (어떤 클래스명이 있는지 확인)
    const classNames = [...html.matchAll(/class="([^"]+)"/g)]
      .map(m => m[1])
      .filter(c => /btn|hot|keyword|badge|issue|rank|tag|danger/i.test(c))
      .slice(0, 20);
    console.error("[IssueLink] 패턴 매칭 0건 — HTML " + html.length + "자, 관련 클래스:", JSON.stringify(classNames));
    throw new Error("패턴 매칭 실패 (HTML " + html.length + "자, classes: " + classNames.slice(0, 5).join(", ") + ")");
  }

  return keywords;
}

// ── Google News 보조 (이슈링크 실패 시에만) ──
async function crawlGoogleNews(): Promise<{ keyword: string; rank: number }[]> {
  const resp = await fetch("https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error("Google News HTTP " + resp.status);

  const xml = await resp.text();
  const keywords: { keyword: string; rank: number }[] = [];
  const seen = new Set<string>();

  // RSS title 추출
  const itemRegex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && keywords.length < 10) {
    const raw = match[1].trim();
    // " - 매체명" 제거
    const cleaned = raw.replace(/\s*[-–—|]\s*[^-–—|]+$/, "").trim();
    if (cleaned.length > 2 && cleaned.length < 50 && /[가-힣]/.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      keywords.push({ keyword: cleaned, rank: keywords.length + 1 });
    }
  }
  return keywords;
}

// ── 메인 핸들러 ──
export async function handleIssueLink(cors: Record<string, string>) {
  const svc = getServiceClient();

  // 1순위: 캐시 확인
  try {
    const { data: cached } = await svc.from("youtube_cache")
      .select("result").eq("cache_key", CACHE_KEY)
      .gt("expires_at", new Date().toISOString()).single();
    if (cached?.result?.hotKeywords?.length > 0) {
      return json(cors, cached.result);
    }
  } catch (_) { /* 캐시 미스 */ }

  let keywords: { keyword: string; rank: number }[] = [];
  let source = "issuelink";

  // 2순위: 이슈링크 크롤링 (메인)
  try {
    keywords = await crawlIssueLink();
    source = "issuelink";
    console.log("[IssueLink] 크롤링 성공:", keywords.length + "개");
  } catch (e) {
    console.error("[IssueLink] 크롤링 실패:", (e as Error).message);

    // 3순위: Google News 보조 (이슈링크 실패 시에만)
    try {
      keywords = await crawlGoogleNews();
      source = "google_news_fallback";
      console.log("[IssueLink] Google News 보조:", keywords.length + "개");
    } catch (e2) {
      console.error("[IssueLink] Google News도 실패:", (e2 as Error).message);
    }
  }

  // 4순위: 만료 캐시라도 반환
  if (keywords.length === 0) {
    try {
      const { data: stale } = await svc.from("youtube_cache")
        .select("result").eq("cache_key", CACHE_KEY).single();
      if (stale?.result?.hotKeywords?.length > 0) {
        console.log("[IssueLink] 만료 캐시 반환");
        stale.result._stale = true;
        return json(cors, stale.result);
      }
    } catch (_) {}

    notifySlack("issuelink", 502, "이슈링크 + Google News 모두 실패");
    return json(cors, { hotKeywords: [], source: "none", count: 0 });
  }

  const result = {
    hotKeywords: keywords.slice(0, 10),
    source,
    count: Math.min(keywords.length, 10),
    crawledAt: new Date().toISOString(),
  };

  // 캐시 저장
  try {
    await svc.from("youtube_cache").upsert({
      cache_key: CACHE_KEY, endpoint: "issuelink", result,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    }, { onConflict: "cache_key" });
  } catch (_) {}

  return json(cors, result);
}
