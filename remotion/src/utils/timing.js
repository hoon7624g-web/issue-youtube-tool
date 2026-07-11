// ═══════════════════════════════════════════════════════════
// remotion/src/utils/timing.js — 시간/프레임 변환 유틸리티
// ═══════════════════════════════════════════════════════════

/**
 * ms → 프레임 변환
 */
export function msToFrames(ms, fps) {
  return Math.round((ms / 1000) * fps);
}

/**
 * 프레임 → ms 변환
 */
export function framesToMs(frames, fps) {
  return Math.round((frames / fps) * 1000);
}

/**
 * 장면 배열로부터 총 프레임 수 계산
 * @param {Array} scenes - [{durationMs, text, ...}]
 * @param {number} fps
 * @returns {number}
 */
export function calculateTotalFrames(scenes, fps) {
  if (!scenes || !scenes.length) return fps; // 최소 1초
  const totalMs = scenes.reduce((sum, s) => sum + (s.durationMs || 3000), 0);
  return msToFrames(totalMs, fps);
}

/**
 * 장면별 시작 프레임 계산
 * @param {Array} scenes
 * @param {number} fps
 * @returns {Array<{startFrame, durationFrames, scene}>}
 */
export function calculateSceneTimings(scenes, fps) {
  let cursor = 0;
  return scenes.map((scene) => {
    const durationMs = scene.durationMs || 3000;
    const durationFrames = msToFrames(durationMs, fps);
    const startFrame = cursor;
    cursor += durationFrames;
    return {
      startFrame,
      durationFrames,
      scene,
    };
  });
}

/**
 * 글자수 비례로 장면별 시간 분배 (TTS 총 길이 기준)
 * ipc-ffmpeg.js의 기존 로직과 동일
 * @param {Array} scenes - [{text, ...}]
 * @param {number} totalMs - 전체 음성 길이 (ms)
 * @returns {Array} - durationMs가 추가된 scenes
 */
export function distributeTimingByChars(scenes, totalMs) {
  const totalChars = scenes.reduce((sum, s) => sum + (s.text || '').length, 0);
  if (totalChars === 0) {
    // 글자가 없으면 균등 분배
    const each = Math.round(totalMs / scenes.length);
    return scenes.map((s) => ({ ...s, durationMs: Math.max(each, 500) }));
  }
  return scenes.map((s) => {
    const textLen = (s.text || '').length;
    const ms = Math.round((textLen / totalChars) * totalMs);
    return { ...s, durationMs: Math.max(ms, 500) };
  });
}

/**
 * SRT 텍스트 파싱 → [{index, start, end, text}]
 * @param {string} srtContent
 * @returns {Array}
 */
export function parseSRT(srtContent) {
  if (!srtContent || typeof srtContent !== 'string') return [];
  const blocks = srtContent.trim().split(/\n\s*\n/);
  const result = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const index = parseInt(lines[0], 10);
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;
    const start =
      parseInt(timeMatch[1]) * 3600000 +
      parseInt(timeMatch[2]) * 60000 +
      parseInt(timeMatch[3]) * 1000 +
      parseInt(timeMatch[4]);
    const end =
      parseInt(timeMatch[5]) * 3600000 +
      parseInt(timeMatch[6]) * 60000 +
      parseInt(timeMatch[7]) * 1000 +
      parseInt(timeMatch[8]);
    const text = lines.slice(2).join('\n').trim();
    result.push({ index, start, end, text });
  }
  return result;
}

/**
 * 자막 강제 분할 (10자 단위) — ipc-ffmpeg.js의 splitSub과 동일 로직
 * @param {string} text
 * @param {number} max - 최대 글자 수 (기본 10)
 * @returns {string[]}
 */
export function splitSubtitle(text, max = 10) {
  if (!text) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const raw = [];
  let buf = '';
  for (let i = 0; i < cleaned.length; i++) {
    buf += cleaned[i];
    const atBreak = /[\s,，.。!！?？~]/.test(cleaned[i]);
    const atMax = buf.length >= max;
    const nearEnd = i >= cleaned.length - 1;
    if ((atBreak && buf.length >= max - 3) || atMax || nearEnd) {
      const trimmed = buf.trim();
      if (trimmed) raw.push(trimmed);
      buf = '';
    }
  }
  if (buf.trim()) raw.push(buf.trim());

  // 무의미 청크 필터링 (한글/영문/숫자 2자 미만이면 이전에 병합)
  const result = [];
  for (let j = 0; j < raw.length; j++) {
    const chunk = raw[j];
    const meaningful = chunk.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (meaningful.length < 2 && result.length > 0) {
      result[result.length - 1] += chunk;
    } else if (meaningful.length < 2 && result.length === 0) {
      if (j + 1 < raw.length) raw[j + 1] = chunk + raw[j + 1];
    } else {
      result.push(chunk);
    }
  }

  if (result.length > 0) return result;
  const finalCheck = cleaned.replace(/[^가-힣a-zA-Z0-9]/g, '');
  return finalCheck.length >= 2 ? [cleaned] : [];
}

/**
 * 장면 텍스트 → SRT 자막 배열 자동 생성 (SRT 파일 없을 때 사용)
 * @param {Array} scenes - [{text, durationMs}]
 * @returns {Array<{start, end, text}>}
 */
export function generateSubtitlesFromScenes(scenes) {
  const subtitles = [];
  let cursor = 0;
  for (const scene of scenes) {
    const text = scene.text || '';
    const durationMs = scene.durationMs || 3000;
    if (!text) {
      cursor += durationMs;
      continue;
    }
    const chunks = splitSubtitle(text, 10);
    if (!chunks.length) {
      cursor += durationMs;
      continue;
    }
    const chunkDur = Math.floor(durationMs / chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      const dur = i === chunks.length - 1 ? durationMs - i * chunkDur : chunkDur;
      subtitles.push({
        start: cursor,
        end: cursor + dur,
        text: chunks[i],
      });
      cursor += dur;
    }
  }
  return subtitles;
}
