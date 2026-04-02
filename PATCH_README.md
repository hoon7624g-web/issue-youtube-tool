# 유튜브도사 v3.6.0 → v3.6.0-patch (v1~v25 웹 버전 수정사항 통합)

## 적용 방법

이 ZIP의 파일들을 `issue-youtube-tool-main/` 프로젝트 루트에 **그대로 덮어쓰기** 하세요.
폴더 구조가 동일하므로 ZIP을 프로젝트 폴더에 풀면 됩니다.

## 수정된 파일 목록 (14개 src + 3개 서버)

### src/ — 프론트엔드 (Electron + 웹 공용)

| 파일 | 변경 내용 |
|------|----------|
| `src/js/pipeline/step2-keywords.js` | 4열 키워드 그리드 (이슈링크+줌+네이트+구글), 접기 제거, 자동선택 삭제, IME 버그 수정, 색상 구분 |
| `src/js/pipeline/step3-4-videos.js` | 기간 필터 추가 (24시간~5년) |
| `src/js/pipeline/step6-script.js` | 편집/선택 모드 통합 (체크박스+편집 동시 가능) |
| `src/js/pipeline/step9-voice.js` | 커스텀 ElevenLabs Voice ID 입력란 |
| `src/js/pipeline/apikeys-form.js` | Gemini 모델 선택 (2.5 Pro 기본), 가이드 링크 수정 |
| `src/js/pipeline/apikeys-validation.js` | ElevenLabs 키 검증 형식 체크로 변경 |
| `src/js/utils.js` | 타임아웃 증가 (분석 10분, 대본 10분 등) |
| `src/js/constants.js` | SEARCH_FILTER_PERIOD 상태 키 추가 |
| `src/js/prompts.js` | 풋티지 장면 수 대본 길이 비례 (5~40+개) |
| `src/js/api.js` | 풋티지 대본 전달량 8000자로 증가 |
| `src/js/mock-data.js` | ElevenLabs 한국어 보이스 6개 (현빈,혁,빈,안나,셀리,루아) |
| `src/js/app.js` | 웹 모드 지원 추가 (Electron 동작에 영향 없음) |
| `src/client-proxy-llm.js` | 브라우저 직접 스트리밍, non-streaming 재시도, 모델 마이그레이션 |
| `src/client-proxy-media.js` | 한국어 콘텐츠 필터, ElevenLabs 음성 튜닝, 기간 파라미터, 402 에러 메시지 |

### supabase/functions/proxy/ — 서버 (Edge Function)

| 파일 | 변경 내용 |
|------|----------|
| `index.ts` | LLM/TTS/ElevenLabs 웹 라우트 활성화 |
| `utils.ts` | CORS 도메인 추가 |
| `realtime-keywords.ts` | 새 파일 — adsensefarm.kr 실시간 검색어 크롤링 |

## 적용 후 필요한 작업

1. **Electron 빌드 테스트**: `npm run dev:vite` + `npm run dev:electron`
2. **Supabase 재배포**: `supabase functions deploy proxy --no-verify-jwt`
3. **프로덕션 빌드**: `npm run build:win` 또는 `npm run build:mac`
