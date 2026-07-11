// ═══════════════════════════════════════════════════════════════
// capcut-draft.js — CapCut Draft JSON 생성 모듈
// 유튜브도사 파이프라인 결과물 → CapCut 프로젝트 자동 변환
// pycapcut 라이브러리 구조 기반 리버스엔지니어링
// ═══════════════════════════════════════════════════════════════

const SEC = 1_000_000; // 1초 = 1,000,000 마이크로초 (CapCut 시간 단위)

// ── UUID 생성 ──
function uuid() {
  // crypto.randomUUID fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── 시간 변환 유틸 ──
function secToUs(sec) {
  return Math.round(sec * SEC);
}

function parseCutDuration(cutStr) {
  // "2-3초" → 평균 2.5초, "3초" → 3초, "2~4초" → 3초
  if (!cutStr || typeof cutStr !== 'string') return 3 * SEC;
  const cleaned = cutStr.replace(/초|s/gi, '').trim();
  const parts = cleaned.split(/[-~]/);
  if (parts.length === 2) {
    const avg = (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
    return isNaN(avg) ? 3 * SEC : secToUs(avg);
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? 3 * SEC : secToUs(val);
}

// ── Timerange ──
function timerange(start, duration) {
  return { start: Math.round(start), duration: Math.round(duration) };
}

// ── 기본 ClipSettings ──
function defaultClip() {
  return {
    alpha: 1.0,
    flip: { horizontal: false, vertical: false },
    rotation: 0.0,
    scale: { x: 1.0, y: 1.0 },
    transform: { x: 0.0, y: 0.0 },
  };
}

// ── Segment 기본 필드 ──
function baseSegmentFields(id, materialId, targetTimerange) {
  return {
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    last_nonzero_volume: 1.0,
    reverse: false,
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    id,
    material_id: materialId,
    target_timerange: targetTimerange,
    common_keyframes: [],
    keyframe_refs: [],
  };
}

// ═══════════════════════════════════════
// 비디오 소재(Material) 생성
// ═══════════════════════════════════════
function createVideoMaterial({ id, name, path, duration, width, height, type = 'photo' }) {
  return {
    audio_fade: null,
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: {
      upper_left_x: 0.0,
      upper_left_y: 0.0,
      upper_right_x: 1.0,
      upper_right_y: 0.0,
      lower_left_x: 0.0,
      lower_left_y: 1.0,
      lower_right_x: 1.0,
      lower_right_y: 1.0,
    },
    crop_ratio: 'free',
    crop_scale: 1.0,
    duration,
    height,
    id,
    local_material_id: '',
    material_id: id,
    material_name: name,
    media_path: '',
    path,
    type, // "video" | "photo"
    width,
  };
}

// ═══════════════════════════════════════
// 오디오 소재(Material) 생성
// ═══════════════════════════════════════
function createAudioMaterial({ id, name, path, duration }) {
  return {
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 3,
    copyright_limit_type: 'none',
    duration,
    effect_id: '',
    formula_id: '',
    id,
    local_material_id: id,
    music_id: id,
    name,
    path,
    source_platform: 0,
    type: 'extract_music',
    wave_points: [],
  };
}

// ═══════════════════════════════════════
// 텍스트 소재(Material) 생성 — 자막용
// ═══════════════════════════════════════
function createTextMaterial({
  id,
  text,
  fontSize = 8.0,
  color = [1.0, 1.0, 1.0],
  bold = true,
  hasBorder = true,
}) {
  const contentJson = {
    styles: [
      {
        fill: {
          alpha: 1.0,
          content: {
            render_type: 'solid',
            solid: { alpha: 1.0, color },
          },
        },
        range: [0, text.length],
        size: fontSize,
        bold,
        italic: false,
        underline: false,
        strokes: hasBorder
          ? [
              {
                content: {
                  solid: { alpha: 1.0, color: [0.0, 0.0, 0.0] },
                },
                width: 0.08,
              },
            ]
          : [],
      },
    ],
    text,
  };

  return {
    id,
    content: JSON.stringify(contentJson),
    typesetting: 0,
    alignment: 1, // 가운데 정렬
    letter_spacing: 0.0,
    line_spacing: 0.07,
    line_feed: 1,
    line_max_width: 0.82,
    force_apply_line_max_width: false,
    check_flag: hasBorder ? 15 : 7,
    type: 'subtitle',
    global_alpha: 1.0,
  };
}

// ═══════════════════════════════════════
// Speed 객체 생성
// ═══════════════════════════════════════
function createSpeed(id, speed = 1.0) {
  return {
    curve_speed: null,
    id,
    mode: 0,
    speed,
    type: 'speed',
  };
}

// ═══════════════════════════════════════
// 비디오 Segment 생성
// ═══════════════════════════════════════
function createVideoSegment({ materialId, sourceTimerange, targetTimerange, speedId }) {
  const segId = uuid();
  return {
    ...baseSegmentFields(segId, materialId, targetTimerange),
    source_timerange: sourceTimerange,
    speed: 1.0,
    volume: 0.0, // 비디오 자체 소리는 뮤트 (TTS 사용)
    extra_material_refs: [speedId],
    clip: defaultClip(),
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    uniform_scale: { on: true, value: 1.0 },
    render_index: 0,
  };
}

// ═══════════════════════════════════════
// 오디오 Segment 생성
// ═══════════════════════════════════════
function createAudioSegment({
  materialId,
  sourceTimerange,
  targetTimerange,
  speedId,
  volume = 1.0,
}) {
  const segId = uuid();
  return {
    ...baseSegmentFields(segId, materialId, targetTimerange),
    source_timerange: sourceTimerange,
    speed: 1.0,
    volume,
    extra_material_refs: [speedId],
    clip: null,
    hdr_settings: null,
    render_index: 0,
  };
}

// ═══════════════════════════════════════
// 텍스트(자막) Segment 생성
// ═══════════════════════════════════════
function createTextSegment({ materialId, targetTimerange }) {
  const segId = uuid();
  const speedId = uuid();
  return {
    segment: {
      ...baseSegmentFields(segId, materialId, targetTimerange),
      source_timerange: null,
      speed: 1.0,
      volume: 1.0,
      extra_material_refs: [speedId],
      clip: {
        ...defaultClip(),
        transform: { x: 0.0, y: 0.8 }, // 화면 하단에 배치
      },
      uniform_scale: { on: true, value: 1.0 },
      render_index: 15000,
    },
    speed: createSpeed(speedId),
  };
}

// ═══════════════════════════════════════
// Track 생성
// ═══════════════════════════════════════
function createTrack({ type, name = '', segments, renderIndex = 0, mute = false }) {
  return {
    attribute: mute ? 1 : 0,
    flag: 0,
    id: uuid(),
    is_default_name: name.length === 0,
    name,
    segments: segments.map((seg) => ({ ...seg, render_index: renderIndex })),
    type,
  };
}

// ═══════════════════════════════════════
// 빈 Materials 템플릿
// ═══════════════════════════════════════
function emptyMaterials() {
  return {
    ai_translates: [],
    audio_balances: [],
    audio_effects: [],
    audio_fades: [],
    audio_track_indexes: [],
    audios: [],
    beats: [],
    canvases: [],
    chromas: [],
    color_curves: [],
    common_mask: [],
    digital_human_model_dressing: [],
    digital_humans: [],
    drafts: [],
    effects: [],
    flowers: [],
    green_screens: [],
    handwrites: [],
    hsl: [],
    images: [],
    log_color_wheels: [],
    loudnesses: [],
    manual_beautys: [],
    manual_deformations: [],
    material_animations: [],
    material_colors: [],
    multi_language_refs: [],
    placeholder_infos: [],
    placeholders: [],
    plugin_effects: [],
    primary_color_wheels: [],
    realtime_denoises: [],
    shapes: [],
    smart_crops: [],
    smart_relights: [],
    sound_channel_mappings: [],
    speeds: [],
    stickers: [],
    tail_leaders: [],
    text_templates: [],
    texts: [],
    time_marks: [],
    transitions: [],
    video_effects: [],
    video_trackings: [],
    videos: [],
    vocal_beautifys: [],
    vocal_separations: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// SRT 자막 생성
// ═══════════════════════════════════════════════════════════════
function formatSrtTime(us) {
  const totalMs = Math.round(us / 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * SRT 자막 파일 내용 생성
 * @param {Array<{text: string, startUs: number, durationUs: number}>} subtitles
 * @returns {string} SRT 파일 내용
 */
export function generateSRT(subtitles) {
  return subtitles
    .map((sub, i) => {
      const start = formatSrtTime(sub.startUs);
      const end = formatSrtTime(sub.startUs + sub.durationUs);
      return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
    })
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
// 메인: CapCut Draft 생성
// ═══════════════════════════════════════════════════════════════

/**
 * 유튜브도사 파이프라인 결과물로부터 CapCut Draft JSON 생성
 *
 * @param {Object} options
 * @param {string} options.projectName - 프로젝트 이름
 * @param {'shorts'|'longform'} options.format - 영상 포맷 (숏폼/롱폼)
 * @param {Array<Object>} options.scenes - step8 장면 배열
 *   각 scene: { scene, label, text, cut, mainEn?, ko? }
 *   - text: 해당 장면의 대본 텍스트 (자막으로 사용)
 *   - cut: "2-3초" 형식의 컷 길이
 * @param {Object} [options.voice] - step9 음성 결과
 *   { filePath: string, durationMs: number }
 *   filePath: 사용자 로컬 기준 음성 파일 경로
 * @param {Array<Object>} [options.footage] - 풋티지 파일 정보 (선택)
 *   각 항목: { filePath: string, durationMs: number, width?: number, height?: number }
 * @param {Object} [options.subtitle] - 자막 스타일 설정
 *   { fontSize?: number, color?: [r,g,b], bold?: boolean, border?: boolean }
 *
 * @returns {{ draftContent: string, draftMeta: string, srt: string }}
 */
export function generateCapcutDraft(options) {
  const {
    projectName = '유튜브도사 프로젝트',
    format = 'shorts',
    scenes = [],
    voice = null,
    footage = [],
    subtitle = {},
  } = options;

  // ── 캔버스 설정 ──
  const isShorts = format === 'shorts';
  const width = isShorts ? 1080 : 1920;
  const height = isShorts ? 1920 : 1080;
  const fps = 30;

  // ── 장면별 타임코드 계산 ──
  const sceneTiming = [];
  let cursor = 0;
  for (const sc of scenes) {
    const dur = parseCutDuration(sc.cut);
    sceneTiming.push({
      ...sc,
      startUs: cursor,
      durationUs: dur,
    });
    cursor += dur;
  }
  const totalDuration = cursor;

  // ── Materials 준비 ──
  const materials = emptyMaterials();
  const tracks = [];

  // ── 1) 비디오 트랙 (풋티지가 있는 경우) ──
  if (footage.length > 0) {
    const videoSegments = [];
    let videoCursor = 0;

    for (let i = 0; i < sceneTiming.length; i++) {
      const scene = sceneTiming[i];
      const ft = footage[i % footage.length]; // 풋티지가 장면보다 적으면 순환
      const matId = uuid();
      const speedId = uuid();

      const ftDurationUs = ft.durationMs ? ft.durationMs * 1000 : scene.durationUs;

      materials.videos.push(
        createVideoMaterial({
          id: matId,
          name: ft.filePath ? ft.filePath.split(/[/\\]/).pop() : `scene_${i + 1}`,
          path: ft.filePath || '',
          duration: ftDurationUs,
          width: ft.width || width,
          height: ft.height || height,
          type: 'video',
        })
      );
      materials.speeds.push(createSpeed(speedId));

      const srcDur = Math.min(ftDurationUs, scene.durationUs);
      videoSegments.push(
        createVideoSegment({
          materialId: matId,
          sourceTimerange: timerange(0, srcDur),
          targetTimerange: timerange(videoCursor, scene.durationUs),
          speedId,
        })
      );
      videoCursor += scene.durationUs;
    }

    tracks.push(
      createTrack({
        type: 'video',
        segments: videoSegments,
        renderIndex: 0,
      })
    );
  }

  // ── 2) 오디오 트랙 (TTS 음성) ──
  if (voice && voice.filePath) {
    const audioMatId = uuid();
    const audioSpeedId = uuid();
    const audioDurationUs = voice.durationMs ? voice.durationMs * 1000 : totalDuration;

    materials.audios.push(
      createAudioMaterial({
        id: audioMatId,
        name: voice.filePath.split(/[/\\]/).pop() || 'voice.mp3',
        path: voice.filePath,
        duration: audioDurationUs,
      })
    );
    materials.speeds.push(createSpeed(audioSpeedId));

    const audioSeg = createAudioSegment({
      materialId: audioMatId,
      sourceTimerange: timerange(0, audioDurationUs),
      targetTimerange: timerange(0, audioDurationUs),
      speedId: audioSpeedId,
    });

    tracks.push(
      createTrack({
        type: 'audio',
        segments: [audioSeg],
        renderIndex: 0,
      })
    );
  }

  // ── 3) 텍스트(자막) 트랙 ──
  if (sceneTiming.length > 0) {
    const textSegments = [];
    const subtitleEntries = []; // SRT용

    const subStyle = {
      fontSize: subtitle.fontSize || 8.0,
      color: subtitle.color || [1.0, 1.0, 1.0],
      bold: subtitle.bold !== false,
      hasBorder: subtitle.border !== false,
    };

    for (const scene of sceneTiming) {
      const text = scene.text || scene.ko || '';
      if (!text) continue;

      // 긴 텍스트는 여러 줄로 분할 (자막 가독성)
      const lines = splitSubtitleText(text, isShorts ? 12 : 20);

      // 각 줄을 균등 분배
      const lineCount = lines.length;
      const lineDur = Math.floor(scene.durationUs / lineCount);

      for (let li = 0; li < lineCount; li++) {
        const matId = uuid();
        const tStart = scene.startUs + li * lineDur;
        const tDur = li === lineCount - 1 ? scene.durationUs - li * lineDur : lineDur;

        materials.texts.push(
          createTextMaterial({
            id: matId,
            text: lines[li],
            ...subStyle,
          })
        );

        const { segment, speed } = createTextSegment({
          materialId: matId,
          targetTimerange: timerange(tStart, tDur),
        });
        materials.speeds.push(speed);
        textSegments.push(segment);

        subtitleEntries.push({
          text: lines[li],
          startUs: tStart,
          durationUs: tDur,
        });
      }
    }

    tracks.push(
      createTrack({
        type: 'text',
        segments: textSegments,
        renderIndex: 15000,
      })
    );

    // SRT 생성
    var srtContent = generateSRT(subtitleEntries);
  }

  // ── Draft Content 조립 ──
  const now = Date.now();
  const draftContent = {
    canvas_config: {
      background: null,
      height,
      ratio: 'original',
      width,
    },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      multi_language_current: 'none',
      multi_language_list: [],
      multi_language_main: 'none',
      multi_language_mode: 'none',
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      use_float_render: false,
      video_mute: false,
      zoom_info_params: null,
    },
    cover: null,
    create_time: now,
    duration: totalDuration,
    extra_info: null,
    fps: fps * 1.0,
    free_render_index_mode_on: false,
    group_container: null,
    id: uuid().toUpperCase(),
    is_drop_frame_timecode: false,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [],
      audios: [],
      effects: [],
      filters: [],
      handwrites: [],
      stickers: [],
      texts: [],
      videos: [],
    },
    last_modified_platform: {
      app_id: 359289,
      app_source: 'cc',
      app_version: '6.7.0',
      os: 'windows',
    },
    lyrics_effects: [],
    materials,
    mutable_config: null,
    name: projectName,
    new_version: '140.0.0',
    path: '',
    platform: {
      app_id: 359289,
      app_source: 'cc',
      app_version: '6.7.0',
      os: 'windows',
    },
    relationships: [],
    render_index_track_mode_on: false,
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    time_marks: null,
    tracks,
    update_time: now,
    version: 360000,
  };

  // ── Draft Meta Info ──
  const draftMeta = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    cloud_package_completed_time: '',
    draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false,
    draft_cloud_package_type: '',
    draft_cloud_purchase_info: '',
    draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '',
    draft_cloud_videocut_purchase_info: '',
    draft_cover: '',
    draft_deeplink_url: '',
    draft_enterprise_info: {
      draft_enterprise_extra: '',
      draft_enterprise_id: '',
      draft_enterprise_name: '',
      enterprise_material: [],
    },
    draft_fold_path: '',
    draft_id: uuid().toUpperCase(),
    draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false,
    draft_is_ai_translate: false,
    draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false,
    draft_is_from_deeplink: 'false',
    draft_is_invisible: false,
    draft_materials: [
      { type: 0, value: [] },
      { type: 1, value: [] },
      { type: 2, value: [] },
      { type: 3, value: [] },
      { type: 6, value: [] },
      { type: 7, value: [] },
      { type: 8, value: [] },
    ],
    draft_materials_copied_info: [],
    draft_name: projectName,
    draft_new_version: '',
    draft_removable_storage_device: '',
    draft_root_path: '',
    draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0,
    draft_type: '',
    tm_draft_cloud_completed: '',
    tm_draft_cloud_entry_id: 0,
    tm_draft_cloud_modified: 0,
    tm_draft_removed: 0,
    tm_duration: Math.round(totalDuration / 1000), // ms
  };

  return {
    draftContent: JSON.stringify(draftContent, null, 2),
    draftMeta: JSON.stringify(draftMeta, null, 2),
    srt: srtContent || '',
    sceneTiming, // 디버깅/표시용
    totalDurationMs: Math.round(totalDuration / 1000),
  };
}

// ── 자막 텍스트 분할 유틸 ──
function splitSubtitleText(text, maxCharsPerLine) {
  if (text.length <= maxCharsPerLine) return [text];

  const lines = [];
  // 문장 구분자 기준 분할 시도
  const sentences = text.split(/(?<=[.!?。！？,，~\s])/g).filter((s) => s.trim());

  let current = '';
  for (const sent of sentences) {
    if ((current + sent).length > maxCharsPerLine && current.length > 0) {
      lines.push(current.trim());
      current = sent;
    } else {
      current += sent;
    }
  }
  if (current.trim()) lines.push(current.trim());

  // 분할 결과가 없으면 강제 분할
  if (lines.length === 0) {
    for (let i = 0; i < text.length; i += maxCharsPerLine) {
      lines.push(text.substring(i, i + maxCharsPerLine));
    }
  }
  return lines;
}

// ── 유튜브도사 state에서 CapCut 입력 변환 헬퍼 ──

/**
 * 유튜브도사의 S (state) 객체에서 CapCut draft 입력 데이터 추출
 * step10에서 호출 가능
 *
 * @param {Object} S - 유튜브도사 state
 * @param {Object} result - 선택된 결과 객체 (S.script.results[i])
 * @returns {Object} generateCapcutDraft()에 전달할 options
 */
export function extractFromPipelineState(S, result) {
  // 장면 데이터 (step8에서 생성)
  const scenes = [];
  if (result && result.footage && Array.isArray(result.footage.scenes)) {
    for (const sc of result.footage.scenes) {
      scenes.push({
        scene: sc.scene || '',
        label: sc.label || '',
        text: sc.text || sc.ko || '',
        cut: sc.cut || '3초',
        mainEn: sc.mainEn || '',
      });
    }
  }

  // 음성 데이터 (step9에서 생성)
  let voice = null;
  if (result && result.voiceResult) {
    const vr = result.voiceResult;
    voice = {
      filePath: '', // ZIP 추출 후 사용자가 설정
      durationMs: vr.durationMs || null,
    };
  }

  // 프로젝트 이름
  const title =
    result && result.script && result.script.title
      ? result.script.title
      : (S.keywords && S.keywords.selected) || '유튜브도사 프로젝트';

  // 포맷 판별
  const scriptType = result && result.script && result.script.type;
  const format = scriptType === 'shorts' || scriptType === 'shorts_only' ? 'shorts' : 'longform';

  return {
    projectName: title,
    format,
    scenes,
    voice,
    footage: [], // 사용자가 직접 풋티지 추가
  };
}
