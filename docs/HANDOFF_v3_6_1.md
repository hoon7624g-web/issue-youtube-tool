# HANDOFF v3.6.1 — 출시 전 안정화 패치

## 변경 요약

외부 코드 리뷰 2건에서 발견된 P1 3건 + P2 7건 + UX 개선 7건 일괄 수정.
기능 추가 없이 기존 코드의 안정성, 요청 제어, 문서 정합성을 개선하는 릴리스.

---

## P1 수정 (3건 — release blocker)

### P1-1. 기간 필터(filterPeriod) 미동작 수정

**파일**: `src/js/state.js`

**버그**: `NS_DEFAULTS.search`에 `filterPeriod`가 없어서 `sSet({ 'search.filterPeriod': '30d' })`가 production에서 console.warn만 찍고 무시됨. 13개짜리 드롭다운(24시간~5년)이 완전히 장식 상태.

**수정**: `NS_DEFAULTS.search`에 `filterPeriod: '7d'` 추가. 저장 상태 버전 `3.5→3.6` 갱신. `_saveLsNow()`에 `filterDuration`/`filterPeriod` 포함하여 세션 유지.

### P1-2. YouTube 검색 실패 시 mock 데이터로 계속 진행하는 문제

**파일**: `src/client-proxy-media.js`

**버그**: `getVids()` catch 블록이 `M.videos`(손흥민/비트코인 샘플)를 반환. `ui.js filterDuration()`에 에러 카드+재시도 UI가 있지만, mock이 정상 응답으로 반환되어 catch에 도달하지 않음.

**수정**: catch에서 `return M.videos` → `throw e` 전환. `filterDuration()`의 기존 에러 UI가 자동 활성화됨. toast 중복도 제거.

### P1-3. 수동 URL 분석 경로의 요청 제어 부재

**파일**: `src/js/pipeline/step3-4-videos.js`

**버그**: 수동 URL 입력 시 timeout/abort/single-flight 없음. 중복 클릭→경합→잘못된 영상 선택 가능.

**수정**: `_manualRunId` + `AbortController` + 15초 timeout + `_manualTimedOut` 플래그. 입력 필드/버튼 비활성화. oEmbed fetch에 signal 전달.

---

## P2 수정 (7건)

### P2-1. YouTube 검색 병렬화

**파일**: `src/client-proxy-media.js`

search → videos → channels 순차 3회 → search → [videos, channels] `Promise.all` 병렬 2회. channelId를 search 결과에서 추출하여 의존성 해소.

### P2-2. SECURITY_MODEL 문서 불일치

**파일**: `docs/SECURITY_MODEL.md`

"Electron safeStorage 불가 시 localStorage fallback" → 실제 코드는 fail-closed (저장 차단). 문서를 코드에 맞춤. 버전 v3.6.0 반영.

### P2-3. downloadFile 리다이렉트 호스트 검증

**파일**: `main/ipc-ffmpeg.js`, `main/ipc-remotion.js`

리다이렉트 URL에 HTTPS 프로토콜 검증 추가. timeout 하한 5초 보장 (`Math.max(timeout - 2000, 5000)`).

### P2-4. Remotion backgroundUrl 검증

**파일**: `main/ipc-remotion.js`

`isSafeBackgroundUrl()` 함수 추가 (Pexels + YouTube 썸네일 호스트 허용). 3곳의 `downloadFile(backgroundUrl, ...)` 호출에 검증 적용.

### P2-5. httpsStream AbortSignal 지원

**파일**: `main/http-helpers.js`

`httpsStream()` 8번째 파라미터로 `signal` 추가. `_attachAbort`로 req에 연결. httpsPost/httpsGet과 인터페이스 통일. 기존 호출부(ipc-llm.js)는 변경 불필요 (8번째 인자 미전달 시 기존 동작 유지).

### P2-6. factCheck/extractKw mock fallback 제거

**파일**: `src/js/api.js`

`callLLMWithJsonRetry` fallback을 `M.fcs.slice()`/`M.ekw.slice()` → `null`로 전환. null 반환 시 throw하여 호출부(step7/step8)의 기존 에러 UI 활성화. Perplexity 파싱 실패 시 LLM fallback으로 재시도하도록 흐름 개선 (기존: mock 직행).

### P2-7. YouTube/Pexels IPC abort

**파일**: `main/ipc-youtube.js`, `main/ipc-pexels.js`

YouTube search 요청에 `_activeYtAC` AbortController — 재검색 시 이전 요청 자동 취소. videos/channels는 병렬 호출이므로 취소 대상 제외. Pexels는 키워드별 개별 호출이라 auto-cancel 부적합 → 기존 15초 timeout 유지.

---

## UX 개선 (7건)

### UX-1. 필터 상태 세션 유지

**파일**: `src/js/state.js`

`_saveLsNow()`에 `filterDuration` + `filterPeriod` 포함. 새로고침 후에도 필터 설정 유지.

### UX-2. no-key 데모 모드 `_isDemo` 플래그

**파일**: `src/js/api.js`, `src/client-proxy-media.js`

API 키 미설정 시 반환되는 모든 mock 데이터에 `_isDemo: true` 플래그 추가. UI에서 데모 배지 표시에 활용 가능.

### UX-3. getVids 에러 toast 중복 제거

**파일**: `src/client-proxy-media.js`

`getVids` catch에서 toast 제거 — `filterDuration()` catch의 에러 카드+재시도 버튼만으로 충분.

### UX-4. 숏폼 파싱 실패 toast 문구 수정

**파일**: `src/js/api.js`

"기본 결과로 보정했습니다" → "숏폼 대본 생성에 실패했습니다. 롱폼 대본은 정상 생성됩니다." (실제 결과가 빈 배열이므로 "보정" 표현 부적절)

### UX-5. 수동 URL 로딩 시각 피드백 강화

**파일**: `src/js/pipeline/step3-4-videos.js`

조회 중 입력 필드 비활성화 + opacity 감소. 버튼 텍스트 "⏳ 조회 중..." 완료 후 자동 복원.

### UX-6. IssueLink 파서 내성 강화

**파일**: `main.js`

meta tag (`<meta name="keyword" content="...">`) + `data-keyword` 속성 패턴 추가. meta content 쉼표 분할 지원. stopWords에 `undefined`/`null` 추가.

### UX-7. HANDOFF 문서 작성

**파일**: `docs/HANDOFF_v3_6_1.md` (본 문서)

---

## 변경 파일 목록 (12개)

| 파일 | 변경 내용 |
|------|----------|
| `src/js/state.js` | filterPeriod 추가 + 버전 3.6 + 필터 저장 |
| `src/client-proxy-media.js` | mock→throw + 병렬화 + _isDemo + toast 정리 |
| `src/js/pipeline/step3-4-videos.js` | abort/runId/timeout + 입력 비활성화 |
| `src/js/api.js` | mock fallback→null + _isDemo + toast 문구 |
| `main/http-helpers.js` | httpsStream signal 지원 |
| `main/ipc-youtube.js` | search abort |
| `main/ipc-pexels.js` | 변경 없음 (abort auto-cancel 부적합 → 원복) |
| `main/ipc-ffmpeg.js` | redirect HTTPS 검증 |
| `main/ipc-remotion.js` | redirect 검증 + backgroundUrl 검증 |
| `main.js` | IssueLink meta/data-keyword 패턴 |
| `docs/SECURITY_MODEL.md` | fail-closed 반영 |
| `docs/HANDOFF_v3_6_1.md` | 본 문서 |

## 배포 시 주의사항

1. **Edge Function 재배포 불필요**: 서버 코드 변경 없음
2. **Electron 빌드 필요**: src/ + main/ 변경이 있으므로 Vite 빌드 + Electron 패키징 필요
3. **기존 사용자 영향**: 저장 상태 버전 3.5→3.6 변경. `loadProgress()`는 `startsWith('3.')`으로 체크하므로 기존 3.5 데이터도 정상 복원됨
4. **preload.js 변경 없음**: IPC 채널 추가/변경 없음
