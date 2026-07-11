// ── LLM Proxy: Claude / Gemini API 중계 + 스트리밍 ──
// ★ v3.5.8: 아래 allowlist는 shared-config.json의 ALLOWED_*_MODELS와 반드시 동기화
// Edge Function에서는 JSON import가 불편하므로 하드코딩 유지, 변경 시 양쪽 수정 필수

import { json, checkRate, logUsage, notifySlack } from './utils.ts';

const ALLOWED_CLAUDE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-5-20251001',
];
const ALLOWED_GEMINI_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

// ★ v3.5.8: 에러 메시지 통일 (shared-config.json의 ERROR_MESSAGES와 동기화)
const E = {
  claude_no_key: 'Claude API 키가 서버에 설정되지 않았습니다',
  gemini_no_key: 'Gemini API 키가 서버에 설정되지 않았습니다',
  rate_limit: '요청 한도 초과',
  upstream_error: 'AI API 오류',
};

// ── 일반 (non-streaming) LLM 호출 ──
export async function handleLLM(
  cors: Record<string, string>,
  req: Request,
  svc: any,
  userId: string,
  userRole = 'user'
) {
  if (req.method !== 'POST') return json(cors, { error: 'POST only' }, 405);
  const rate = await checkRate(svc, userId, 'llm', userRole);
  if (!rate.allowed) return json(cors, { error: E.rate_limit, code: 'RATE_LIMIT' }, 429);
  const rh = rate.rateHeaders || {};
  const start = Date.now();
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
  }
  const prompt = body.prompt;
  if (!prompt) return json(cors, { error: 'prompt required' }, 400);
  if (prompt.length > 30000) return json(cors, { error: 'Too long' }, 400);

  const provider = (body.provider || 'claude').toLowerCase();

  let resp: Response;
  if (provider === 'claude') {
    const apiKey = Deno.env.get('CLAUDE_API_KEY');
    if (!apiKey) return json(cors, { error: E.claude_no_key, code: 'MISSING_KEY' }, 502);
    const model = ALLOWED_CLAUDE_MODELS.includes(body.model)
      ? body.model
      : ALLOWED_CLAUDE_MODELS[0];
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(body.max_tokens || 4096, 8192),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } else {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json(cors, { error: E.gemini_no_key, code: 'MISSING_KEY' }, 502);
    const model = ALLOWED_GEMINI_MODELS.includes(body.model)
      ? body.model
      : ALLOWED_GEMINI_MODELS[0];
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
  }
  const data = await resp.json();
  await logUsage(svc, userId, 'llm', resp.status, Date.now() - start);
  if (!resp.ok) {
    console.error('[LLM] upstream error:', resp.status);
    notifySlack('llm', resp.status, `AI API ${resp.status}`, userId);
    return json(
      cors,
      { error: E.upstream_error, code: 'UPSTREAM_ERROR', upstream_status: resp.status },
      502
    );
  }
  return json(cors, data, 200, rh);
}

// ── SSE 스트리밍 LLM 호출 ──
export async function handleLLMStream(
  cors: Record<string, string>,
  req: Request,
  svc: any,
  userId: string,
  userRole = 'user'
) {
  if (req.method !== 'POST') return json(cors, { error: 'POST only' }, 405);
  const rate = await checkRate(svc, userId, 'llm', userRole);
  if (!rate.allowed) return json(cors, { error: E.rate_limit, code: 'RATE_LIMIT' }, 429);
  const start = Date.now();
  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return json(cors, { error: '잘못된 요청 형식입니다' }, 400);
  }
  const prompt = body.prompt;
  if (!prompt) return json(cors, { error: 'prompt required' }, 400);
  if (prompt.length > 30000) return json(cors, { error: 'Too long' }, 400);

  const provider = (body.provider || 'claude').toLowerCase();
  const encoder = new TextEncoder();

  // SSE 스트림 생성
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };
      try {
        if (provider === 'claude') {
          const apiKey = Deno.env.get('CLAUDE_API_KEY');
          if (!apiKey) {
            send(JSON.stringify({ error: E.claude_no_key }));
            controller.close();
            return;
          }
          const model = ALLOWED_CLAUDE_MODELS.includes(body.model)
            ? body.model
            : ALLOWED_CLAUDE_MODELS[0];
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: Math.min(body.max_tokens || 8192, 16384),
              stream: true,
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            send(
              JSON.stringify({
                error: `Claude API ${resp.status}`,
                detail: errBody.substring(0, 200),
              })
            );
            controller.close();
            await logUsage(svc, userId, 'llm-stream', resp.status, Date.now() - start);
            return;
          }
          // Claude SSE → 우리 SSE로 중계
          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;
              try {
                const evt = JSON.parse(payload);
                if (evt.type === 'content_block_delta' && evt.delta?.text) {
                  send(JSON.stringify({ t: evt.delta.text }));
                }
                if (evt.type === 'message_stop') {
                  send(JSON.stringify({ done: true }));
                }
              } catch (_) {
                /* skip unparseable */
              }
            }
          }
        } else {
          // Gemini: streamGenerateContent
          const apiKey = Deno.env.get('GEMINI_API_KEY');
          if (!apiKey) {
            send(JSON.stringify({ error: E.gemini_no_key }));
            controller.close();
            return;
          }
          const model = ALLOWED_GEMINI_MODELS.includes(body.model)
            ? body.model
            : ALLOWED_GEMINI_MODELS[0];
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: Math.min(body.max_tokens || 8192, 16384) },
              }),
            }
          );
          if (!resp.ok) {
            const errBody = await resp.text();
            send(
              JSON.stringify({
                error: `Gemini API ${resp.status}`,
                detail: errBody.substring(0, 200),
              })
            );
            controller.close();
            await logUsage(svc, userId, 'llm-stream', resp.status, Date.now() - start);
            return;
          }
          const reader = resp.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              try {
                const evt = JSON.parse(payload);
                const text = evt.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) send(JSON.stringify({ t: text }));
              } catch (_) {
                /* skip */
              }
            }
          }
        }
        send(JSON.stringify({ done: true }));
        await logUsage(svc, userId, 'llm-stream', 200, Date.now() - start);
      } catch (err) {
        const msg = (err as Error).message || '스트리밍 오류';
        try {
          send(JSON.stringify({ error: msg }));
        } catch (_) {
          /* already closed */
        }
        await logUsage(svc, userId, 'llm-stream', 500, Date.now() - start, msg);
        notifySlack('llm-stream', 500, msg, userId);
      } finally {
        try {
          controller.close();
        } catch (_) {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
