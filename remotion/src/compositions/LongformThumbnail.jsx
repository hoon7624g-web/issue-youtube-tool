// ═══════════════════════════════════════════════════════════
// remotion/src/compositions/LongformThumbnail.jsx
// 롱폼 YouTube 썸네일 — 1280×720 정지 이미지
//
// inputProps:
//   titleLines: string[] — 제목 (1~3줄)
//   backgroundSrc: string|null — 배경 이미지 파일명 (staticFile)
//   accentColor: string — 강조 색상 (#FF6B35 등)
//   channelName: string — 채널명 (우하단)
//   style: 'bold'|'news'|'minimal' — 스타일 프리셋
// ═══════════════════════════════════════════════════════════
import { AbsoluteFill, Img, staticFile } from 'remotion';

// ── 스타일 프리셋 ──
const STYLES = {
  bold: {
    fontSize: 82,
    fontWeight: 900,
    lineHeight: 1.15,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 6,
    overlayGradient:
      'linear-gradient(135deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.6) 100%)',
    accentBarHeight: 8,
    textAlign: 'left',
    textX: 60,
    textY: 'center',
  },
  news: {
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1.2,
    textColor: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    overlayGradient:
      'linear-gradient(0deg, rgba(180,20,20,0.92) 0%, rgba(180,20,20,0.85) 35%, transparent 65%)',
    accentBarHeight: 0,
    textAlign: 'left',
    textX: 60,
    textY: 'bottom',
  },
  minimal: {
    fontSize: 76,
    fontWeight: 800,
    lineHeight: 1.2,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    overlayGradient: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.7) 100%)',
    accentBarHeight: 0,
    textAlign: 'center',
    textX: 0,
    textY: 'bottom',
  },
};

export const LongformThumbnail = ({
  titleLines = ['제목을 입력하세요'],
  backgroundSrc = null,
  accentColor = '#FF6B35',
  channelName = '',
  style = 'bold',
}) => {
  const preset = STYLES[style] || STYLES.bold;
  const bgUrl = backgroundSrc ? staticFile(backgroundSrc) : null;

  // 텍스트 Y 위치 계산
  const totalTextHeight = titleLines.length * preset.fontSize * preset.lineHeight;
  let textTopY;
  if (preset.textY === 'center') {
    textTopY = (720 - totalTextHeight) / 2;
  } else {
    // bottom
    textTopY = 720 - totalTextHeight - 80;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
      {/* ── 배경 이미지 ── */}
      {bgUrl && (
        <Img
          src={bgUrl}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* ── 배경 없을 때 그라디언트 ── */}
      {!bgUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(135deg, #0f0f23 0%, #1a1a3e 40%, ${accentColor}33 100%)`,
          }}
        />
      )}

      {/* ── 오버레이 ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: preset.overlayGradient,
        }}
      />

      {/* ── 상단 강조 바 ── */}
      {preset.accentBarHeight > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: preset.accentBarHeight,
            background: accentColor,
          }}
        />
      )}

      {/* ── 제목 텍스트 ── */}
      <div
        style={{
          position: 'absolute',
          top: textTopY,
          left: preset.textAlign === 'center' ? 60 : preset.textX,
          right: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: preset.textAlign === 'center' ? 'center' : 'flex-start',
          gap: 4,
        }}
      >
        {titleLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily:
                '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
              fontSize: preset.fontSize,
              fontWeight: preset.fontWeight,
              lineHeight: preset.lineHeight,
              color: preset.textColor,
              textAlign: preset.textAlign,
              // 텍스트 윤곽선
              WebkitTextStroke:
                preset.strokeWidth > 0 ? `${preset.strokeWidth}px ${preset.strokeColor}` : 'none',
              paintOrder: 'stroke fill',
              // 그림자
              textShadow: '4px 4px 12px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)',
              // 키워드 강조: 각 줄에서 첫 번째 따옴표/괄호 안 텍스트를 강조색으로
              letterSpacing: '-0.02em',
            }}
          >
            {line}
          </div>
        ))}

        {/* ── 강조 밑줄 ── */}
        {style === 'bold' && (
          <div
            style={{
              width: Math.min(titleLines[0].length * preset.fontSize * 0.55, 800),
              height: 6,
              background: accentColor,
              borderRadius: 3,
              marginTop: 12,
            }}
          />
        )}
      </div>

      {/* ── 채널명 (우하단) ── */}
      {channelName && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 32,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            borderRadius: 8,
            padding: '8px 16px',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accentColor,
            }}
          />
          <span
            style={{
              fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
              fontSize: 24,
              fontWeight: 600,
              color: '#FFFFFF',
              letterSpacing: '0.01em',
            }}
          >
            {channelName}
          </span>
        </div>
      )}

      {/* ── 좌하단 장식 요소 ── */}
      {style === 'news' && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 32,
            background: accentColor,
            borderRadius: 6,
            padding: '6px 14px',
          }}
        >
          <span
            style={{
              fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
              fontSize: 20,
              fontWeight: 700,
              color: '#FFFFFF',
            }}
          >
            ISSUE
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
