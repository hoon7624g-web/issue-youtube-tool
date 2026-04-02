// ═══════════════════════════════════════════════════════════
// main/ipc-ffmpeg.js — FFmpeg 영상 자동 조립
// ★ VERSION: v6-20260331 (이 문자열이 로그에 안 보이면 이 파일이 적용 안 된 것)
// ═══════════════════════════════════════════════════════════
const { dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const log = require('electron-log');

log.info('[FFmpeg] ★ 모듈 로드됨 — v6-20260331');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  log.info('[FFmpeg] ffmpeg 경로:', ffmpegPath);
} catch (e) {
  log.warn('[FFmpeg] ffmpeg-static not found:', e.message);
  ffmpegPath = null;
}

const MAX_FOOTAGE_SIZE = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 30000;
const PEXELS_HOSTS = ['pexels.com', 'www.pexels.com', 'videos.pexels.com'];

function createTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ytdosa-ffmpeg-')); }
function cleanupTempDir(dir) {
  try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); }
  catch (e) { log.warn('[FFmpeg] temp cleanup:', e.message); }
}

function downloadFile(url, destPath, timeout) {
  return new Promise((resolve, reject) => {
    timeout = timeout || DOWNLOAD_TIMEOUT;
    let settled = false;
    const ok = (v) => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } };
    const fail = (e) => { if (!settled) { settled = true; clearTimeout(t); reject(e); } };
    const t = setTimeout(() => fail(new Error('TIMEOUT')), timeout);
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        // ★ P2-fix: 리다이렉트 호스트 검증 + timeout 하한 보장
        try {
          const nextUrl = new URL(res.headers.location, url);
          if (nextUrl.protocol !== 'https:') { fail(new Error('Non-HTTPS redirect')); return; }
        } catch (e) { fail(new Error('Invalid redirect URL')); return; }
        downloadFile(res.headers.location, destPath, Math.max(timeout - 2000, 5000)).then(ok).catch(fail);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); fail(new Error('HTTP_' + res.statusCode)); return; }
      const ws = fs.createWriteStream(destPath);
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; if (bytes > MAX_FOOTAGE_SIZE) { res.destroy(); ws.destroy(); fail(new Error('TOO_LARGE')); } });
      res.pipe(ws);
      ws.on('finish', () => ok(destPath));
      ws.on('error', fail);
    }).on('error', fail);
  });
}

function runFFmpeg(args, progressCb) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) { reject(new Error('FFmpeg 미설치')); return; }
    log.info('[FFmpeg] CMD:', args.join(' ').substring(0, 300));
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      const line = d.toString(); stderr += line;
      const m = line.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m && progressCb) progressCb(parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]));
    });
    proc.on('close', (code) => { if (code === 0) resolve(); else reject(new Error('FFmpeg exit ' + code + ': ' + stderr.slice(-300))); });
    proc.on('error', (e) => reject(new Error('FFmpeg spawn: ' + e.message)));
  });
}

function probeAudioDuration(filePath) {
  return new Promise((resolve) => {
    if (!ffmpegPath) { resolve(0); return; }
    const proc = spawn(ffmpegPath, ['-i', filePath, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) resolve(Math.round((parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000));
      else { log.warn('[FFmpeg] probe 실패:', stderr.substring(0, 200)); resolve(0); }
    });
    proc.on('error', () => resolve(0));
  });
}

function isSafePexelsUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && PEXELS_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)); }
  catch { return false; }
}

function formatSrtTime(ms) {
  const tot = Math.round(ms);
  const msec = tot % 1000;
  const s = Math.floor(tot / 1000) % 60;
  const m = Math.floor(tot / 60000) % 60;
  const h = Math.floor(tot / 3600000);
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + ',' + String(msec).padStart(3,'0');
}

function parseCutMs(cutStr) {
  if (!cutStr || typeof cutStr !== 'string') return 3000;
  const c = cutStr.replace(/[초s]/gi, '').trim();
  const p = c.split(/[-~]/);
  if (p.length === 2) { const avg = (parseFloat(p[0]) + parseFloat(p[1])) / 2; return isNaN(avg) ? 3000 : Math.round(avg * 1000); }
  const v = parseFloat(c);
  return isNaN(v) ? 3000 : Math.round(v * 1000);
}

// ★ 자막 강제 분할: 최대 10자, 글자 단위로 끊기 + 무의미 청크 필터링
function splitSub(text, max) {
  if (!text) return [];
  max = max || 10;

  // 1단계: 입력 텍스트 전처리 (연속 공백/구두점 정리)
  var cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  // 2단계: max 글자 단위로 분할
  var raw = [];
  var buf = '';
  for (var i = 0; i < cleaned.length; i++) {
    buf += cleaned[i];
    var atBreak = /[\s,，.。!！?？~]/.test(cleaned[i]);
    var atMax = buf.length >= max;
    var nearEnd = i >= cleaned.length - 1;
    if ((atBreak && buf.length >= max - 3) || atMax || nearEnd) {
      var trimmed = buf.trim();
      if (trimmed) raw.push(trimmed);
      buf = '';
    }
  }
  if (buf.trim()) raw.push(buf.trim());

  // 3단계: 무의미 청크 필터링 (한글/영문/숫자 2자 미만이면 이전 청크에 병합)
  var result = [];
  for (var j = 0; j < raw.length; j++) {
    var chunk = raw[j];
    var meaningful = chunk.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (meaningful.length < 2 && result.length > 0) {
      // 이전 청크에 붙이기
      result[result.length - 1] += chunk;
    } else if (meaningful.length < 2 && result.length === 0) {
      // 첫 청크가 무의미하면 다음 청크에 붙이기 위해 임시 보관
      if (j + 1 < raw.length) {
        raw[j + 1] = chunk + raw[j + 1];
      }
      // 아니면 버림
    } else {
      result.push(chunk);
    }
  }

  // 최종 반환: 의미 있는 글자(한글/영문/숫자)가 2자 이상인 경우만
  if (result.length > 0) return result;
  var finalCheck = cleaned.replace(/[^가-힣a-zA-Z0-9]/g, '');
  return finalCheck.length >= 2 ? [cleaned] : [];
}

// ═══════════════════════════════════════
// 메인: 영상 조립
// ═══════════════════════════════════════
async function assembleVideo(params, mainWindow) {
  var footageList = params.footageList || [];
  var voiceBuffer = params.voiceBuffer || null;
  var voiceDurationMs = params.voiceDurationMs || 0;
  var scenes = params.scenes || [];
  var format = params.format || 'shorts';
  var projectName = params.projectName || '유튜브도사';
  var onProgress = params.onProgress || function(){};

  log.info('[FFmpeg] ═══ v5 assembleVideo 시작 ═══');
  log.info('[FFmpeg] format:', format, '| scenes:', scenes.length, '| footage:', footageList.length, '| voiceDurationMs(param):', voiceDurationMs);

  if (!ffmpegPath) throw new Error('FFmpeg 미설치');
  if (!scenes.length) throw new Error('장면 없음');

  var W = 1080, H = 1920;
  var tempDir = createTempDir();
  log.info('[FFmpeg] tempDir:', tempDir);

  try {
    // ── 1. 풋티지 다운로드 ──
    onProgress('download', 0, '풋티지 다운로드 중...');
    var ftFiles = [];
    for (var i = 0; i < footageList.length; i++) {
      var ft = footageList[i];
      if (!ft || !ft.url || !isSafePexelsUrl(ft.url)) continue;
      var dest = path.join(tempDir, 'ft_' + i + '.mp4');
      try {
        await downloadFile(ft.url, dest);
        ftFiles.push(dest);
        onProgress('download', Math.round(((i + 1) / footageList.length) * 100), '풋티지 ' + (i + 1) + '/' + footageList.length);
      } catch (e) { log.warn('[FFmpeg] 다운로드 실패 ' + i + ':', e.message); }
    }
    if (!ftFiles.length) throw new Error('풋티지 없음');
    log.info('[FFmpeg] 다운로드 완료:', ftFiles.length + '개');

    // ── 2. 음성 저장 + 실제 길이 측정 ──
    var voicePath = null;
    var voiceMs = 0;
    if (voiceBuffer && voiceBuffer.length > 0) {
      voicePath = path.join(tempDir, 'voice.mp3');
      fs.writeFileSync(voicePath, Buffer.from(voiceBuffer));
      voiceMs = await probeAudioDuration(voicePath);
      log.info('[FFmpeg] ★ 음성 실제 길이:', voiceMs, 'ms (' + (voiceMs / 1000).toFixed(1) + '초)');
    }
    if (!voiceMs) {
      voiceMs = scenes.reduce(function(s, sc) { return s + parseCutMs(sc.cut); }, 0);
      log.info('[FFmpeg] 음성 측정 실패 → cut 합계:', voiceMs, 'ms');
    }
    onProgress('voice', 100, '음성 ' + (voiceMs / 1000).toFixed(0) + '초');

    // ── 3. 장면별 시간 = 글자수 비례 × 음성 길이 ──
    var totalChars = 0;
    for (var i = 0; i < scenes.length; i++) totalChars += (scenes[i].text || '').length;
    if (totalChars === 0) totalChars = 1;

    var timings = [];
    for (var i = 0; i < scenes.length; i++) {
      var text = scenes[i].text || '';
      var ms = Math.round((text.length / totalChars) * voiceMs);
      timings.push({ text: text, ms: Math.max(ms, 500) });
    }
    log.info('[FFmpeg] 마스터:', voiceMs + 'ms, 장면:', timings.map(function(t) { return t.ms + 'ms'; }).join(', '));

    // ── 4. SRT 생성 (10자 분할) ──
    var srtPath = path.join(tempDir, 'sub.srt');
    var srtIdx = 0, cursor = 0;
    var srtBlocks = [];
    for (var i = 0; i < timings.length; i++) {
      var t = timings[i];
      if (!t.text) { cursor += t.ms; continue; }
      var chunks = splitSub(t.text, 10);
      if (!chunks.length) { cursor += t.ms; continue; }
      var cDur = Math.floor(t.ms / chunks.length);
      for (var ci = 0; ci < chunks.length; ci++) {
        srtIdx++;
        var dur = ci === chunks.length - 1 ? t.ms - ci * cDur : cDur;
        srtBlocks.push(srtIdx + '\n' + formatSrtTime(cursor) + ' --> ' + formatSrtTime(cursor + dur) + '\n' + chunks[ci] + '\n');
        cursor += dur;
      }
    }
    fs.writeFileSync(srtPath, srtBlocks.join('\n'), 'utf-8');
    var srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    log.info('[FFmpeg] SRT:', srtIdx + '개, ' + (cursor / 1000).toFixed(1) + '초');
    log.info('[FFmpeg] SRT 샘플:', srtBlocks.slice(0, 3).map(function(b) { return b.replace(/\n/g, '|'); }).join(' /// '));

    // ── 5. 풋티지 트림 (stream_loop + 장면 시간 맞춤) ──
    onProgress('trim', 0, '풋티지 편집 중...');
    var trimmedList = [];
    for (var i = 0; i < timings.length; i++) {
      var ftSrc = ftFiles[i % ftFiles.length];
      var durSec = (timings[i].ms / 1000).toFixed(3);
      var out = path.join(tempDir, 'tr_' + i + '.mp4');
      await runFFmpeg([
        '-stream_loop', '-1', '-i', ftSrc, '-t', durSec,
        '-vf', 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-an', '-y', out,
      ]);
      trimmedList.push(out);
      onProgress('trim', Math.round(((i + 1) / timings.length) * 100), '풋티지 ' + (i + 1) + '/' + timings.length);
    }
    log.info('[FFmpeg] 트림 완료:', trimmedList.length + '개');

    // ── 6. Concat ──
    var concatPath = path.join(tempDir, 'list.txt');
    fs.writeFileSync(concatPath, trimmedList.map(function(f) { return "file '" + f.replace(/'/g, "'\\''") + "'"; }).join('\n'), 'utf-8');

    // ── 7. 최종 조립 ──
    onProgress('assemble', 0, '영상 조립 중...');
    var outputPath = path.join(tempDir, 'output.mp4');
    var ffArgs = ['-f', 'concat', '-safe', '0', '-i', concatPath];
    if (voicePath) ffArgs.push('-i', voicePath);
    ffArgs.push('-vf', "subtitles='" + srtEsc + "':force_style='FontSize=14,FontName=Arial,Alignment=2,MarginV=80,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1,Bold=1'");
    ffArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30');
    if (voicePath) ffArgs.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k');
    // ★ -shortest 제거됨 — 영상이 음성 끝날 때까지 유지
    ffArgs.push('-movflags', '+faststart', '-y', outputPath);

    log.info('[FFmpeg] ★ 최종 조립 시작 (-shortest 없음)');
    await runFFmpeg(ffArgs, function(sec) {
      var pct = Math.min(100, Math.round((sec / (voiceMs / 1000)) * 100));
      onProgress('assemble', pct, '인코딩 ' + pct + '%');
    });

    // ── 8. 저장 ──
    var safeName = (projectName || '유튜브도사').replace(/[<>:"/\\|?*]/g, '_');
    var dialogResult = await dialog.showSaveDialog(mainWindow, {
      title: '완성 영상 저장', defaultPath: safeName + '.mp4',
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    onProgress('done', 100, '완료!');
    log.info('[FFmpeg] ★ 완료:', dialogResult.filePath);
    return dialogResult.filePath;
  } finally {
    cleanupTempDir(tempDir);
  }
}

// ═══════════════════════════════════════
function registerFFmpegIPC(ipcMain, assertTrustedSender, mainWindowGetter) {
  ipcMain.handle('ffmpeg-check', function(event) {
    assertTrustedSender(event);
    return { available: !!ffmpegPath, path: ffmpegPath || null };
  });
  ipcMain.handle('ffmpeg-assemble', async function(event, params) {
    assertTrustedSender(event);
    var mw = typeof mainWindowGetter === 'function' ? mainWindowGetter() : mainWindowGetter;
    try {
      var savePath = await assembleVideo({
        footageList: params.footageList,
        voiceBuffer: params.voiceBuffer ? Buffer.from(params.voiceBuffer) : null,
        voiceDurationMs: params.voiceDurationMs,
        scenes: params.scenes,
        format: params.format,
        projectName: params.projectName,
        onProgress: function(stage, pct, msg) {
          try { if (mw && !mw.isDestroyed()) mw.webContents.send('ffmpeg-progress', { stage: stage, pct: pct, msg: msg }); } catch (e) {}
        },
      }, mw);
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      log.error('[FFmpeg] 실패:', e.message);
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerFFmpegIPC };
