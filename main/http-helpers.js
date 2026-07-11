// ═══════════════════════════════════════════════
// main/http-helpers.js — 공용 HTTP 헬퍼 (v3.6.0)
// ipc-llm / ipc-tts / ipc-elevenlabs 공통 함수 통합
//
// 추가 보강:
// - non-stream 요청 AbortSignal 지원
// - requestId 기반 취소 시 req.destroy()로 즉시 해제
// ═══════════════════════════════════════════════
const https = require('https');

const DEFAULT_MAX_RESPONSE = 10 * 1024 * 1024; // 10MB

function _maskKey(msg) {
  if (!msg) return msg;
  return msg.replace(/key=[^&\s"']+/gi, 'key=***');
}

function _attachAbort(signal, req, resolveCancelled) {
  if (!signal) return () => {};
  const onAbort = () => {
    try { req.destroy(new Error('cancelled')); } catch (_) {}
    if (resolveCancelled) resolveCancelled();
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  return () => {
    try { signal.removeEventListener('abort', onAbort); } catch (_) {}
  };
}

function httpsPost(options, body, timeout, maxResponseBody, signal) {
  timeout = timeout || 300000;
  maxResponseBody = maxResponseBody || DEFAULT_MAX_RESPONSE;
  return new Promise((resolve) => {
    let settled = false;
    const _resolve = (v) => { if (settled) return; settled = true; if (cleanupAbort) cleanupAbort(); resolve(v); };
    if (signal && signal.aborted) return _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true });

    let tooLarge = false;
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        if (tooLarge) return;
        data += chunk;
        if (Buffer.byteLength(data) > maxResponseBody) {
          tooLarge = true;
          req.destroy();
          _resolve({ statusCode: 0, body: '', error: 'Response too large' });
        }
      });
      res.on('end', () => { if (!tooLarge) _resolve({ statusCode: res.statusCode, body: data }); });
    });
    const cleanupAbort = _attachAbort(signal, req, () => _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true }));
    req.on('error', e => {
      if (signal && signal.aborted) return _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true });
      _resolve({ statusCode: 0, body: '', error: _maskKey(e.message) });
    });
    req.setTimeout(timeout, () => { req.destroy(); _resolve({ statusCode: 0, body: '', error: '요청 시간 초과' }); });
    req.write(body);
    req.end();
  });
}

function httpsPostBuffer(options, body, timeout, maxResponseBody, signal) {
  timeout = timeout || 60000;
  maxResponseBody = maxResponseBody || 50 * 1024 * 1024;
  return new Promise((resolve) => {
    let settled = false;
    const _resolve = (v) => { if (settled) return; settled = true; if (cleanupAbort) cleanupAbort(); resolve(v); };
    if (signal && signal.aborted) return _resolve({ statusCode: 499, body: Buffer.alloc(0), error: 'cancelled', cancelled: true });

    let tooLarge = false;
    const req = https.request(options, (res) => {
      const chunks = [];
      let totalLen = 0;
      res.on('data', chunk => {
        if (tooLarge) return;
        totalLen += chunk.length;
        if (totalLen > maxResponseBody) {
          tooLarge = true;
          req.destroy();
          _resolve({ statusCode: 0, body: Buffer.alloc(0), error: 'Response too large' });
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => { if (!tooLarge) _resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }); });
    });
    const cleanupAbort = _attachAbort(signal, req, () => _resolve({ statusCode: 499, body: Buffer.alloc(0), error: 'cancelled', cancelled: true }));
    req.on('error', e => {
      if (signal && signal.aborted) return _resolve({ statusCode: 499, body: Buffer.alloc(0), error: 'cancelled', cancelled: true });
      _resolve({ statusCode: 0, body: Buffer.alloc(0), error: _maskKey(e.message) || '네트워크 오류' });
    });
    req.setTimeout(timeout, () => { req.destroy(); _resolve({ statusCode: 0, body: Buffer.alloc(0), error: '요청 시간 초과' }); });
    if (typeof body === 'string') req.write(body);
    else if (Buffer.isBuffer(body)) req.write(body);
    req.end();
  });
}

function httpsStream(options, body, onChunk, onDone, onError, timeout, maxResponseBody, signal) {
  timeout = timeout || 300000;
  maxResponseBody = maxResponseBody || DEFAULT_MAX_RESPONSE;

  let settled = false;
  let cleanupAbort = null;
  const _onDone = () => { if (settled) return; settled = true; if (cleanupAbort) cleanupAbort(); onDone(); };
  const _onError = (err) => { if (settled) return; settled = true; if (cleanupAbort) cleanupAbort(); onError(err); };

  // ★ P2-fix: AbortSignal 지원 — httpsPost/httpsGet과 인터페이스 통일
  if (signal && signal.aborted) { _onError({ statusCode: 499, error: 'cancelled', cancelled: true }); return null; }

  const req = https.request(options, (res) => {
    if (res.statusCode >= 400) {
      let data = '';
      let tooLarge = false;
      res.on('data', chunk => {
        if (tooLarge) return;
        data += chunk;
        if (Buffer.byteLength(data) > maxResponseBody) {
          tooLarge = true;
          req.destroy();
          _onError({ statusCode: res.statusCode, body: '', error: 'Error response too large' });
        }
      });
      res.on('end', () => { if (!tooLarge) _onError({ statusCode: res.statusCode, body: data }); });
      return;
    }
    res.setEncoding('utf-8');
    let buffer = '';
    res.on('data', chunk => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        onChunk(payload);
      }
    });
    res.on('end', () => {
      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith('data: ')) {
          const payload = remaining.slice(6).trim();
          if (payload && payload !== '[DONE]') onChunk(payload);
        }
      }
      _onDone();
    });
  });
  cleanupAbort = _attachAbort(signal, req, () => _onError({ statusCode: 499, error: 'cancelled', cancelled: true }));
  req.on('error', e => {
    if (signal && signal.aborted) return _onError({ statusCode: 499, error: 'cancelled', cancelled: true });
    _onError({ statusCode: 0, error: _maskKey(e.message) });
  });
  req.setTimeout(timeout, () => { req.destroy(); _onError({ statusCode: 0, error: '스트리밍 요청 시간 초과' }); });
  req.write(body);
  req.end();
  return req;
}

function httpsGet(url, headers, timeout, signal) {
  timeout = timeout || 15000;
  return new Promise((resolve) => {
    let settled = false;
    const _resolve = (v) => { if (settled) return; settled = true; clearTimeout(timer); if (cleanupAbort) cleanupAbort(); resolve(v); };
    if (signal && signal.aborted) return _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true });

    let tooLarge = false;
    const req = https.get(url, { headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', chunk => {
        if (tooLarge) return;
        data += chunk;
        if (Buffer.byteLength(data) > 1 * 1024 * 1024) {
          tooLarge = true;
          req.destroy();
          _resolve({ statusCode: 0, body: '', error: 'Response too large' });
        }
      });
      res.on('end', () => { if (!tooLarge) _resolve({ statusCode: res.statusCode, body: data }); });
    });
    const cleanupAbort = _attachAbort(signal, req, () => _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true }));
    req.on('error', e => {
      if (signal && signal.aborted) return _resolve({ statusCode: 499, body: '', error: 'cancelled', cancelled: true });
      _resolve({ statusCode: 0, body: '', error: _maskKey(e.message) });
    });
    const timer = setTimeout(() => { req.destroy(); _resolve({ statusCode: 0, body: '', error: '요청 시간 초과' }); }, timeout);
  });
}

module.exports = { httpsPost, httpsPostBuffer, httpsStream, httpsGet, DEFAULT_MAX_RESPONSE, maskKey: _maskKey };
