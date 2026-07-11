// ═══════════════════════════════════════════════════════════
// main/ipc-remotion.js — Remotion 기반 영상/썸네일 렌더링
// ★ v4.1: 숏폼 바 커스텀 (barColor/barHeight/logo/cta)
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
  if (ffmpegPath && ffmpegPath.includes('app.asar'))
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
} catch (e) {
  ffmpegPath = null;
}

let _bundle = null,
  _renderMedia = null,
  _renderStill = null,
  _selectComposition = null,
  _remotionReady = false;

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
var PEXELS_HOSTS = ['pexels.com', 'www.pexels.com', 'videos.pexels.com', 'images.pexels.com'];

function probeAudioDuration(filePath) {
  return new Promise(function (resolve) {
    if (!ffmpegPath) {
      resolve(0);
      return;
    }
    var proc = spawn(ffmpegPath, ['-i', filePath, '-f', 'null', '-'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    var stderr = '';
    proc.stderr.on('data', function (d) {
      stderr += d.toString();
    });
    proc.on('close', function () {
      var m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        resolve(
          Math.round((parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3])) * 1000)
        );
      } else resolve(0);
    });
    proc.on('error', function () {
      resolve(0);
    });
  });
}

function getRemotionEntryPoint() {
  var resPath = process.resourcesPath || '';
  var candidates = [
    path.join(resPath, 'app.asar.unpacked', 'remotion', 'src', 'index.js'),
    path.join(resPath, 'app', 'remotion', 'src', 'index.js'),
    path.join(__dirname, '..', 'remotion', 'src', 'index.js'),
  ];
  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return candidates[0];
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ytdosa-remotion-'));
}
function cleanupTempDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

function downloadFile(url, destPath, timeout) {
  return new Promise(function (resolve, reject) {
    timeout = timeout || DOWNLOAD_TIMEOUT;
    var settled = false;
    var ok = function (v) {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        resolve(v);
      }
    };
    var fail = function (e) {
      if (!settled) {
        settled = true;
        clearTimeout(t);
        reject(e);
      }
    };
    var t = setTimeout(function () {
      fail(new Error('TIMEOUT'));
    }, timeout);
    var proto = url.startsWith('https') ? https : http;
    proto
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          // ★ P2-fix: 리다이렉트 호스트 검증 + timeout 하한 보장
          try {
            var nextUrl = new URL(res.headers.location, url);
            if (nextUrl.protocol !== 'https:') {
              fail(new Error('Non-HTTPS redirect'));
              return;
            }
          } catch (e) {
            fail(new Error('Invalid redirect URL'));
            return;
          }
          downloadFile(res.headers.location, destPath, Math.max(timeout - 2000, 5000))
            .then(ok)
            .catch(fail);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          fail(new Error('HTTP_' + res.statusCode));
          return;
        }
        var ws = fs.createWriteStream(destPath);
        var bytes = 0;
        res.on('data', function (c) {
          bytes += c.length;
          if (bytes > MAX_FOOTAGE_SIZE) {
            res.destroy();
            ws.destroy();
            fail(new Error('TOO_LARGE'));
          }
        });
        res.pipe(ws);
        ws.on('finish', function () {
          ok(destPath);
        });
        ws.on('error', fail);
      })
      .on('error', fail);
  });
}

function isSafePexelsUrl(url) {
  try {
    var u = new URL(url);
    return (
      u.protocol === 'https:' &&
      PEXELS_HOSTS.some(function (h) {
        return u.hostname === h || u.hostname.endsWith('.' + h);
      })
    );
  } catch (e) {
    return false;
  }
}

// ★ P2-fix: 썸네일 배경 이미지 URL 검증 — Pexels + YouTube 썸네일 허용
var SAFE_BG_HOSTS = PEXELS_HOSTS.concat(['i.ytimg.com', 'img.youtube.com']);
function isSafeBackgroundUrl(url) {
  if (!url) return false;
  try {
    var u = new URL(url);
    return (
      u.protocol === 'https:' &&
      SAFE_BG_HOSTS.some(function (h) {
        return u.hostname === h || u.hostname.endsWith('.' + h);
      })
    );
  } catch (e) {
    return false;
  }
}

// ── 자막 분할 v2 ──
function splitSub(text, max) {
  if (!text) return [];
  max = max || 12;
  var cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  var raw = [],
    pos = 0;
  while (pos < cleaned.length) {
    if (cleaned.length - pos <= max) {
      raw.push(cleaned.substring(pos).trim());
      break;
    }
    var chunk = cleaned.substring(pos, pos + max);
    var bestBreak = -1;
    for (let i = chunk.length - 1; i >= 3; i--) {
      if (/[.!?~。]/.test(chunk[i])) {
        bestBreak = i + 1;
        break;
      }
    }
    if (bestBreak === -1) {
      for (let i = chunk.length - 1; i >= 3; i--) {
        if (/[,，]/.test(chunk[i])) {
          bestBreak = i + 1;
          break;
        }
      }
    }
    if (bestBreak === -1) {
      for (let i = chunk.length - 1; i >= 3; i--) {
        if (chunk[i] === ' ') {
          bestBreak = i + 1;
          break;
        }
      }
    }
    if (bestBreak === -1) {
      for (let i = chunk.length - 1; i >= 3; i--) {
        var code = chunk.charCodeAt(i);
        if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 0) {
          bestBreak = i + 1;
          break;
        }
      }
    }
    if (bestBreak === -1) bestBreak = max;
    var piece = cleaned.substring(pos, pos + bestBreak).trim();
    if (piece) raw.push(piece);
    pos += bestBreak;
    while (pos < cleaned.length && cleaned[pos] === ' ') pos++;
  }
  var result = [];
  for (var j = 0; j < raw.length; j++) {
    var c = raw[j],
      m = c.replace(/[^가-힣a-zA-Z0-9]/g, '');
    if (m.length < 2 && result.length > 0) result[result.length - 1] += ' ' + c;
    else if (m.length < 2 && j + 1 < raw.length) raw[j + 1] = c + ' ' + raw[j + 1];
    else result.push(c);
  }
  return result.length > 0
    ? result
    : cleaned.replace(/[^가-힣a-zA-Z0-9]/g, '').length >= 2
      ? [cleaned]
      : [];
}

function parseCutMs(cutStr) {
  if (!cutStr || typeof cutStr !== 'string') return 3000;
  var c = cutStr.replace(/[초s]/gi, '').trim();
  var p = c.split(/[-~]/);
  if (p.length === 2) {
    var avg = (parseFloat(p[0]) + parseFloat(p[1])) / 2;
    return isNaN(avg) ? 3000 : Math.round(avg * 1000);
  }
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
  return [
    words.slice(0, third).join(' '),
    words.slice(third, third * 2).join(' '),
    words.slice(third * 2).join(' '),
  ].filter(Boolean);
}

// ── 로컬 파일 → tempDir 복사 헬퍼 ──
function copyLocalFile(localPath, tempDir, destName) {
  if (!localPath || !fs.existsSync(localPath)) return null;
  var filename = destName + path.extname(localPath);
  fs.copyFileSync(localPath, path.join(tempDir, filename));
  return filename;
}

// ═══════════════════════════════════════════════════════════
// 숏폼 영상 렌더링
// ═══════════════════════════════════════════════════════════
async function renderWithRemotion(params, mainWindow) {
  var footageList = params.footageList || [],
    voiceBuffer = params.voiceBuffer || null;
  var voiceDurationMs = params.voiceDurationMs || 0,
    scenes = params.scenes || [];
  var projectName = params.projectName || '유튜브도사',
    onProgress = params.onProgress || function () {};
  log.info('[Remotion] ═══ 숏폼 렌더링 시작 ═══');
  await ensureRemotion();
  if (!scenes.length) throw new Error('장면 없음');
  var tempDir = createTempDir(),
    bundlePath = null;
  try {
    onProgress('download', 0, '풋티지 다운로드 중...');
    var localFootageNames = [];
    for (let i = 0; i < footageList.length; i++) {
      var ft = footageList[i];
      if (!ft || !ft.url || !isSafePexelsUrl(ft.url)) {
        localFootageNames.push(null);
        continue;
      }
      var fn = 'footage_' + i + '.mp4';
      try {
        await downloadFile(ft.url, path.join(tempDir, fn));
        localFootageNames.push(fn);
        onProgress(
          'download',
          Math.round(((i + 1) / footageList.length) * 100),
          '풋티지 ' + (i + 1) + '/' + footageList.length
        );
      } catch (e) {
        localFootageNames.push(null);
      }
    }
    var audioFilename = null,
      voiceMs = 0;
    if (voiceBuffer && voiceBuffer.length > 0) {
      audioFilename = 'voice.mp3';
      fs.writeFileSync(path.join(tempDir, audioFilename), Buffer.from(voiceBuffer));
      voiceMs = await probeAudioDuration(path.join(tempDir, audioFilename));
      log.info('[Remotion] probe:', voiceMs, 'ms | param:', voiceDurationMs, 'ms');
    }
    if (!voiceMs && voiceDurationMs) voiceMs = voiceDurationMs;
    if (!voiceMs)
      voiceMs = scenes.reduce(function (s, sc) {
        return s + parseCutMs(sc.cut);
      }, 0);
    if (!voiceMs) voiceMs = scenes.length * 3000;

    var totalChars = 0;
    for (let i = 0; i < scenes.length; i++) totalChars += (scenes[i].text || '').length;
    if (totalChars === 0) totalChars = 1;
    var enrichedScenes = scenes.map(function (sc, idx) {
      return {
        text: sc.text || '',
        label: sc.label || '',
        footageSrc: localFootageNames[idx % localFootageNames.length] || null,
        durationMs: Math.max(Math.round(((sc.text || '').length / totalChars) * voiceMs), 500),
      };
    });
    var subtitles = [],
      cursor = 0;
    for (let i = 0; i < enrichedScenes.length; i++) {
      var sc = enrichedScenes[i];
      if (!sc.text) {
        cursor += sc.durationMs;
        continue;
      }
      var chunks = splitSub(sc.text, 12);
      if (!chunks.length) {
        cursor += sc.durationMs;
        continue;
      }
      var cDur = Math.floor(sc.durationMs / chunks.length);
      for (var ci = 0; ci < chunks.length; ci++) {
        var dur = ci === chunks.length - 1 ? sc.durationMs - ci * cDur : cDur;
        subtitles.push({ start: cursor, end: cursor + dur, text: chunks[ci] });
        cursor += dur;
      }
    }
    var inputProps = {
      scenes: enrichedScenes,
      audioSrc: audioFilename,
      audioDurationMs: voiceMs,
      subtitles: subtitles,
      templateStyle: 'issue-info',
    };
    onProgress('bundle', 0, 'Remotion 번들링 중...');
    bundlePath = await _bundle({
      entryPoint: getRemotionEntryPoint(),
      publicDir: tempDir,
      onProgress: function (p) {
        onProgress('bundle', Math.round(p * 100), '번들링 ' + Math.round(p * 100) + '%');
      },
    });
    onProgress('render', 0, '렌더링 준비 중...');
    var composition = await _selectComposition({
      serveUrl: bundlePath,
      id: 'IssueShortsTemplate',
      inputProps: inputProps,
    });
    var outputPath = path.join(tempDir, 'output.mp4');
    await _renderMedia({
      composition: composition,
      serveUrl: bundlePath,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: inputProps,
      imageFormat: 'jpeg',
      jpegQuality: 90,
      videoBitrate: '5M',
      audioBitrate: '192k',
      concurrency: Math.min(os.cpus().length, 4),
      onProgress: function (o) {
        onProgress(
          'render',
          Math.round(o.progress * 100),
          '렌더링 ' + Math.round(o.progress * 100) + '%'
        );
      },
    });
    onProgress('save', 100, '저장 중...');
    var safeName = (projectName || '유튜브도사').replace(/[<>:"/\\|?*]/g, '_');
    var dialogResult = await dialog.showSaveDialog(mainWindow, {
      title: '완성 영상 저장',
      defaultPath: safeName + '_shorts.mp4',
      filters: [{ name: 'MP4', extensions: ['mp4'] }],
    });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    return dialogResult.filePath;
  } finally {
    cleanupTempDir(tempDir);
    if (bundlePath) {
      try {
        fs.rmSync(bundlePath, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ★ 롱폼 썸네일 렌더링 (renderStill) — 단건 (하위 호환)
// ═══════════════════════════════════════════════════════════
async function renderThumbnail(params, mainWindow) {
  var title = params.title || '제목 없음';
  var backgroundUrl = params.backgroundUrl || null;
  var accentColor = params.accentColor || '#FF6B35';
  var channelName = params.channelName || '';
  var style = params.style || 'bold';
  await ensureRemotion();
  var tempDir = createTempDir(),
    bundlePath = null;
  try {
    var backgroundFilename = null;
    if (backgroundUrl && isSafeBackgroundUrl(backgroundUrl)) {
      backgroundFilename = 'thumb_bg.jpg';
      try {
        await downloadFile(backgroundUrl, path.join(tempDir, backgroundFilename));
      } catch (e) {
        backgroundFilename = null;
      }
    }
    var titleLines = splitTitleLines(title);
    var inputProps = {
      titleLines: titleLines,
      backgroundSrc: backgroundFilename,
      accentColor: accentColor,
      channelName: channelName,
      style: style,
    };
    bundlePath = await _bundle({ entryPoint: getRemotionEntryPoint(), publicDir: tempDir });
    var composition = await _selectComposition({
      serveUrl: bundlePath,
      id: 'LongformThumbnail',
      inputProps: inputProps,
    });
    var outputPath = path.join(tempDir, 'thumbnail.png');
    await _renderStill({
      composition: composition,
      serveUrl: bundlePath,
      output: outputPath,
      inputProps: inputProps,
      imageFormat: 'png',
    });
    var safeName = (title || '썸네일').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    var dialogResult = await dialog.showSaveDialog(mainWindow, {
      title: '썸네일 저장',
      defaultPath: safeName + '_thumbnail.png',
      filters: [
        { name: 'PNG', extensions: ['png'] },
        { name: 'JPEG', extensions: ['jpg'] },
      ],
    });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    return dialogResult.filePath;
  } finally {
    cleanupTempDir(tempDir);
    if (bundlePath) {
      try {
        fs.rmSync(bundlePath, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ★★ v4.1: 배치 썸네일 프리뷰 (로고 + 바 커스텀 지원)
// ═══════════════════════════════════════════════════════════
async function renderThumbnailBatch(params, mainWindow) {
  var title = params.title || '제목 없음';
  var backgroundUrl = params.backgroundUrl || null;
  var backgroundLocalPath = params.backgroundLocalPath || null;
  var logoLocalPath = params.logoLocalPath || null;
  var channelName = params.channelName || '';
  var barColor = params.barColor || '#000000';
  var barHeightPercent = params.barHeightPercent || 25;
  var ctaText = params.ctaText || '';
  var variants = params.variants || [];
  var onProgress = params.onProgress || function () {};

  log.info('[Remotion] ═══ 배치 썸네일 프리뷰 시작 ═══', variants.length, '개');
  await ensureRemotion();

  var tempDir = createTempDir(),
    bundlePath = null;
  var results = [];
  try {
    // 배경 이미지 준비
    var backgroundFilename = copyLocalFile(backgroundLocalPath, tempDir, 'thumb_bg');
    if (!backgroundFilename && backgroundUrl && isSafeBackgroundUrl(backgroundUrl)) {
      backgroundFilename = 'thumb_bg.jpg';
      try {
        await downloadFile(backgroundUrl, path.join(tempDir, backgroundFilename));
      } catch (e) {
        backgroundFilename = null;
      }
    }

    // 로고 이미지 준비
    var logoFilename = copyLocalFile(logoLocalPath, tempDir, 'channel_logo');
    if (logoFilename) log.info('[Remotion] 로고 복사:', logoFilename);

    var titleLines = splitTitleLines(title);

    onProgress('bundle', 0, '번들링 중...');
    bundlePath = await _bundle({ entryPoint: getRemotionEntryPoint(), publicDir: tempDir });

    for (let i = 0; i < variants.length; i++) {
      var v = variants[i];
      var compositionId = v.compositionId || 'LongformThumbnail';
      var inputProps = {
        titleLines: titleLines,
        backgroundSrc: backgroundFilename,
        accentColor: v.accentColor || '#FF6B35',
        channelName: channelName,
        style: v.style || 'bold',
      };
      // 숏폼 전용 props
      if (compositionId === 'ShortsThumbnail') {
        inputProps.barColor = barColor;
        inputProps.barHeightPercent = barHeightPercent;
        inputProps.logoSrc = logoFilename;
        inputProps.ctaText = ctaText;
        inputProps.showTopBar = v.showTopBar !== false;
        inputProps.showBottomBar = v.showBottomBar !== false;
      }

      var pct = Math.round((i / variants.length) * 100);
      onProgress('render', pct, '썸네일 ' + (i + 1) + '/' + variants.length + ' 렌더링 중...');

      try {
        var composition = await _selectComposition({
          serveUrl: bundlePath,
          id: compositionId,
          inputProps: inputProps,
        });
        var outputPath = path.join(tempDir, 'thumb_' + i + '.png');
        await _renderStill({
          composition: composition,
          serveUrl: bundlePath,
          output: outputPath,
          inputProps: inputProps,
          imageFormat: 'png',
        });
        var pngBuffer = fs.readFileSync(outputPath);
        results.push({
          index: i,
          ok: true,
          dataUrl: 'data:image/png;base64,' + pngBuffer.toString('base64'),
          style: v.style,
          accentColor: v.accentColor,
          compositionId: compositionId,
          label: v.label || v.style + ' · ' + v.accentColor,
        });
      } catch (e) {
        log.error('[Remotion] 변형', i, '렌더링 실패:', e.message);
        results.push({
          index: i,
          ok: false,
          error: e.message,
          style: v.style,
          accentColor: v.accentColor,
          label: v.label || '',
        });
      }
    }

    onProgress('done', 100, '프리뷰 완료');
    return results;
  } finally {
    cleanupTempDir(tempDir);
    if (bundlePath) {
      try {
        fs.rmSync(bundlePath, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ★★ v4.1: 선택된 썸네일 고화질 저장 (로고 + 바 커스텀 지원)
// ═══════════════════════════════════════════════════════════
async function renderThumbnailHQ(params, mainWindow) {
  var title = params.title || '제목 없음';
  var backgroundUrl = params.backgroundUrl || null;
  var backgroundLocalPath = params.backgroundLocalPath || null;
  var logoLocalPath = params.logoLocalPath || null;
  var accentColor = params.accentColor || '#FF6B35';
  var channelName = params.channelName || '';
  var style = params.style || 'bold';
  var compositionId = params.compositionId || 'LongformThumbnail';
  var barColor = params.barColor || '#000000';
  var barHeightPercent = params.barHeightPercent || 25;
  var ctaText = params.ctaText || '';
  var showTopBar = params.showTopBar !== false;
  var showBottomBar = params.showBottomBar !== false;
  await ensureRemotion();
  var tempDir = createTempDir(),
    bundlePath = null;
  try {
    var backgroundFilename = copyLocalFile(backgroundLocalPath, tempDir, 'thumb_bg');
    if (!backgroundFilename && backgroundUrl && isSafeBackgroundUrl(backgroundUrl)) {
      backgroundFilename = 'thumb_bg.jpg';
      try {
        await downloadFile(backgroundUrl, path.join(tempDir, backgroundFilename));
      } catch (e) {
        backgroundFilename = null;
      }
    }
    var logoFilename = copyLocalFile(logoLocalPath, tempDir, 'channel_logo');

    var titleLines = splitTitleLines(title);
    var inputProps = {
      titleLines: titleLines,
      backgroundSrc: backgroundFilename,
      accentColor: accentColor,
      channelName: channelName,
      style: style,
    };
    if (compositionId === 'ShortsThumbnail') {
      inputProps.barColor = barColor;
      inputProps.barHeightPercent = barHeightPercent;
      inputProps.logoSrc = logoFilename;
      inputProps.ctaText = ctaText;
      inputProps.showTopBar = showTopBar;
      inputProps.showBottomBar = showBottomBar;
    }

    bundlePath = await _bundle({ entryPoint: getRemotionEntryPoint(), publicDir: tempDir });
    var composition = await _selectComposition({
      serveUrl: bundlePath,
      id: compositionId,
      inputProps: inputProps,
    });
    var outputPath = path.join(tempDir, 'thumbnail_hq.png');
    await _renderStill({
      composition: composition,
      serveUrl: bundlePath,
      output: outputPath,
      inputProps: inputProps,
      imageFormat: 'png',
    });

    var isShorts = compositionId === 'ShortsThumbnail';
    var suffix = isShorts ? '_shorts_thumb' : '_thumbnail';
    var safeName = (title || '썸네일').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    var dialogResult = await dialog.showSaveDialog(mainWindow, {
      title: '썸네일 저장',
      defaultPath: safeName + suffix + '.png',
      filters: [
        { name: 'PNG', extensions: ['png'] },
        { name: 'JPEG', extensions: ['jpg'] },
      ],
    });
    if (dialogResult.canceled || !dialogResult.filePath) throw new Error('CANCELED');
    fs.copyFileSync(outputPath, dialogResult.filePath);
    return dialogResult.filePath;
  } finally {
    cleanupTempDir(tempDir);
    if (bundlePath) {
      try {
        fs.rmSync(bundlePath, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

// ═══════════════════════════════════════════════════════════
// 로컬 이미지 파일 선택 다이얼로그
// ═══════════════════════════════════════════════════════════
async function selectLocalImage(mainWindow, dialogTitle) {
  var result = await dialog.showOpenDialog(mainWindow, {
    title: dialogTitle || '이미지 선택',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  var filePath = result.filePaths[0];
  try {
    var buf = fs.readFileSync(filePath);
    var ext = path.extname(filePath).toLowerCase();
    var mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      filePath: filePath,
      dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'),
      fileName: path.basename(filePath),
    };
  } catch (e) {
    log.error('[Remotion] 이미지 읽기 실패:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// IPC 등록
// ═══════════════════════════════════════════════════════════
function registerRemotionIPC(ipcMain, assertTrustedSender, mainWindowGetter) {
  function getMW() {
    return typeof mainWindowGetter === 'function' ? mainWindowGetter() : mainWindowGetter;
  }
  function sendProgress(stage, pct, msg) {
    try {
      var mw = getMW();
      if (mw && !mw.isDestroyed())
        mw.webContents.send('remotion-progress', { stage: stage, pct: pct, msg: msg });
    } catch (e) {}
  }

  ipcMain.handle('remotion-check', function (event) {
    assertTrustedSender(event);
    try {
      require.resolve('@remotion/bundler');
      require.resolve('@remotion/renderer');
      var ep = getRemotionEntryPoint();
      var exists = fs.existsSync(ep);
      return { available: exists, entryPoint: ep };
    } catch (e) {
      return { available: false, error: e.message };
    }
  });

  ipcMain.handle('remotion-render', async function (event, params) {
    assertTrustedSender(event);
    try {
      var savePath = await renderWithRemotion(
        {
          footageList: params.footageList,
          voiceBuffer: params.voiceBuffer ? Buffer.from(params.voiceBuffer) : null,
          voiceDurationMs: params.voiceDurationMs,
          scenes: params.scenes,
          projectName: params.projectName,
          onProgress: sendProgress,
        },
        getMW()
      );
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      return { ok: false, error: e.message };
    }
  });

  // 단건 썸네일 (하위 호환)
  ipcMain.handle('remotion-render-thumbnail', async function (event, params) {
    assertTrustedSender(event);
    try {
      var savePath = await renderThumbnail(
        {
          title: params.title,
          backgroundUrl: params.backgroundUrl,
          accentColor: params.accentColor,
          channelName: params.channelName,
          style: params.style,
          onProgress: sendProgress,
        },
        getMW()
      );
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      return { ok: false, error: e.message };
    }
  });

  // ★ 배치 프리뷰
  ipcMain.handle('remotion-thumbnail-batch', async function (event, params) {
    assertTrustedSender(event);
    try {
      var results = await renderThumbnailBatch(
        {
          title: params.title,
          backgroundUrl: params.backgroundUrl,
          backgroundLocalPath: params.backgroundLocalPath,
          logoLocalPath: params.logoLocalPath,
          channelName: params.channelName,
          barColor: params.barColor,
          barHeightPercent: params.barHeightPercent,
          ctaText: params.ctaText,
          variants: params.variants,
          onProgress: sendProgress,
        },
        getMW()
      );
      return { ok: true, results: results };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ★ 고화질 저장
  ipcMain.handle('remotion-thumbnail-save-hq', async function (event, params) {
    assertTrustedSender(event);
    try {
      var savePath = await renderThumbnailHQ(
        {
          title: params.title,
          backgroundUrl: params.backgroundUrl,
          backgroundLocalPath: params.backgroundLocalPath,
          logoLocalPath: params.logoLocalPath,
          accentColor: params.accentColor,
          channelName: params.channelName,
          style: params.style,
          compositionId: params.compositionId,
          barColor: params.barColor,
          barHeightPercent: params.barHeightPercent,
          ctaText: params.ctaText,
          showTopBar: params.showTopBar,
          showBottomBar: params.showBottomBar,
          onProgress: sendProgress,
        },
        getMW()
      );
      return { ok: true, path: savePath };
    } catch (e) {
      if (e.message === 'CANCELED') return { ok: false, canceled: true };
      return { ok: false, error: e.message };
    }
  });

  // ★ 로컬 이미지 선택 (배경용)
  ipcMain.handle('remotion-select-local-image', async function (event) {
    assertTrustedSender(event);
    try {
      var result = await selectLocalImage(getMW(), '배경 이미지 선택');
      return result ? { ok: true, ...result } : { ok: false, canceled: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ★ 로컬 로고 선택
  ipcMain.handle('remotion-select-logo-image', async function (event) {
    assertTrustedSender(event);
    try {
      var result = await selectLocalImage(getMW(), '채널 로고 선택');
      return result ? { ok: true, ...result } : { ok: false, canceled: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerRemotionIPC };
