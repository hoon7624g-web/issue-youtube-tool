// ═══════════════════════════════════════════════════════════
// remotion/src/components/SubtitleOverlay.jsx — 자막 오버레이
// 이슈 정보형 숏폼 스타일: 하단 중앙, 큰 글씨, 테두리 있는 흰 글자
// ═══════════════════════════════════════════════════════════
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { msToFrames } from '../utils/timing';

/**
 * SubtitleOverlay — 현재 프레임에 맞는 자막을 표시
 * @param {Array} subtitles - [{start (ms), end (ms), text}]
 */
export const SubtitleOverlay = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!subtitles || !subtitles.length) return null;

  // 현재 프레임에 해당하는 자막 찾기
  const currentTimeMs = (frame / fps) * 1000;
  const activeSub = subtitles.find((s) => currentTimeMs >= s.start && currentTimeMs < s.end);

  if (!activeSub) return null;

  // 자막 시작 시점 기준 spring 애니메이션
  const subStartFrame = msToFrames(activeSub.start, fps);
  const relativeFrame = frame - subStartFrame;

  const scaleSpring = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
  });

  const opacity = interpolate(relativeFrame, [0, 3], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // 자막 끝나기 직전 페이드아웃
  const subEndFrame = msToFrames(activeSub.end, fps);
  const fadeOutStart = subEndFrame - subStartFrame - 3;
  const fadeOut = interpolate(
    relativeFrame,
    [Math.max(fadeOutStart, 0), subEndFrame - subStartFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(opacity, fadeOut);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 280,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
        opacity: finalOpacity,
        transform: `scale(${scaleSpring})`,
      }}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          borderRadius: 16,
          padding: '16px 32px',
          maxWidth: 900,
        }}
      >
        <span
          style={{
            fontFamily: '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
            fontSize: 52,
            fontWeight: 800,
            color: '#FFFFFF',
            textAlign: 'center',
            lineHeight: 1.3,
            letterSpacing: '-0.02em',
            // 텍스트 테두리 효과
            textShadow:
              '0 0 8px rgba(0,0,0,0.8), 2px 2px 4px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.6)',
          }}
        >
          {activeSub.text}
        </span>
      </div>
    </div>
  );
};
