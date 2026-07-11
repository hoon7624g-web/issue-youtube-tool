// ═══════════════════════════════════════════════════════════
// remotion/src/components/ProgressBar.jsx — 하단 진행률 바
// 숏폼 영상 하단에 재생 위치 표시
// ═══════════════════════════════════════════════════════════
import { useCurrentFrame, useVideoConfig } from 'remotion';

export const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = frame / durationInFrames;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        background: 'rgba(255, 255, 255, 0.15)',
        zIndex: 200,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress * 100}%`,
          background: 'linear-gradient(90deg, #FF6B35, #FF3D00)',
          borderRadius: '0 3px 3px 0',
          transition: 'none',
        }}
      />
    </div>
  );
};
