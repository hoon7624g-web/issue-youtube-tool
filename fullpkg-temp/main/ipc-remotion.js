// ═══════════════════════════════════════════════════════════
// main/ipc-remotion.js — Remotion 기반 영상/썸네일 렌더링
// ★ v3: 롱폼 썸네일 (renderStill) + 음성 probe + 자막 v2
// ═══════════════════════════════════════════════════════════
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const log = require('electron-log');

log.info('[Remotion] 모듈 로드됨');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && ffmpegPath.includes('app.asar')) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
} catch (e) { ffmpegPath = null; }

let _bundle = null, _renderMedia = null, _renderStill = null, _selectComposition = null, _remotionReady = false;

async function ensureRemotion() {
  if (_remotionReady) return;
  try {
    var bundler = require('@remotion/bundler');
    var renderer = require('@remotion/renderer');
    _bundle = bundler.bundle;
    _renderMedia = renderer.renderMedia;
    _renderStill = renderer.renderStill;
    _selectComposition = renderer.selectComposition;
    _remotionReady = true;
    log.info('[Remotion] 모듈 로드 완료');
  } catch (e) {
    log.error('[Remotion] 모듈 로드 실패:', e.message);
    throw new Error('Remotion 미설치');
  }
}

var MAX_FOOTAGE_SIZE = 100 * 1024 * 1024;
var DOWNLOAD_TIMEOUT = 30000;
var PEXELS_HOSTS = ['pexels.com', 'www.pexels.com', 'videos.pexels.com'];

function probeAudioDuration(filePath) {
  return new Promise(function(resolve) {
    if (!ffmpegPath) { resolve(0); return; }
    var proc = spawn(ffmpegPath, ['-i', filePath, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    var stderr = '';
    proc.stderr.on('data', function(d) { stderr += d.toString(); });
    proc.on('close', function() {
      var m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) { resolve(Math.round((parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000)); }
      else resolve(0);
    });
    proc.on('error', function() { resolve(0); });
  });
}

function getRemotionEntryPoint() {
  var resPath = process.resourcesPath || '';
  var candidates = [
    path.join(resPath, 'app.asar.unpacked', 'remotion', 'src', 'index.js'),
    path.join(resPath, 'app', 'remotion', 'src', 'index.js'),
    path.join(__dirname, '..', 'remotion', 'src', 'index.js'),
  ];
  for (var i = 0; i < candidates.length; i++) { if (fs.existsSync(candidates[i])) return candidates[i]; }
  return candidates[0];
}

function createTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'ytdosa-remotion-')); }
function cleanupTempDir(dir) { try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

function downloadFile(url, destPath, timeout) {
  return new Promise(function(resolve, reject) {
    timeout = timeout || DOWNLOAD_TIMEOUT;
    var settled = false;
    var ok = function(v) { if (!settled) { settled = true; clearTimeout(t); resolve(v); } };
    var fail = function(e) { if (!settled) { settled = true; clearTimeout(t); reject(e); } };
    var t = setTimeout(function() { fail(new Error('TIMEOUT')); }, timeout);
    var proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); downloadFile(res.headers.location, destPath, timeout - 2000).then(ok).catch(fail); return; }
      if (res.statusCode !== 200) { res.resume(); fail(new Error('HTTP_' + res.statusCode)); return; }
      var ws = fs.createWriteStream(destPath);
      var bytes = 0;
      res.on('data', function(c) { bytes += c.length; if (bytes > MAX_FOOTAGE_SIZE) { res.destroy(); ws.destroy(); fail(new Error('TOO_LARGE')); } });
      res.pipe(ws);
      ws.on('finish', function() { ok(destPath); });
      ws.on('error', fail);
    }).on('error', fail);
  });
}

function isSafePexelsUrl(url) {
  try { var u = new URL(url); return u.protocol === 'https:' && PEXELS_HOSTS.some(function(h) { return u.hostname === h || u.hostname.endsWith('.' + h); }); }
  catch(e) { return false; }
}

// ── 자막 분할 v2 ──
function splitSub(text, max) {
  if (!text) return [];
  max = max || 12;
  var cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  var raw = [], pos = 0;
  while (pos < cleaned.length) {
    if (cleaned.length - pos <= max) { raw.push(cleaned.substring(pos).trim()); break; }
    var chunk = cleaned.substring(pos, pos + max);
    var bestBreak = -1;
    for (var i = chunk.length - 1; i >= 3; i--) { if (/[.!?~。]/.test(chunk[i])) { bestBreak = i + 1; break; } }
    if (bestBreak === -1) { for (var i = chunk.length - 1; i >= 3; i--) { if (/[,，]/.test(chunk[i])) { bestBreak = i + 1; break; } } }
    if (bestBreak === -1) { for (var i = chunk.length - 1; i >= 3; i--) { if (chunk[i] === ' ') { bestBreak = i + 1; break; } } }
    if (bestBreak === -1) { for (var i = chunk.length - 1; i >= 3; i--) { var code = chunk.charCodeAt(i); if (code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 === 0) { bestBreak = i + 1; break; } } }
    if (bestBreak === -1) bestBreak = max;
    var piece = cleaned.substring(pos, pos + bestBreak).trim();
    if (piece) raw.push(piece);
    pos += bestBreak;
    while (pos < cleaned.length && cleaned[pos] === ' ') pos++;
  }
  var result = [];
  for (var j = 0; j < raw.length; j++) {
    var c = raw[j], m = c.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (m.length < 2 && result.length > 0) result[result.length - 1] += ' ' + c;
    else if (m.length < 2 && j + 1 < raw.length) raw[j + 1] = c + ' ' + raw[j + 1];
    else result.push(c);
  }
  return result.length > 0 ? result : (cleaned.replace(/[^가-힣a-zA-Z0-9]/g, '').length >= 2 ? [cleaned] : []);
}

function parseCutMs(cutStr) {
  if (!cutStr || typeof cutStr !== 'string') return 3000;
  var c = cutStr.replace(/[초s]/gi, '').trim();
  var p = c.split(/[-~]/);
  if (p.length === 2) { var avg = (parseFloat(p[0]) + parseFloat(p[1])) / 2; return isNaN(avg) ? 3000 : Math.round(avg * 1000); }
  var v = parseFloat(c);
  return isNaN(v) ? 3000 : Math.round(v * 1000);
}

// ── 제목 → 2~3줄 자동 분할 ──
function splitTitleLines(title) {
  if (!title) return ['제목 없음'];
  title = title.trim();
  if (title.length <= 12) return [title];
  var words = title.split(/\s+/);
  if (words.length <= 2) {
    var mid = Math.ceil(title.length / 2);
    var spaceIdx = title.indexOf(' ', mid - 4);
    if (spaceIdx === -1 || spaceIdx > mid + 4) spaceIdx = mid;
    return [title.substring(0, spaceIdx).trim(), title.substring(spaceIdx).trim()].filter(Boolean);
  }
  var totalLen = title.length;
  if (totalLen <= 24) {
    var half = Math.ceil(words.length / 2);
    return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
  }
  var third = Math.ceil(words.length / 3);
  return [words.slice(0, third).join(' '), words.slice(third, third * 2).join(' '), words.slice(third * 2).join(' ')].filter(Boolean);
}

// ═══════════════════════════════════════════════════════════
// 숏폼 영상 렌더링
// ═══════════════════════════════════════════════════════════
async function renderWithRemotion(params, mainWindow) {
  var footageList = params.footageList || [], voiceBuffer = params.voiceBuffer || null;
  var voiceDurationMs = params.voiceDurationMs || 0, scenes = params.scenes || [];
  var projectName = params.projectName || '유튜브도사', onProgress = params.onProgress || function(){};
  log.info('[Remotion] ═══ 숏폼 렌더링 시작 ═══');
  await ensureRemotion();
  if (!scenes.length) throw new Error('장면 없음');
  var tempDir = createTempDir(), bundlePath = null;
  try {
    onProgress('download', 0, '풋티지 다운로드 중...');
    var localFootageNames = [];
    for (var i = 0; i < footageList.length; i++) {
      var ft = footageList[i];
      if (!ft || !ft.url || !isSafePexelsUrl(ft.url)) { localFootageNames.push(null); continue; }
      var fn = 'footage_' + i + '.mp4';
      try { await downloadFile(ft.url, path.join(tempDir, fn)); localFootageNames.push(fn); onProgress('download', Math.round(((i+1)/footageList.length)*100), '풋티지 '+(i+1)+'/'+footageList.length); }
      catch (e) { localFootageNames.push(null); }
    }
    var audioFilename = null, voiceMs = 0;
    if (voiceBuffer && voiceBuffer.length > 0) {
      audioFilename = 'voice.mp3';
      fs.writeFileSync(path.join(tempDir, audioFilename), Buffer.from(voiceBuffer));
      voiceMs = await probeAudioDuration(path.join(tempDir, audioFilename));
      log.info('[Remotion] probe:', voiceMs, 'ms | param:', voiceDurationMs, 'ms');
    }
    if (!voiceMs && voiceDurationMs) voiceMs = voiceDurationMs;
    if (!voiceMs) voiceMs = scenes.reduce(function(s, sc) { return s + parseCutMs(sc.cut); }, 0);
    if (!voiceMs) voiceMs = scenes.length * 3000;
    log.info('[Remotion] 마스터:', voiceMs, 'ms');

    var totalChars = 0;
    for (var i = 0; i < scenes.length; i++) totalChars += (scenes[i].text || '').length;
    if (totalChars === 0) totalChars = 1;
    var enrichedScenes = scenes.map(function(sc, idx) {
      return { text: sc.text || '', label: sc.label || '', footageSrc: localFootageNames[idx % localFootageNames.length] || null, durationMs: Math.max(Math.round(((sc.text||'').length / totalChars) * voiceMs), 500) };
    });
    var subtitles = [], cursor = 0;
    for (var i = 0; i < enrichedScenes.length; i++) {
      var sc = enrichedScenes[i];
      if (!sc.text) { cursor += sc.durationMs; continue; }
      var chunks = splitSub(sc.text, 12);
      if (!chunks.length) { cursor += sc.durationMs; continue; }
      var cDur = Math.floor(sc.durationMs / chunks.length);
      for (var ci = 0; ci < chunks.length; ci++) { var dur = ci === chunks.length - 1 ? sc.durationMs - ci * cDur : cDur; subtitles.push({ start: cursor, end: cursor + dur, text: chunks[ci] }); cursor += dur; }
    }
    var inputProps = { scenes: enrichedScenes, audioSrc: audioFilename, audioDurationMs: voiceMs, subtitles: subtitles, templateStyle: 'issue-info' };
    onProgress('bundle', 0, 'Remotion 번들링 중...');
    bundlePath = await _bundle({ entryPoint: getRemotionEntryPoint(), publicDir: tempDir, onProgress: function(p) { onProgress('bundle', Math.round(p*100), '번들링 '+Math.round(p*100)+'%'); } });
    onProgress('render', 0, '렌더링 준비 중...');
    var composition = await _selectComposition({ serveUrl: bundlePath, id: 'IssueShortsTemplate', inputProps: inputProps });
    var outputPath = path.join(tempDir, 'output.mp4');
    await _renderMedia({ composition: composition, serveUrl: bundlePath, codec: 'h264', outputLocation: outputPath, inputProps: inputProps, imageFormat: 'jpeg', jpegQuality: 90, videoBitrate: '5M', audioBitrate: '192k', concurrency: Math.min(os.cpus().length, 4), onProgress: function(o) { onProgress('render', Math.round(o.progress*100), '렌더링 '+Math.round(o.progress*100)+'%'); } });
    onProgress('save', 100, '저장 중...');
    var safeName = (projectName || '유튜브도사').replace(/[<>:"/\\|?*]/g, '_');
    var dialogResult = await dialog.showSaveDialog(mainWindow, { title: '완성 영상 저장', defaultPath: safeName + '_shorts.mp4', filters: [{ name: 'MP4', extensions: ['mp4'] }] });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    log.info('[Remotion] ★ 영상 저장:', dialogResult.filePath);
    return dialogResult.filePath;
  } finally { cleanupTempDir(tempDir); if (bundlePath) { try { fs.rmSync(bundlePath, { recursive: true, force: true }); } catch(e) {} } }
}

// ═══════════════════════════════════════════════════════════
// ★ 롱폼 썸네일 렌더링 (renderStill)
// ═══════════════════════════════════════════════════════════
async function renderThumbnail(params, mainWindow) {
  var title = params.title || '제목 없음';
  var backgroundUrl = params.backgroundUrl || null;
  var accentColor = params.accentColor || '#FF6B35';
  var channelName = params.channelName || '';
  var style = params.style || 'bold';
  var onProgress = params.onProgress || function(){};

  log.info('[Remotion] ═══ 썸네일 렌더링 시작 ═══');
  log.info('[Remotion] title:', title, '| style:', style);
  await ensureRemotion();

  var tempDir = createTempDir(), bundlePath = null;
  try {
    var backgroundFilename = null;
    if (backgroundUrl) {
      onProgress('download', 0, '배경 이미지 다운로드...');
      backgroundFilename = 'thumb_bg.jpg';
      try { await downloadFile(backgroundUrl, path.join(tempDir, backgroundFilename)); }
      catch (e) { log.warn('[Remotion] 배경 다운로드 실패:', e.message); backgroundFilename = null; }
    }

    var titleLines = splitTitleLines(title);
    log.info('[Remotion] 썸네일 줄:', titleLines);

    var inputProps = { titleLines: titleLines, backgroundSrc: backgroundFilename, accentColor: accentColor, channelName: channelName, style: style };

    onProgress('bundle', 0, '번들링 중...');
    bundlePath = await _bundle({ entryPoint: getRemotionEntryPoint(), publicDir: tempDir });

    onProgress('render', 50, '썸네일 생성 중...');
    var composition = await _selectComposition({ serveUrl: bundlePath, id: 'LongformThumbnail', inputProps: inputProps });

    var outputPath = path.join(tempDir, 'thumbnail.png');
    await _renderStill({ composition: composition, serveUrl: bundlePath, output: outputPath, inputProps: inputProps, imageFormat: 'png' });
    log.info('[Remotion] 썸네일 렌더링 완료');

    onProgress('save', 100, '저장 중...');
    var safeName = (title || '썸네일').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    var dialogResult = await dialog.showSaveDialog(mainWindow, { title: '썸네일 저장', defaultPath: safeName + '_thumbnail.png', filters: [{ name: 'PNG', extensions: ['png'] }, { name: 'JPEG', extensions: ['jpg'] }] });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    log.info('[Remotion] ★ 썸네일 저장:', dialogResult.filePath);
    return dialogResult.filePath;
  } finally { cleanupTempDir(tempDir); if (bundlePath) { try { fs.rmSync(bundlePath, { recursive: true, force: true }); } catch(e) {} } }
}

// ═══════════════════════════════════════════════════════════
// IPC 등록
// ═══════════════════════════════════════════════════════════
function registerRemotionIPC(ipcMain, assertTrustedSender, mainWindowGetter) {
  ipcMain.handle('remotion-check', function(event) {
    assertTrustedSender(event);
    try {
      require.resolve('@remotion/bundler');
      require.resolve('@remotion/renderer');
      var ep = getRemotionEntryPoint();
      var exists = fs.existsSync(ep);
      log.info('[Remotion] check — available:', exists);
      return { available: exists, entryPoint: ep };
    } catch (e) {
      log.error('[Remotion] check FAILED:', e.message);
      return { available: false, error: e.message };
    }
  });

  ipcMain.handle('remotion-render', async function(event, params) {
    assertTrustedSender(event);
    var mw = typeof mainWindowGetter === 'function' ? mainWindowGetter() : mainWindowGetter;
    try {
      var savePath = await renderWithRemotion({ footageList: params.footageList, voiceBuffer: params.voiceBuffer ? Buffer.from(params.voiceBuffer) : null, voiceDurationMs: params.voiceDurationMs, scenes: params.scenes, projectName: params.projectName, onProgress: function(stage, pct, msg) { try { if (mw && !mw.isDestroyed()) mw.webContents.send('remotion-progress', { stage: stage, pct: pct, msg: msg }); } catch(e) {} } }, mw);
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      log.error('[Remotion] 렌더링 실패:', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('remotion-render-thumbnail', async function(event, params) {
    assertTrustedSender(event);
    var mw = typeof mainWindowGetter === 'function' ? mainWindowGetter() : mainWindowGetter;
    try {
      var savePath = await renderThumbnail({ title: params.title, backgroundUrl: params.backgroundUrl, accentColor: params.accentColor, channelName: params.channelName, style: params.style, onProgress: function(stage, pct, msg) { try { if (mw && !mw.isDestroyed()) mw.webContents.send('remotion-progress', { stage: stage, pct: pct, msg: msg }); } catch(e) {} } }, mw);
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      log.error('[Remotion] 썸네일 실패:', e.message);
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerRemotionIPC };
