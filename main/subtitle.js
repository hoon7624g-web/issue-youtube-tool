// ═══════════════════════════════════════════════
// main/subtitle.js — 자막 추출 (v3.6.0)
// 1순위: HTTP 직접 파싱 (2~3초) — ytInitialPlayerResponse에서 자막 URL 추출
// 2순위: hidden BrowserWindow fallback (15~25초)
// P0-4: httpsGet에 settled guard + timeout destroy 추가 (소켓 누수 방지)
// ═══════════════════════════════════════════════
const { BrowserWindow } = require('electron');
const https = require('https');
const log = require('electron-log');

// ── HTTP GET 헬퍼 ──
const MAX_RESPONSE_BODY = 10 * 1024 * 1024; // 10MB 상한

const MAX_PLAYER_RESPONSE_SCAN = 2 * 1024 * 1024; // ytInitialPlayerResponse 최대 2MB만 스캔

function extractBalancedJson(source, startIdx, maxLen) {
  const limit = Math.min(source.length, startIdx + (maxLen || MAX_PLAYER_RESPONSE_SCAN));
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < limit; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.substring(startIdx, i + 1);
    }
  }
  // ★ v3.6.0: 실패 원인 구분 — 스캔 상한 도달 vs 구조 불일치
  if (limit < source.length && depth > 0) return { truncated: true };
  return '';
}

function httpsGet(url, timeout, maxRedirects) {
  timeout = timeout || 15000;
  if (maxRedirects === undefined) maxRedirects = 5;
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) { reject(new Error('Too many redirects')); return; }

    let settled = false;
    const _resolve = (v) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
    const _reject = (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); };

    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      }
    };
    const req = https.get(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (settled) return;
        res.resume();
        try {
          const nextUrl = new URL(res.headers.location, url);
          const allowedHosts = [
            'www.youtube.com', 'youtube.com', 'youtu.be',
            'video.google.com', 'www.google.com', 'accounts.google.com',
            'consent.youtube.com', 'consent.google.com'
          ];
          if (nextUrl.protocol !== 'https:' || !allowedHosts.some(h => nextUrl.hostname === h || nextUrl.hostname.endsWith('.' + h))) {
            _reject(new Error('Untrusted redirect: ' + nextUrl.hostname));
            return;
          }
          // settled guard를 재귀 호출에 위임 — clearTimeout은 _resolve/_reject에서 처리
          httpsGet(nextUrl.href, timeout, maxRedirects - 1).then(_resolve).catch(_reject);
        } catch (e) {
          _reject(new Error('Invalid redirect URL'));
        }
        return;
      }
      let body = '';
      let tooLarge = false;
      res.on('data', c => {
        if (tooLarge) return;
        body += c;
        if (Buffer.byteLength(body) > MAX_RESPONSE_BODY) {
          tooLarge = true;
          req.destroy();
          _reject(new Error('Response too large'));
        }
      });
      res.on('end', () => { if (!tooLarge) _resolve(body); });
    });
    req.on('error', e => { _reject(e); });
    const timer = setTimeout(() => { req.destroy(); _reject(new Error('timeout')); }, timeout);
  });
}

// ── timedtext JSON → 텍스트 변환 ──
function parseTimedTextJson(jsonStr) {
  try {
    const json = JSON.parse(jsonStr);
    const events = json.events || [];
    const lines = events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join(''))
      .filter(t => t.trim());
    const text = lines.join(' ').replace(/\n/g, ' ').trim();
    if (text.length > 10) return { text, lineCount: lines.length, charCount: text.length };
  } catch (e) { /* not valid json3 */ }
  return null;
}

// ── timedtext XML → 텍스트 변환 ──
function parseTimedTextXml(xmlStr) {
  const matches = [...xmlStr.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)];
  if (matches.length === 0) return null;
  const lines = matches
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const text = lines.join(' ');
  if (text.length > 10) return { text, lineCount: lines.length, charCount: text.length };
  return null;
}

// ═══════════════════════════════════════════════
// 1순위: HTTP 직접 파싱 (빠름 — BrowserWindow 불필요)
// YouTube HTML에서 ytInitialPlayerResponse → captionTracks URL 추출
// ═══════════════════════════════════════════════
async function fastExtract(videoId) {
  const pageUrl = 'https://www.youtube.com/watch?v=' + videoId;
  log.info('[Sub:Fast] 시작:', videoId);
  const t0 = Date.now();

  const html = await httpsGet(pageUrl, 12000);
  log.info('[Sub:Fast] HTML 수신:', html.length + '자', (Date.now() - t0) + 'ms');

  // ytInitialPlayerResponse JSON 추출 (bounded scan — 대형 HTML 정규식 역추적 방지)
  const startKey = 'ytInitialPlayerResponse';
  const startIdx = html.indexOf(startKey);
  if (startIdx === -1) throw new Error('ytInitialPlayerResponse not found');
  const jsonStart = html.indexOf('{', startIdx);
  if (jsonStart === -1) throw new Error('ytInitialPlayerResponse json start not found');
  const jsonText = extractBalancedJson(html, jsonStart, MAX_PLAYER_RESPONSE_SCAN);
  if (!jsonText || typeof jsonText === 'object') {
    const reason = (jsonText && jsonText.truncated) ? 'JSON이 스캔 상한(' + (MAX_PLAYER_RESPONSE_SCAN / 1024 / 1024) + 'MB)을 초과' : '구조 불일치';
    throw new Error('ytInitialPlayerResponse parse failed: ' + reason);
  }
  const playerResponse = JSON.parse(jsonText);

  // captionTracks에서 자막 URL 찾기
  const captions = playerResponse.captions;
  if (!captions || !captions.playerCaptionsTracklistRenderer) throw new Error('no captions');
  const tracks = captions.playerCaptionsTracklistRenderer.captionTracks || [];
  if (tracks.length === 0) throw new Error('no caption tracks');

  // 한국어 우선, 없으면 첫 번째 트랙
  const koTrack = tracks.find(t => t.languageCode === 'ko') || tracks[0];
  const baseUrl = koTrack.baseUrl;
  const lang = koTrack.languageCode || 'unknown';
  const isAsr = koTrack.kind === 'asr';

  log.info('[Sub:Fast] 자막 트랙 발견:', lang, isAsr ? '(자동생성)' : '(수동)', tracks.length + '개 중');

  // json3 포맷으로 자막 가져오기
  let timedTextUrl = baseUrl;
  if (timedTextUrl.includes('fmt=')) {
    timedTextUrl = timedTextUrl.replace(/fmt=[^&]*/, 'fmt=json3');
  } else {
    timedTextUrl += '&fmt=json3';
  }

  // 도메인 검증
  try {
    const u = new URL(timedTextUrl);
    if (!u.hostname.endsWith('youtube.com') && !u.hostname.endsWith('google.com')) {
      throw new Error('untrusted caption host: ' + u.hostname);
    }
  } catch (e) { throw e; }

  const timedText = await httpsGet(timedTextUrl, 10000);
  log.info('[Sub:Fast] timedtext 수신:', timedText.length + '자', (Date.now() - t0) + 'ms');

  // json3 파싱 시도
  const jsonResult = parseTimedTextJson(timedText);
  if (jsonResult) {
    log.info('[Sub:Fast] 완료 (json3):', jsonResult.charCount + '자,', (Date.now() - t0) + 'ms');
    return { ...jsonResult, language: lang, method: 'fast-json3', asr: isAsr };
  }

  // XML 폴백
  const xmlUrl = baseUrl.includes('fmt=') ? baseUrl.replace(/fmt=[^&]*/, 'fmt=srv3') : baseUrl;
  const xmlText = await httpsGet(xmlUrl, 10000);
  const xmlResult = parseTimedTextXml(xmlText);
  if (xmlResult) {
    log.info('[Sub:Fast] 완료 (xml):', xmlResult.charCount + '자,', (Date.now() - t0) + 'ms');
    return { ...xmlResult, language: lang, method: 'fast-xml', asr: isAsr };
  }

  throw new Error('caption parse failed');
}

// ═══════════════════════════════════════════════
// 2순위: BrowserWindow fallback (느리지만 확실)
// 쿠키/로그인이 필요한 제한 영상 등에서 사용
// ═══════════════════════════════════════════════
function slowExtract(videoId, hardenChildWindow) {
  return new Promise((resolve) => {
    let resolved = false;
    const _timers = [];
    const done = (data) => {
      if (resolved) return; resolved = true;
      data.videoId = videoId; if (!data.text) data.text = '';
      log.info('[Sub:Slow] Done:', data.method || 'error', data.charCount || 0, 'chars');
      clearTimeout(safetyTimeout); _timers.forEach(t => clearTimeout(t));
      try { hidden.webContents.session.webRequest.onCompleted({ urls: ['*://*.youtube.com/api/timedtext*', '*://*.google.com/api/timedtext*'] }, null); } catch(e) {}
      try { hidden.destroy(); } catch(e) {}
      resolve(data);
    };

    const safetyTimeout = setTimeout(() => done({ error: '자막 로딩 시간이 초과되었습니다 (30초).' }), 30000);

    const hidden = new BrowserWindow({
      width: 1280, height: 720, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'subtitle-' + videoId + '-' + Date.now() }
    });
    // ★ v3.6.2 P2-3: 빠른 httpsGet 경로의 allowlist와 일치시킴.
    //   EU/UK 사용자가 consent.youtube.com / consent.google.com으로 리다이렉트되어도
    //   hidden window에서 정상 처리되도록 함. (이전: youtube.com / accounts.google.com만 허용 → consent 흐름에서 차단됨)
    hardenChildWindow(hidden, [
      'https://www.youtube.com', 'https://youtube.com', 'https://youtu.be',
      'https://video.google.com', 'https://www.google.com',
      'https://accounts.google.com',
      'https://consent.youtube.com', 'https://consent.google.com'
    ]);
    hidden.webContents.setAudioMuted(true);

    let captionCaptured = false;
    hidden.webContents.session.webRequest.onCompleted(
      { urls: ['*://*.youtube.com/api/timedtext*', '*://*.google.com/api/timedtext*'] },
      async (details) => {
        if (captionCaptured || resolved) return;
        try { const u = new URL(details.url); if (!u.hostname.endsWith('youtube.com') && !u.hostname.endsWith('google.com')) return; } catch(e) { return; }
        try { const _u = new URL(details.url); if (!_u.pathname.includes('/api/timedtext')) return; } catch (_) { return; }

        captionCaptured = true;
        try {
          await hidden.webContents.executeJavaScript('window.__captionUrl = ' + JSON.stringify(String(details.url)) + ';');
          const result = await hidden.webContents.executeJavaScript(`
            (async function() {
              try {
                var url = window.__captionUrl;
                if (!url) return JSON.stringify({error: 'no url'});
                var json3Url = url.replace(/fmt=[^&]*/, 'fmt=json3');
                if (json3Url.indexOf('fmt=') === -1) json3Url += '&fmt=json3';
                var r = await fetch(json3Url, {credentials: 'include'});
                var finalJsonUrl = new URL(r.url || json3Url);
                if (!(/(^|\.)youtube\.com$/.test(finalJsonUrl.hostname) || /(^|\.)google\.com$/.test(finalJsonUrl.hostname)) || finalJsonUrl.pathname.indexOf('/api/timedtext') === -1) {
                  throw new Error('untrusted final caption url');
                }
                var body = await r.text();
                if (body.length > 50) {
                  try {
                    var json = JSON.parse(body);
                    var events = json.events || [];
                    var lines = events.filter(function(e){return e.segs;}).map(function(e){return e.segs.map(function(s){return s.utf8||'';}).join('');}).filter(function(t){return t.trim();});
                    var text = lines.join(' ').replace(/\\\\n/g,' ').trim();
                    if (text.length > 10) return JSON.stringify({text:text, lineCount:lines.length, charCount:text.length, method:'slow-json3'});
                  } catch(e) {}
                }
                var r2 = await fetch(url, {credentials: 'include'});
                var finalXmlUrl = new URL(r2.url || url);
                if (!(/(^|\.)youtube\.com$/.test(finalXmlUrl.hostname) || /(^|\.)google\.com$/.test(finalXmlUrl.hostname)) || finalXmlUrl.pathname.indexOf('/api/timedtext') === -1) {
                  throw new Error('untrusted final caption url');
                }
                var body2 = await r2.text();
                return JSON.stringify({raw: body2.substring(0, 100000), rawLen: body2.length});
              } catch(e) { return JSON.stringify({error: e.message}); }
            })()
          `);
          const data = JSON.parse(result);
          if (data.error) {
            // ★ Fix #2 + P0-3: executeJavaScript 내부 에러 시 즉시 실패 처리
            // captionCaptured는 리셋하지 않음 — done() 내부의 resolved 플래그가 이중 호출 방지
            log.warn('[Sub:Slow] 브라우저 내부 에러:', data.error);
            done({ error: '자막 추출 실패: ' + data.error });
            return;
          }
          if (data.text) {
            const langMatch = details.url.match(/[&?]lang=([^&]+)/);
            done({ text: data.text, language: langMatch ? langMatch[1] : 'unknown', lineCount: data.lineCount, charCount: data.charCount, method: data.method });
          } else if (data.raw && data.rawLen > 50) {
            const xmlResult = parseTimedTextXml(data.raw);
            if (xmlResult) {
              const langMatch = details.url.match(/[&?]lang=([^&]+)/);
              done({ ...xmlResult, language: langMatch ? langMatch[1] : 'unknown', method: 'slow-xml' });
              return;
            }
            // ★ Fix #2 + P0-3: XML 파싱도 실패한 경우 즉시 done() 호출 (20초 무응답 방지)
            log.warn('[Sub:Slow] json3/xml 파싱 모두 실패, rawLen:', data.rawLen);
            done({ error: '자막 데이터를 파싱할 수 없습니다 (형식 불일치)' });
          } else {
            // ★ Fix #2 + P0-3: 자막 데이터 자체가 비어있는 경우
            log.warn('[Sub:Slow] 자막 데이터 비어있음');
            done({ error: '자막 데이터가 비어있습니다' });
          }
        } catch(e) {
          // ★ P1-7 + P0-3: 예외 시 즉시 실패 처리 (타이머까지 대기하지 않고 window 즉시 정리)
          log.warn('[Sub:Slow] executeJavaScript 예외:', e.message);
          done({ error: '자막 파싱 중 오류: ' + (e.message || 'unknown') });
        }
      }
    );

    hidden.webContents.on('did-finish-load', () => {
      _timers.push(setTimeout(() => { if (!resolved) done({ error: 'YouTube 자막 API를 감지하지 못했습니다.' }); }, 20000));
      _timers.push(setTimeout(async () => {
        try {
          await hidden.webContents.executeJavaScript(`(function() {
            var video = document.querySelector('video');
            if (video) { video.muted = true; video.play().catch(function(){}); }
            var subBtn = document.querySelector('.ytp-subtitles-button');
            if (subBtn && subBtn.getAttribute('aria-pressed') !== 'true') subBtn.click();
          })()`);
        } catch(e) {}
      }, 2000));
    });

    hidden.loadURL('https://www.youtube.com/watch?v=' + videoId);
  });
}

// ═══════════════════════════════════════════════
// IPC 등록 — fast → slow 2단계 전략
// ★ 실패 캐싱 (10분) + slow fallback 동시 실행 1개 제한
// ═══════════════════════════════════════════════
const _subtitleFailCache = new Map(); // videoId → { ts, error }
const FAIL_CACHE_TTL = 10 * 60 * 1000; // 10분
const FAIL_CACHE_MAX_SIZE = 200; // P2-9: 최대 항목 수 제한
// ★ v3.5.8: 전역 boolean 락 → videoId 기준 dedupe + 동시 실행 제한
const _slowJobs = new Map(); // videoId → Promise
const MAX_CONCURRENT_SLOW = 2; // BrowserWindow 메모리 보호 (각 200~300MB)

// P2-9: 주기적 만료 항목 정리 (메모리 누수 방지)
// ★ v3.6.0: lazy init — registerSubtitleIPC() 호출 시 시작 (require 시점에 timer 생성 방지)
let _failCacheCleanupInterval = null;

function _startFailCacheCleanup() {
  if (_failCacheCleanupInterval) return; // 이미 실행 중
  _failCacheCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _subtitleFailCache) {
      if (now - v.ts > FAIL_CACHE_TTL) _subtitleFailCache.delete(k);
    }
    // 크기 상한 초과 시 가장 오래된 항목부터 제거
    if (_subtitleFailCache.size > FAIL_CACHE_MAX_SIZE) {
      const entries = [..._subtitleFailCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      const toRemove = entries.slice(0, _subtitleFailCache.size - FAIL_CACHE_MAX_SIZE);
      toRemove.forEach(([k]) => _subtitleFailCache.delete(k));
    }
  }, FAIL_CACHE_TTL);
}

function registerSubtitleIPC(ipcMain, assertTrustedSender, asString, isValidVideoId, hardenChildWindow) {
  _startFailCacheCleanup(); // ★ IPC 등록 시점에 timer 시작
  ipcMain.handle('get-subtitle', async (event, videoId) => {
    assertTrustedSender(event);
    if (!videoId) return { error: 'videoId required', text: '' };
    videoId = asString(videoId, 32);
    if (!isValidVideoId(videoId)) return { text: '', error: 'Invalid video ID' };

    // ★ 최근 실패한 videoId는 재시도 제한 (10분 쿨다운)
    const cached = _subtitleFailCache.get(videoId);
    if (cached && Date.now() - cached.ts < FAIL_CACHE_TTL) {
      log.info('[Sub] 실패 캐시 히트:', videoId, cached.error);
      return { videoId, text: '', error: '자막 추출 실패 (10분 후 재시도 가능): ' + cached.error };
    }

    // 1순위: HTTP 직접 파싱 (2~3초)
    try {
      const result = await fastExtract(videoId);
      _subtitleFailCache.delete(videoId); // 성공 시 캐시 제거
      return { videoId, ...result };
    } catch (e) {
      log.warn('[Sub] Fast 실패 (' + e.message + '), BrowserWindow fallback 시작');
    }

    // 2순위: BrowserWindow (15~25초) — videoId 기준 dedupe + 동시 실행 제한
    // ★ v3.5.8: 같은 videoId 중복 호출은 합치고, 다른 영상은 동시 실행 허용 (최대 2개)
    if (_slowJobs.has(videoId)) {
      log.info('[Sub] slow fallback 이미 실행 중 (같은 videoId) — 기존 작업 대기');
      return _slowJobs.get(videoId);
    }

    if (_slowJobs.size >= MAX_CONCURRENT_SLOW) {
      log.warn('[Sub] slow fallback 동시 실행 상한 (' + MAX_CONCURRENT_SLOW + '개) 도달');
      return { videoId, text: '', error: '자막 추출 대기열이 가득 찼습니다. 잠시 후 다시 시도해주세요.' };
    }

    const job = slowExtract(videoId, hardenChildWindow)
      .then(result => {
        if (result.text && result.text.length > 10) {
          _subtitleFailCache.delete(videoId);
        } else if (result.error) {
          _subtitleFailCache.set(videoId, { ts: Date.now(), error: result.error });
        }
        return result;
      })
      .catch(e => {
        _subtitleFailCache.set(videoId, { ts: Date.now(), error: e.message || 'unknown' });
        return { videoId, text: '', error: e.message };
      })
      .finally(() => {
        _slowJobs.delete(videoId);
      });

    _slowJobs.set(videoId, job);
    return job;
  });
}

module.exports = { registerSubtitleIPC, getFailCacheCleanupInterval: () => _failCacheCleanupInterval };
