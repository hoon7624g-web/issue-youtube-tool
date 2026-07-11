// ═══════════════════════════════════════════════════════════
// remotion/src/Root.jsx — Remotion 컴포지션 등록
// ★ v2: IssueShortsTemplate + LongformThumbnail
// ═══════════════════════════════════════════════════════════
import { Composition, Still } from 'remotion';
import { IssueShortsTemplate } from './compositions/IssueShortsTemplate';
import { LongformThumbnail } from './compositions/LongformThumbnail';
import { calculateTotalFrames } from './utils/timing';

// ── 숏폼 기본 Props (Studio 미리보기용) ──
const defaultShortsProps = {
  scenes: [
    {
      text: '오늘 놀라운 사실을 알려드립니다',
      label: '인트로',
      footageSrc: null,
      durationMs: 3000,
    },
    {
      text: '전 세계적으로 AI 기술이 빠르게 발전하고 있습니다',
      label: '본론1',
      footageSrc: null,
      durationMs: 4000,
    },
    {
      text: '특히 영상 제작 분야에서 혁신이 일어나고 있죠',
      label: '본론2',
      footageSrc: null,
      durationMs: 3500,
    },
    {
      text: '여러분도 지금 바로 시작해보세요!',
      label: '아웃트로',
      footageSrc: null,
      durationMs: 2500,
    },
  ],
  audioSrc: null,
  audioDurationMs: 13000,
  subtitles: [],
  templateStyle: 'issue-info',
};

// ── 썸네일 기본 Props (Studio 미리보기용) ──
const defaultThumbnailProps = {
  titleLines: ['AI가 바꾸는', '영상 제작의 미래'],
  backgroundSrc: null,
  accentColor: '#FF6B35',
  channelName: '유튜브도사',
  style: 'bold',
};

export const RemotionRoot = () => {
  const fps = 30;
  const totalFrames = calculateTotalFrames(defaultShortsProps.scenes, fps);

  return (
    <>
      {/* 숏폼 영상 */}
      <Composition
        id="IssueShortsTemplate"
        component={IssueShortsTemplate}
        durationInFrames={Math.max(totalFrames, 30)}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={defaultShortsProps}
        calculateMetadata={({ props }) => {
          const frames = calculateTotalFrames(props.scenes, fps);
          return {
            durationInFrames: Math.max(frames, 30),
            fps,
            width: 1080,
            height: 1920,
          };
        }}
      />

      {/* 롱폼 썸네일 (정지 이미지) */}
      <Still
        id="LongformThumbnail"
        component={LongformThumbnail}
        width={1280}
        height={720}
        defaultProps={defaultThumbnailProps}
      />
    </>
  );
};
