# 유튜브도사 Remotion 통합 풀패키지

## 파일 교체 가이드

아래 파일들을 `C:\issue-youtube-tool\` 기준으로 교체하세요.

### 교체 파일 (기존 파일 덮어쓰기)
- `package.json` → `C:\issue-youtube-tool\package.json`
- `main.js` → `C:\issue-youtube-tool\main.js`
- `preload.js` → `C:\issue-youtube-tool\preload.js`
- `main/ipc-remotion.js` → `C:\issue-youtube-tool\main\ipc-remotion.js`
- `src/js/pipeline/step10-result.js` → `C:\issue-youtube-tool\src\js\pipeline\step10-result.js`

### 새 파일 (remotion 폴더 전체)
- `remotion/` 폴더 전체 → `C:\issue-youtube-tool\remotion\`

## 설치 순서
```
cd C:\issue-youtube-tool
npm install
cd remotion && npm install && cd ..
npm run build:win
```

## 주요 변경사항
- `asar: false` — 네이티브 바이너리(esbuild/Chromium) 호환
- 음성 길이 자동 측정 (ffmpeg probe)
- 자막 분할 v2 (자연스러운 끊김)
- 풋티지/오디오를 staticFile()로 서빙
- 롱폼 썸네일 생성 (renderStill)
- react/react-dom/remotion을 루트 dependencies에 포함
