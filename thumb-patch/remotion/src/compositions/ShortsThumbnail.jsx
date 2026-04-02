// ═══════════════════════════════════════════════════════════
// remotion/src/compositions/ShortsThumbnail.jsx
// 숏폼 YouTube Shorts 썸네일 — 1080×1920 정지 이미지
// ★ v4.1: 바 색상/높이 커스텀, 로고 업로드, CTA 버튼
//
// inputProps:
//   titleLines: string[]        — 제목 (1~3줄)
//   backgroundSrc: string|null  — 배경 이미지 파일명 (staticFile)
//   accentColor: string         — 강조 색상 (밑줄, CTA 등)
//   channelName: string         — 채널명
//   style: 'bold'|'news'|'minimal'
//   barColor: string            — 상단/하단 바 배경색 (#000000 등)
//   barHeightPercent: number    — 바 높이 비율 (15~35, 기본 25)
//   logoSrc: string|null        — 채널 로고 파일명 (staticFile)
//   ctaText: string             — CTA 버튼 텍스트
//   showTopBar: boolean
//   showBottomBar: boolean
// ═══════════════════════════════════════════════════════════
import { AbsoluteFill, Img, staticFile } from 'remotion';

const W = 1080;
const H = 1920;

// ── 텍스트 스타일 프리셋 ──
const TEXT_STYLES = {
  bold: {
    fontSize: 68,
    fontWeight: 900,
    lineHeight: 1.18,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 5,
    textAlign: 'left',
    showUnderline: true,
  },
  news: {
    fontSize: 60,
    fontWeight: 800,
    lineHeight: 1.22,
    textColor: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidth: 0,
    textAlign: 'left',
    showUnderline: false,
  },
  minimal: {
    fontSize: 64,
    fontWeight: 800,
    lineHeight: 1.2,
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 3,
    textAlign: 'center',
    showUnderline: false,
  },
};

export const ShortsThumbnail = ({
  titleLines = ['숏폼 제목을', '입력하세요'],
  backgroundSrc = null,
  accentColor = '#FF6B35',
  channelName = '',
  style = 'bold',
  barColor = '#000000',
  barHeightPercent = 25,
  logoSrc = null,
  ctaText = '',
  showTopBar = true,
  showBottomBar = true,
}) => {
  const preset = TEXT_STYLES[style] || TEXT_STYLES.bold;
  const bgUrl = backgroundSrc ? staticFile(backgroundSrc) : null;
  const logoUrl = logoSrc ? staticFile(logoSrc) : null;

  // 바 높이 계산 (15% ~ 35% 범위)
  const clampedPct = Math.max(15, Math.min(35, barHeightPercent));
  const topBarH = showTopBar ? Math.round(H * clampedPct / 100) : 0;
  const bottomBarH = showBottomBar ? Math.round(H * clampedPct / 100) : 0;
  const middleTop = topBarH;
  const middleH = H - topBarH - bottomBarH;

  // 상단 바 내 텍스트 레이아웃
  const totalTextHeight = titleLines.length * preset.fontSize * preset.lineHeight;
  const textTopY = Math.max(topBarH * 0.12, (topBarH - totalTextHeight) / 2);

  // 하단 바 내 레이아웃
  const logoSize = Math.round(bottomBarH * 0.28);
  const logoY = Math.round(H - bottomBarH + bottomBarH * 0.18);
  const channelY = logoY + logoSize / 2;
  const ctaY = Math.round(H - bottomBarH * 0.28);
  const ctaH = Math.round(bottomBarH * 0.18);
  const ctaFontSize = Math.max(20, Math.round(ctaH * 0.7));

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', overflow: 'hidden' }}>

      {/* ═══ 중간: 배경 이미지 영역 ═══ */}
      <div
        style={{
          position: 'absolute',
          top: middleTop,
          left: 0,
          right: 0,
          height: middleH,
          overflow: 'hidden',
        }}
      >
        {/* 배경 이미지 */}
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

        {/* 배경 없을 때 그라디언트 */}
        {!bgUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(160deg, #0f0f23 0%, #1a1a3e 40%, ${accentColor}44 100%)`,
            }}
          />
        )}

        {/* 상단 바와의 경계 페이드 */}
        {showTopBar && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 60,
              background: `linear-gradient(180deg, ${barColor} 0%, transparent 100%)`,
            }}
          />
        )}

        {/* 하단 바와의 경계 페이드 */}
        {showBottomBar && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
              background: `linear-gradient(0deg, ${barColor} 0%, transparent 100%)`,
            }}
          />
        )}
      </div>

      {/* ═══ 상단 바: 제목 텍스트 ═══ */}
      {showTopBar && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: topBarH,
            background: barColor,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 48px',
          }}
        >
          {/* 제목 텍스트 */}
          <div
            style={{
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
                  WebkitTextStroke:
                    preset.strokeWidth > 0
                      ? `${preset.strokeWidth}px ${preset.strokeColor}`
                      : 'none',
                  paintOrder: 'stroke fill',
                  textShadow: '3px 3px 10px rgba(0,0,0,0.6)',
                  letterSpacing: '-0.02em',
                  maxWidth: '100%',
                }}
              >
                {line}
              </div>
            ))}

            {/* 강조 밑줄 */}
            {preset.showUnderline && (
              <div
                style={{
                  width: Math.min(
                    titleLines[0].length * preset.fontSize * 0.55,
                    W - 96
                  ),
                  height: 5,
                  background: accentColor,
                  borderRadius: 3,
                  marginTop: 10,
                }}
              />
            )}
          </div>

          {/* news 스타일: 뱃지 */}
          {style === 'news' && (
            <div
              style={{
                marginTop: 16,
                alignSelf: 'flex-start',
                background: accentColor,
                borderRadius: 6,
                padding: '6px 16px',
              }}
            >
              <span
                style={{
                  fontFamily: '"Pretendard", sans-serif',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#FFFFFF',
                }}
              >
                ISSUE
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══ 하단 바: 로고 + 채널명 + CTA ═══ */}
      {showBottomBar && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: bottomBarH,
            background: barColor,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Math.round(bottomBarH * 0.06),
            padding: '0 48px',
          }}
        >
          {/* 로고 + 채널명 행 */}
          {(logoUrl || channelName) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {/* 로고 이미지 또는 이니셜 원 */}
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  style={{
                    width: logoSize,
                    height: logoSize,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: `3px solid ${accentColor}44`,
                  }}
                />
              ) : channelName ? (
                <div
                  style={{
                    width: logoSize,
                    height: logoSize,
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${accentColor}, ${accentColor}AA)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: '"Pretendard", sans-serif',
                      fontSize: Math.round(logoSize * 0.5),
                      fontWeight: 900,
                      color: '#FFFFFF',
                    }}
                  >
                    {channelName.charAt(0)}
                  </span>
                </div>
              ) : null}

              {/* 채널명 */}
              {channelName && (
                <span
                  style={{
                    fontFamily:
                      '"Pretendard", "Noto Sans KR", sans-serif',
                    fontSize: Math.round(logoSize * 0.55),
                    fontWeight: 700,
                    color: '#FFFFFF',
                    letterSpacing: '0.01em',
                  }}
                >
                  {channelName}
                </span>
              )}
            </div>
          )}

          {/* CTA 버튼 */}
          {ctaText && (
            <div
              style={{
                background: accentColor,
                borderRadius: Math.round(ctaH / 2),
                padding: `${Math.round(ctaH * 0.2)}px ${Math.round(ctaH * 1.2)}px`,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontFamily: '"Pretendard", "Noto Sans KR", sans-serif',
                  fontSize: ctaFontSize,
                  fontWeight: 700,
                  color: '#FFFFFF',
                  letterSpacing: '0.02em',
                }}
              >
                {ctaText}
              </span>
            </div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
