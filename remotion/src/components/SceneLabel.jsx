// ═══════════════════════════════════════════════════════════
// remotion/src/components/SceneLabel.jsx — 장면 라벨 표시
// 좌상단에 작은 라벨 뱃지 (인트로, 본론1, 아웃트로 등)
// ═══════════════════════════════════════════════════════════
import { spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

const LABEL_COLORS = {
  인트로: '#FF6B35',
  '인트로(후킹)': '#FF6B35',
  후킹: '#FF6B35',
  본론: '#3B82F6',
  본론1: '#3B82F6',
  본론2: '#6366F1',
  본론3: '#8B5CF6',
  전환: '#F59E0B',
  아웃트로: '#10B981',
  CTA: '#EF4444',
};

export const SceneLabel = ({ label, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = frame - startFrame;

  if (!label || relFrame < 0) return null;

  const slideIn = spring({
    frame: relFrame,
    fps,
    config: { damping: 15, stiffness: 180, mass: 0.6 },
  });

  const translateX = interpolate(slideIn, [0, 1], [-200, 0]);
  const opacity = interpolate(relFrame, [0, 4], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // 3초 후 페이드아웃
  const fadeOutOpacity = interpolate(relFrame, [fps * 2.5, fps * 3], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const color = LABEL_COLORS[label] || '#6B7280';

  return (
    <div
      style={{
        position: 'absolute',
        top: 120,
        left: 40,
        zIndex: 90,
        opacity: Math.min(opacity, fadeOutOpacity),
        transform: `translateX(${translateX}px)`,
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '10px 20px',
          borderLeft: `4px solid ${color}`,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
        <span
          style={{
            fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
            fontSize: 28,
            fontWeight: 700,
            color: '#FFFFFF',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
