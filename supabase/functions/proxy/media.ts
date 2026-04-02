// ── Media Proxy: Google TTS + ElevenLabs ──

import { json, rawResponse, checkRate, logUsage, notifySlack } from "./utils.ts";

export async function handleTTS(cors: Record<string, string>, req: Request, svc: any, userId: string, userRole = "user") {
  if (req.method !== "POST") return json(cors, { error: "POST only" }, 405);
  const rate = await checkRate(svc, userId, "tts", userRole);
  if (!rate.allowed) return json(cors, { error: "요청 한도 초과" }, 429);
  const rh = rate.rateHeaders || {};
  const start = Date.now();
  let body: any;
  try { body = await req.json(); } catch (_) { return json(cors, { error: "잘못된 요청 형식입니다" }, 400); }
  if (!body.input?.text) return json(cors, { error: "텍스트가 필요합니다" }, 400);
  if (body.input.text.length > 5000) return json(cors, { error: "Too long" }, 400);
  const sanitizedBody = {
    input: { text: body.input.text },
    voice: { languageCode: body.voice?.languageCode || "ko-KR", name: body.voice?.name, ssmlGender: body.voice?.ssmlGender },
    audioConfig: { audioEncoding: body.audioConfig?.audioEncoding || "MP3", speakingRate: Math.min(Math.max(body.audioConfig?.speakingRate || 1.0, 0.5), 2.0), pitch: Math.min(Math.max(body.audioConfig?.pitch || 0, -10), 10) }
  };
  const resp = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${Deno.env.get("GOOGLE_TTS_KEY")}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sanitizedBody) });
  const data = await resp.json();
  await logUsage(svc, userId, "tts", resp.status, Date.now() - start);
  if (!resp.ok) { notifySlack("tts", resp.status, `TTS API ${resp.status}`, userId); return json(cors, { error: "TTS API 오류", code: "UPSTREAM_ERROR", upstream_status: resp.status, detail: data }, 502); }
  return json(cors, data, 200, rh);
}

export async function handleElevenLabs(cors: Record<string, string>, path: string, req: Request, svc: any, userId: string, userRole = "user") {
  const rate = await checkRate(svc, userId, "elevenlabs", userRole);
  if (!rate.allowed) return json(cors, { error: "요청 한도 초과" }, 429);
  const rh = rate.rateHeaders || {};
  const start = Date.now();
  const sub = path.replace("/api/elevenlabs/", "");
  if (sub.startsWith("tts/")) {
    const voiceId = sub.replace("tts/", "");
    if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) return json(cors, { error: "Invalid voice ID" }, 400);
    let elBody: any;
    try { elBody = await req.json(); } catch (_) { return json(cors, { error: "Invalid request body" }, 400); }
    if (!elBody.text || typeof elBody.text !== "string") return json(cors, { error: "텍스트가 필요합니다" }, 400);
    if (elBody.text.length > 5000) return json(cors, { error: "텍스트가 너무 깁니다 (5000자 제한)" }, 400);
    const sanitizedEl = {
      text: elBody.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    };
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": Deno.env.get("ELEVENLABS_KEY")! },
      body: JSON.stringify(sanitizedEl) });
    await logUsage(svc, userId, "elevenlabs", resp.status, Date.now() - start);
    if (!resp.ok) {
      notifySlack("elevenlabs", resp.status, `ElevenLabs TTS ${resp.status} voice:${voiceId}`, userId);
      return json(cors, { error: "음성 생성 오류", code: "UPSTREAM_ERROR", upstream_status: resp.status }, 502);
    }
    return rawResponse(cors, resp.body, { ...rh, "Content-Type": resp.headers.get("Content-Type") || "audio/mpeg" }, 200);
  }
  if (sub === "voices/add") {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json(cors, { error: "multipart/form-data 형식이 필요합니다" }, 400);
    }
    const contentLength = parseInt(req.headers.get("content-length") || "0");
    if (contentLength > 10 * 1024 * 1024) return json(cors, { error: "파일이 너무 큽니다 (10MB 제한)" }, 400);
    const resp = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": Deno.env.get("ELEVENLABS_KEY")! }, body: req.body });
    const data = await resp.json();
    await logUsage(svc, userId, "elevenlabs", resp.status, Date.now() - start);
    if (!resp.ok) return json(cors, { error: "ElevenLabs API 오류", code: "UPSTREAM_ERROR", detail: data }, 502);
    return json(cors, data, 200, rh);
  }
  if (sub === "voices") {
    const resp = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": Deno.env.get("ELEVENLABS_KEY")! } });
    const data = await resp.json();
    if (!resp.ok) return json(cors, { error: "ElevenLabs API 오류", code: "UPSTREAM_ERROR" }, 502);
    const voices = (data.voices || []).map((v: any) => ({ voice_id: v.voice_id, name: v.name, category: v.category, labels: v.labels }));
    return json(cors, { voices, count: voices.length }, 200, rh);
  }
  return json(cors, { error: "Unsupported" }, 400);
}
