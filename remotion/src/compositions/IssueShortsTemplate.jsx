// ═══════════════════════════════════════════════════════════
// remotion/src/compositions/IssueShortsTemplate.jsx
// "이슈 정보형 숏폼" 메인 템플릿 — 1080x1920 세로 영상
//
// ★ 풋티지/오디오는 staticFile()로 접근 (file:// 경로 사용 불가)
// ═══════════════════════════════════════════════════════════
import {
  AbsoluteFill,
  Sequence,
  Audio,
  OffthreadVideo,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { SubtitleOverlay } from '../components/SubtitleOverlay';
import { SceneLabel } from '../components/SceneLabel';
import { ProgressBar } from '../components/ProgressBar';
import {
  msToFrames,
  calculateSceneTimings,
  generateSubtitlesFromScenes,
} from '../utils/timing';

// ── 단일 장면 렌더링 (풋티지 배경 + 전환 효과) ──
const SceneClip = ({ scene, durationFrames, index, totalScenes }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // 장면 전환: 페이드 인 (첫 장면 제외)
  const fadeIn =
    index > 0
      ? interpolate(frame, [0, Math.min(8, durationFrames - 1)], [0, 1], {
          extrapolateRight: 'clamp',
        })
      : 1;

  // Ken Burns 효과: 느린 줌 + 패닝
  const zoomDirection = index % 2 === 0 ? 1 : -1;
  const scale = interpolate(
    frame,
    [0, durationFrames],
    [1.0, 1.08],
    { extrapolateRight: 'clamp' }
  );
  const translateX = interpolate(
    frame,
    [0, durationFrames],
    [0, 15 * zoomDirection],
    { extrapolateRight: 'clamp' }
  );

  // ★ footageSrc는 파일명만 들어옴 → staticFile()로 URL 변환
  const rawSrc = scene.footageSrc;
  const src = rawSrc ? staticFile(rawSrc) : null;

  const isVideo = rawSrc && (rawSrc.endsWith('.mp4') || rawSrc.endsWith('.webm'));
  const isImage = rawSrc && (rawSrc.endsWith('.jpg') || rawSrc.endsWith('.jpeg') || rawSrc.endsWith('.png') || rawSrc.endsWith('.webp'));

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      {/* 배경 풋티지 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${scale}) translateX(${translateX}px)`,
            transformOrigin: 'center center',
          }}
        >
          {isVideo && src && (
            <OffthreadVideo
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              muted
            />
          )}
          {isImage && src && (
            <Img
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
          {!src && (
            /* 풋티지 없을 때 그라디언트 배경 */
            <div
              style={{
                width: '100%',
                height: '100%',
                background: getGradient(index),
              }}
            />
          )}
        </div>
      </div>

      {/* 어둡게 오버레이 (자막 가독성 확보) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ── 풋티지 없을 때 대체 그라디언트 ──
function getGradient(index) {
  const gradients = [
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #2d1b69 100%)',
    'linear-gradient(135deg, #1b2838 0%, #1e3a5f 50%, #2c5364 100%)',
    'linear-gradient(135deg, #141e30 0%, #243b55 50%, #2c3e50 100%)',
    'linear-gradient(135deg, #0c0c1d 0%, #1a1a2e 50%, #2d1b4e 100%)',
  ];
  return gradients[index % gradients.length];
}

// ═══════════════════════════════════════════════════════════
// 메인 템플릿 컴포지션
// ═══════════════════════════════════════════════════════════
export const IssueShortsTemplate = ({
  scenes = [],
  audioSrc = null,
  audioDurationMs = 0,
  subtitles = [],
  templateStyle = 'issue-info',
}) => {
  const { fps, width, height } = useVideoConfig();

  // 장면 타이밍 계산
  const sceneTimings = calculateSceneTimings(scenes, fps);

  // 자막이 없으면 장면 텍스트로 자동 생성
  const finalSubtitles =
    subtitles && subtitles.length > 0
      ? subtitles
      : generateSubtitlesFromScenes(scenes);

  // ★ audioSrc도 파일명만 들어옴 → staticFile()로 변환
  const audioUrl = audioSrc ? staticFile(audioSrc) : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
    >
      {/* ── 장면별 풋티지 시퀀스 ── */}
      {sceneTimings.map(({ startFrame, durationFrames, scene }, i) => (
        <Sequence
          key={`scene-${i}`}
          from={startFrame}
          durationInFrames={durationFrames}
          name={`장면${i + 1}: ${scene.label || scene.text?.substring(0, 15) || ''}`}
        >
          <SceneClip
            scene={scene}
            durationFrames={durationFrames}
            index={i}
            totalScenes={scenes.length}
          />
        </Sequence>
      ))}

      {/* ── 장면 라벨 (좌상단) ── */}
      {sceneTimings.map(({ startFrame, durationFrames, scene }, i) =>
        scene.label ? (
          <Sequence
            key={`label-${i}`}
            from={startFrame}
            durationInFrames={Math.min(durationFrames, fps * 3.5)}
            name={`라벨: ${scene.label}`}
          >
            <SceneLabel label={scene.label} startFrame={0} />
          </Sequence>
        ) : null
      )}

      {/* ── 자막 오버레이 (하단 중앙) ── */}
      <SubtitleOverlay subtitles={finalSubtitles} />

      {/* ── TTS 오디오 ── */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} startFrom={0} />
      )}

      {/* ── 진행률 바 ── */}
      <ProgressBar />
    </AbsoluteFill>
  );
};
