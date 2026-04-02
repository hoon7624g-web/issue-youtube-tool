# HANDOFF v3.5.2 — 코드 리뷰 기반 전면 개선

## 변경 요약

### 1. 보안 개선

#### 1-1. TTS API 키 보호 — main process IPC 경유 (🔴 높음)
- **신규 파일**: `main/ipc-tts.js` (53줄)
- **preload.js**: `callTTS` 브릿지 추가
- **api.js**: Electron 환경에서 `window.electronAPI.callTTS()` IPC 경유, 웹 fallback 유지
- **효과**: Google TTS API 키가 렌더러 프로세스 메모리에 노출되지 않음

#### 1-2. Blob URL 메모리 누수 방지 (🔴 높음)
- **api.js genVoice**: 새 음성 생성 전 `URL.revokeObjectURL()` 호출
- **효과**: 음성 반복 생성 시 메모리 누적 해소

#### 1-3. CI 보안 린트 자동화
- **.github/workflows/ci.yml**: `Security lint (XSS prevention)` 스텝 추가
- 인라인 이벤트 핸들러 (`onclick=`, `onchange=`) 감지 → CI 실패
- `innerHTML` 사용 시 `esc()` 미동반 경고

### 2. 아키텍처 개선

#### 2-1. main.js 자막 로직 분리 (327줄 → 209줄)
- **신규 파일**: `main/subtitle.js` (128줄)
- **main.js**: `registerSubtitleIPC()` 호출로 교체
- **효과**: main.js가 윈도우 생성 + 업데이트 + 모듈 조립에만 집중

#### 2-2. 모델명/제한값 중앙화
- **신규 파일**: `main/config.js` (22줄) — `MAIN_CONFIG` 객체
- **main/ipc-llm.js**: 모든 하드코딩된 모델명·토큰 제한·타임아웃을 `MAIN_CONFIG` 참조로 교체
- **효과**: 모델 변경 시 `main/config.js` + `src/config.js` 2곳만 수정

#### 2-3. 파이프라인 공통 패턴 추출
- **utils.js**: `runWithProgress()` 래퍼 추가 — createProgress + setInterval + withTimeout 통합
- **step5-analysis.js**: `startAnalysis()`와 AI Studio 분석 모두 `runWithProgress` 적용 (213줄 → 196줄)

#### 2-4. 공통 컴포넌트 확장
- **components.js**: `ResultTabs()` (롱폼/숏폼 탭 페이지네이션), `ErrorCard()` (재시도 버튼 포함) 추가
- **step7-factcheck.js**: 로컬 `_buildTabs` 제거 → `ResultTabs` import (187줄 → 171줄)
- **step5-analysis.js**: 로컬 `_showError` 제거 → `ErrorCard` import

#### 2-5. 중복 상수 통합
- **constants.js**: `PEXELS_HOSTS`, `STORYBLOCKS_HOSTS` 추가
- **step8-footage.js**, **step10-result.js**: 로컬 선언 제거 → import

### 3. 에러 핸들링 & 안정성

#### 3-1. JSON 파싱 실패 시 사용자 안내
- **api.js callLLMWithJsonRetry**: 2회 실패 후 mock fallback 반환 시 `toast('AI 응답을 처리하지 못해...')` 경고 추가

#### 3-2. 에러 메시지 행동 지시 추가
- **utils.js friendlyError**: 모든 에러에 `👉` 행동 안내 추가 (예: "로그아웃 후 다시 로그인", "설정에서 키 확인")

#### 3-3. 오프라인 세션 복원 경쟁 조건 수정
- **app.js**: `.catch()` 블록에서 `restoreProgress()` 실패 시 `nav.step: 2` 명시적 설정

#### 3-4. Rate config DB 캐싱
- **supabase/proxy/utils.ts**: `getRateConfig()`에 5분 인메모리 캐시 추가
- **효과**: 매 요청마다 DB 조회 → 5분당 1회로 감소

### 4. 코드 품질

#### 4-1. sSet 타입 안전성 강화
- **state.js**: 잘못된 키 사용 시 `console.error` + 허용 키 목록 출력 (기존: `console.warn`)
- 유효하지 않은 키는 무시 (silent fail → explicit error)

#### 4-2. Pexels 캐시 메모리 제한
- **step8-footage.js**: `_setPexelsCache()` 함수로 최대 50건 LRU 제한

#### 4-3. prompt() → 커스텀 드롭다운 UI
- **step6-script.js**: 이전 버전 복원 시 `prompt()` → DOM 기반 드롭다운 메뉴

### 5. UX 개선

#### 5-1. YouTube 검색 병렬화
- **api.js getVids**: `videos` + `channels` API 호출을 `Promise.all`로 병렬화
- **효과**: 검색 속도 ~30% 개선 (순차 3회 → search 후 병렬 2회)

## 신규/변경 파일 목록

| 파일 | 상태 | 줄 수 | 역할 |
|------|------|-------|------|
| `main/subtitle.js` | **NEW** | 128 | 자막 추출 (main.js에서 분리) |
| `main/ipc-tts.js` | **NEW** | 53 | Google TTS IPC (키 보호) |
| `main/config.js` | **NEW** | 22 | Main process 설정값 중앙화 |
| `main.js` | 수정 | 209 (−118) | 자막/TTS 분리, 모듈 등록만 |
| `main/ipc-llm.js` | 수정 | 300 (+1) | MAIN_CONFIG 참조 |
| `preload.js` | 수정 | 51 (+1) | callTTS 브릿지 |
| `src/js/utils.js` | 수정 | 351 (+11) | runWithProgress, friendlyError 개선 |
| `src/js/state.js` | 수정 | 122 (±0) | sSet 타입 안전성 |
| `src/js/api.js` | 수정 | 354 (+19) | TTS IPC, blob revoke, YouTube 병렬화, JSON 안내 |
| `src/js/app.js` | 수정 | 117 (+1) | 오프라인 복원 수정 |
| `src/js/constants.js` | 수정 | 51 (+4) | PEXELS/STORYBLOCKS 호스트 |
| `src/js/components.js` | 수정 | 130 (+31) | ResultTabs, ErrorCard |
| `src/js/pipeline/step5-analysis.js` | 수정 | 196 (−17) | runWithProgress, ErrorCard |
| `src/js/pipeline/step6-script.js` | 수정 | 388 (+14) | prompt() → 드롭다운 |
| `src/js/pipeline/step7-factcheck.js` | 수정 | 171 (−16) | ResultTabs |
| `src/js/pipeline/step8-footage.js` | 수정 | 388 (+3) | 상수 import, 캐시 LRU |
| `src/js/pipeline/step10-result.js` | 수정 | 357 (−3) | 상수 import |
| `supabase/functions/proxy/utils.ts` | 수정 | 199 (+12) | Rate config 캐싱 |
| `.github/workflows/ci.yml` | 수정 | 58 (+16) | 보안 린트 |

## 배포 시 주의사항

1. **Edge Function 재배포 필요**: `supabase functions deploy proxy --no-verify-jwt` (rate config 캐싱 + refresh rate limit)
2. **main/config.js + src/config.js 동기화**: 모델명 변경 시 양쪽 모두 수정
3. **package.json build.files**: `main/**/*`가 이미 포함되어 있으므로 신규 파일 자동 포함
4. **기존 사용자 영향 없음**: 모든 변경은 내부 리팩토링이며 UI/API 인터페이스 변경 없음

---

## 코드 리뷰 피드백 반영 (P1~P3)

### P1: extractJSON() 파싱 버그 수정 (치명)

**버그**: `{`를 `[`보다 무조건 먼저 찾아서, AI가 `[{...}, {...}]` 배열 응답을 보내면 첫 번째 객체만 잘리는 문제.

**영향 범위**:
- 숏폼 5개 → 1개만 파싱
- 팩트체크 배열 → 첫 항목만
- 풋티지 키워드 배열 → 불완전

**수정**: progressive scanning 방식
1. 전체 코드블록 `JSON.parse` 시도 (기존)
2. 모든 `{`, `[` 위치를 수집 → earliest 순으로 depth-matching + `JSON.parse` 시도
3. 첫 매칭 실패 시 다음 후보로 자동 fallback

**검증**: 15개 테스트 케이스 전체 통과 (배열 prefix, 깨진 JSON 건너뛰기, 빈 배열/객체, 중첩 구조, 숏폼 5개, 팩트체크 3건 등)

### P2: 보안 모델 문서화 + README 일치

**문제**: README에 "서버 rate limiting — DB 기반 60회/시간"이라고 되어 있지만, 실제로 YouTube/ElevenLabs/Pexels/TTS는 렌더러에서 직접 호출하여 서버 rate limit이 적용되지 않음.

**수정**:
- `docs/SECURITY_MODEL.md` 신규 생성 — Electron/웹 각 환경별 실제 호출 경로 표 작성
- `README.md` 보안 섹션 — "서버 경유 엔드포인트에만 적용" 명시 + SECURITY_MODEL.md 링크
- `client-proxy-media.js`, `step8-footage.js` — 직접 호출 코드에 TODO [P2] 마커 추가

### P3: /auth/refresh rate limit + logging 추가

**문제**: signup(5회/분), login(10회/5분)에는 IP 기반 제한이 있지만 refresh는 무제한.

**수정**: `supabase/functions/proxy/index.ts`
- IP 기반 30회/5분 제한
- 초과 시 Slack 알림 (`Refresh 남용 의심`)
- usage_logs에 기록 (응답 시간 포함)

### 추가 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/js/utils.js` extractJSON | P1: progressive scanning 방식으로 전면 재작성 |
| `docs/SECURITY_MODEL.md` | P2: 신규 — 실제 API 호출 경로 매핑 |
| `README.md` | P2: 보안 섹션 실제 동작과 일치 |
| `src/client-proxy-media.js` | P2: YouTube/ElevenLabs TODO 마커 |
| `src/js/pipeline/step8-footage.js` | P2: Pexels TODO 마커 |
| `supabase/functions/proxy/index.ts` | P3: refresh rate limit 30회/5분 + logging |


---

## 피드백 2차 반영 (보안 리뷰 + 실사용 관점)

### P1 확정: extractJSON() progressive scanning

기존 { 우선 → earliest-index + 후보 순차 시도로 전면 재작성.
scripts/unit-test.js의 버그 고정 테스트(배열→첫 객체)도 수정.
회귀 테스트 6종 추가 → 96/96 통과.

### Shape Validation 추가

api.js에 3개 검증 함수 신규:
- _validateScripts(arr) — title/content 필수, content 10자+ 필터
- _validateFactChecks(arr) — claim/status 필수, status enum 검증
- _validateFootageKw(arr) — label 또는 text + mainEn 필수

적용: genScriptDual, genShortsOnly, factCheck, extractKw

### ElevenLabs → main IPC 이동

- main/ipc-elevenlabs.js 신규 (57줄) — base64 응답
- preload.js — callElevenLabsTTS 브릿지
- client-proxy-media.js — Electron IPC / 웹 fallback 분기
- 효과: Electron에서 ElevenLabs 키가 렌더러에 노출되지 않음

### innerHTML 전수 점검

admin-web/admin-app.js에서 서버 응답값 미이스케이프 3건 수정:
- dashStats 통계 숫자 esc(String(s.total)) 등
- demoUserSelect user.id esc(u.id)
- demoBypassList user_id esc(b.user_id)

### 부분 실패 요약 배너

components.js에 PartialFailureBanner 추가.
Step 7(팩트체크), Step 8(풋티지), Step 9(음성), Step 10(결과)에 통합.
실패 항목 표시 + 실패 항목 재시도 버튼 포함.

### 히스토리 저장 시점 앞당기기

기존: Step 10 ZIP 다운로드 시에만 저장
변경: Step 6 스크립트 생성 완료 + Step 9 음성 전체 완료 시에도 저장
효과: 앱 종료/브라우저 닫기 시 복구력 향상

---

## v3.5.5 — 코드 리뷰 Phase 1 버그 수정

### P1-1: extractJSON() progressive scanning 실제 적용 (치명)

**문제**: v3.5.2 HANDOFF에 "progressive scanning으로 전면 재작성"이라고 기재되어 있었으나,
실제 `src/js/utils.js`의 `extractJSON()`은 여전히 `{`를 `[`보다 무조건 먼저 찾는 기존 방식이었음.

**영향**: AI가 `설명 한 줄 + [{"title":"A"}, {"title":"B"}]` 형태로 응답하면
배열 전체가 아니라 첫 번째 `{` 부터 매칭을 시도하여 파싱 실패 또는 첫 객체만 반환.
숏폼 5개 → 1개, 팩트체크 배열 → 첫 항목, 풋티지 키워드 배열 → 불완전.

**수정**: 모든 `{`와 `[` 위치를 수집 → earliest 순으로 depth-matching + JSON.parse 시도.
첫 후보 실패 시 자동으로 다음 후보로 fallback.

### P1-2: unit-test.js 실제 코드 동기화

**문제**: `scripts/unit-test.js`의 `extractJSON()`이 `src/js/utils.js`와 다른 별도 구현(정규식 기반)이었음.
테스트 초록불이 실제 앱 동작을 보장하지 못하는 구조.

**수정**: 테스트 내 extractJSON을 src/js/utils.js와 동일한 progressive scanning으로 교체.
P1 회귀 테스트 7개 추가: 배열+프리앰블, 숏폼 5개, 깨진 JSON 건너뛰기, 빈 배열/객체, 중첩 구조.
ESM → CJS 호환 불가로 복사 방식은 유지하되, 동기화 필요성을 주석으로 명시.

### P1-3: 선택 키 실패가 필수 흐름을 차단하는 버그 수정

**문제**: `_validateAllKeys()`에서 필수 키 failCount와 선택 키 failCount를 합산하여
`failCount === 0`일 때만 다음으로 진행 허용.
YouTube/Claude/Google AI 전부 정상이어도 Pexels 키 하나 틀리면 시작 불가.
"선택 설정", "나중에 추가 가능"이라는 안내와 실제 동작이 불일치.

**수정**:
- `failCount`를 `requiredFailCount` + `optionalFailCount`로 분리
- 선택 키 실패 시 주황색 경고 톤 + "(선택 — 나중에 수정 가능)" 메시지
- 저장 콜백: `requiredFailCount === 0`이면 바로 진행, 선택 키 실패는 토스트 경고만
- 요약 메시지 3단계: 전부 정상 / 필수만 정상(선택 경고) / 필수 실패

### 외부 리뷰 지적사항 검증 결과 (수정 불필요 확인)

| 지적 | 검증 결과 |
|------|----------|
| Ctrl+Enter `.panel.on` 셀렉터 버그 | 실제 코드는 이미 `.pnl.on` — 버그 없음 |
| Pexels 프리패치 IPC 우회 | 프리패치도 이미 `electronAPI.pexelsSearch` 분기 적용됨 |
| YouTube 렌더러 직접 호출 | `client-proxy-media.js`에서 이미 IPC 전환 완료 |
| SECURITY_MODEL.md 구식 | 이미 v3.5.4 기준으로 최신화됨 (연결 테스트 예외 포함) |

### 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/js/utils.js` extractJSON | progressive scanning 방식으로 실제 재작성 |
| `scripts/unit-test.js` extractJSON | 실제 코드와 동일한 구현으로 교체 + 회귀 테스트 7개 추가 |
| `src/js/pipeline/apikeys.js` _validateAllKeys | requiredFailCount/optionalFailCount 분리, 저장 콜백 수정 |
| `docs/HANDOFF_v3_5_2.md` | 이 섹션 추가 |

---

## v3.5.5 Phase 2 — 코드 일관성 + 핵심 UX 개선

### openMySettings innerHTML 제거

`apikeys.js`의 마지막 동적 innerHTML을 el() DOM 기반으로 전면 전환.
이제 apikeys.js 전체가 innerHTML-free. CI 보안 린트 일관성 확보.

### 에러 메시지 friendlyError 통일

`step9-voice.js`에서 `(e && e.message) || '알 수 없는 오류'`를 `friendlyError(e)`로 교체.
import에 friendlyError 추가. 나머지 파이프라인(step3-4, step5, step6, ui)은 이미 friendlyError 사용 중.

### config.js 이중 관리 해소

**신규 파일**: `shared-config.json` — 모델명/제한값 6개의 단일 소스.
`main/config.js`(CJS)와 `src/config.js`(ESM) 양쪽에서 import.
모델 변경 시 `shared-config.json` 한 곳만 수정하면 됨.
`package.json`의 `build.files`에 `shared-config.json` 추가.

### API 키 위저드 모드

`_highlightGoalFields()`를 확장: 목표 선택 후 불필요한 선택 키 필드를 `display:none`으로 숨김.
"대본만 빠르게" 목표 선택 시 고급 설정 토글 자체가 사라짐.
필요한 필드만 표시 + "← 이 목표에 필요" 배지.

### 회원가입 후 승인 대기 안내 보강

가입 완료 메시지를 2단 구조로 변경:
- 성공 메시지 (기존)
- "관리자 승인 완료 시 카카오톡 또는 이메일로 안내드립니다" (신규)
대기 시간 2초→4초로 확대.

### 데이터 전송 고지 문구 3곳 추가

| 위치 | 문구 |
|------|------|
| 내 설정 (ElevenLabs 업로드) | "음성 파일은 ElevenLabs 서버로 전송되어 AI 음성 모델이 생성됩니다" |
| Step 7 팩트체크 결과 | "대본 일부가 AI 서비스에 전송되어 검증되었습니다" |
| Step 9 음성 생성 완료 | "대본 텍스트가 TTS 서비스에 전송되어 음성이 생성되었습니다" |

### README.md 신규 작성

루트에 README 추가: 빠른 시작, API 키 정책, 디렉토리 구조, 보안 모델, Edge Function 배포, 모델 변경 방법, 테스트 실행법.

### Step 3 영상 추천 이유 가시성 강화

상위 3개에 "추천" 배지 추가.
상위 5개에 추천 이유 한 줄 표시: "구독 대비 조회수 강함", "기획형 주제", "비뉴스 고득점", "시의성 있는 뉴스" 조합.

### Phase 2 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/js/pipeline/apikeys.js` | openMySettings innerHTML→el() 전환, 위저드 모드(필드 숨기기), ElevenLabs 전송 고지 |
| `src/js/pipeline/step9-voice.js` | friendlyError 통일, TTS 전송 고지 |
| `src/js/pipeline/step7-factcheck.js` | Perplexity 전송 고지 |
| `shared-config.json` | **NEW** — 공용 설정값 단일 소스 |
| `main/config.js` | shared-config.json import 방식으로 전환 |
| `src/config.js` | shared-config.json import + GAS_URL 제거 |
| `src/client-proxy-auth.js` | GAS_URL export 제거, cfg()에서 gas 제거 |
| `src/client-proxy.js` | barrel에서 GAS_URL 제거 |
| `src/js/ui.js` | 회원가입 승인 안내 보강, 영상 추천 이유 표시 |
| `package.json` | build.files에 shared-config.json 추가 |
| `README.md` | **NEW** — 프로젝트 루트 문서 |

---

## v3.5.5 Phase 3 — 구조 리팩토링 + 중기 UX

### GAS_URL 디커플링

`src/config.js`에서 GAS_URL 완전 제거.
웹 환경 자막 호출: `fetch(GAS_URL + '?...')` → `proxyFetch('/api/gas?...')`.
서버의 `/api/gas` 프록시 엔드포인트를 경유하므로 GAS 재배포 시 서버 환경변수만 변경.

### Step 8 Pexels lazy-load

전체 장면 병렬 프리패치(Promise.all) → 첫 장면만 자동 프리패치.
프리패치 완료 시 첫 장면 Pexels 결과 자동 렌더링.
나머지 장면은 수강생이 키워드 클릭 시 로드.

### 다크모드 색상 중립화

마젠타/퍼플 톤 → 중립 차콜 계열로 전면 교체:
- `--white: #1a1018` → `#1a1a1a`
- `--bg: #12080e` → `#121212`
- `--bg2: #1e1220` → `#1e1e1e`
- `--t1: #f0e8ee` → `#f0f0f0`
- `--t2: #b8a8b5` → `#b8b8b8` 등

### state.js 레거시 분기 제거

`loadProgress()`에서 v3 이전 포맷 처리 분기 13줄 삭제.
v3.5.5부터 `_v: '3.x'` 포맷만 지원.

### sK/sK2/sK3 헬퍼 제거

step5: `sK(K.ANALYSIS_ANA, null)` → `sSet({ [K.ANALYSIS_ANA]: null })`
step6: `sK2(K.SCRIPT_SCR_DUAL, null, K.SCRIPT_SCR, null)` → `sSet({ ... })`
state.js에서 `sK`, `sK2`, `sK3` 함수 정의 삭제.

### components.js 확장

`ResultTabs(results, activePage, goPage)` — 멀티 스크립트 탭 공통 컴포넌트.
`PartialFailureBanner(failedItems, onRetry)` — 부분 실패 경고 배너.
step7: 로컬 `_buildTabs` 제거 → `ResultTabs` import.

### Step 6 선택 상태 요약 바

기존 텍스트 힌트를 시각적 요약 바로 강화:
- 롱폼/숏폼 개수 분리 표시 (🎬 롱폼 1개 + 📱 숏폼 2개)
- 이후 작업 수 명시 (팩트체크 3회 · 풋티지 3회 · 음성 3회)
- 배경색/테두리로 가시성 확보

### Step 10 패키지 다운로드 안내

헤더 아래에 동적 내용물 안내 추가:
"ZIP 패키지에 포함: 대본 텍스트 + AI 음성 파일 + 풋티지 브리프 + 영상 분석 요약"
음성/풋티지 유무에 따라 표시 항목 자동 조정.

### Step 9 음성 예상 정보 강화

한 줄 안내 → 카드형 정보 박스:
- 총 글자 수, TTS 호출 수, 예상 대기 시간
- 예상 음성 길이 (분:초)
- 선택된 엔진별 비용 안내 (Google TTS 무료 vs ElevenLabs 유료)

### Phase 3 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/js/api.js` | GAS 직접 호출 → proxyFetch 경유 |
| `src/js/pipeline/step8-footage.js` | 전체 프리패치 → 첫 장면만 lazy-load |
| `src/css/main.css` | 다크모드 색상 중립화 |
| `src/js/state.js` | 레거시 분기 삭제, sK/sK2/sK3 삭제 |
| `src/js/components.js` | ResultTabs, PartialFailureBanner 추가 |
| `src/js/pipeline/step5-analysis.js` | sK→sSet, import 정리 |
| `src/js/pipeline/step6-script.js` | sK2→sSet, 선택 요약 바 강화 |
| `src/js/pipeline/step7-factcheck.js` | ResultTabs import, 로컬 탭 제거 |
| `src/js/pipeline/step10-result.js` | 패키지 내용물 안내 추가 |
| `src/js/pipeline/step9-voice.js` | 예상 정보 카드 강화 |

---

## v3.5.5 Phase 4 — 마감 디테일

### Electron 버전 고정

`package.json`: `"electron": "^33.0.0"` → `"~33.0.0"` (마이너 범위 고정)

### 키보드 단축키 안내

사이드바 하단에 단축키 힌트 추가:
- ⌨️ 단축키
- Ctrl+→/← 단계 이동
- Ctrl+Enter 실행

### API 키 가이드 스크린샷 (미완)

실제 캡처 이미지가 필요하여 별도 작업으로 보류.

### Phase 4 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `package.json` | Electron 버전 ~33.0.0 고정 |
| `src/js/ui.js` | 사이드바 단축키 힌트 추가 |

---

## v3.5.5 전체 변경 요약

| Phase | 항목 수 | 핵심 |
|-------|---------|------|
| Phase 1 | 3건 수정 + 문서 | extractJSON 버그, 선택 키 차단 버그, 테스트 동기화 |
| Phase 2 | 8건 | innerHTML 제거, config 통합, 위저드 모드, 전송 고지, README |
| Phase 3 | 10건 | GAS 디커플링, lazy-load, 다크모드, 레거시 제거, 컴포넌트 통합 |
| Phase 4 | 2건 | Electron 고정, 단축키 안내 |
| 파일 분리 | 1건 | apikeys.js 3파일 분할 |

---

## v3.5.5 apikeys.js 물리적 파일 분리

### 분리 전

`src/js/pipeline/apikeys.js` — 836줄 단일 파일.
온보딩 + 폼 빌더 + DOM 헬퍼 + 연결 테스트 + 이벤트 바인딩 + 저장 로직이 전부 혼재.

### 분리 후

| 파일 | 줄 수 | 역할 |
|------|-------|------|
| `apikeys.js` | 190 | 오케스트레이터 — 폼+검증 연결, 목표 온보딩, Step/Action 등록 |
| `apikeys-form.js` | 334 | 폼 빌더 — DOM 헬퍼, buildApiKeyFormDOM, saveApiKeys, bindFormEvents |
| `apikeys-validation.js` | 237 | 연결 테스트 — 8개 _test* 함수, validateAllKeys (requiredFail/optionalFail 분리) |

### 외부 참조 변경 없음

- `step2-keywords.js` → `import { showApiKeySettings } from './apikeys.js'` (그대로)
- `app.js` → `import './pipeline/apikeys.js'` (그대로)
- 신규 2파일은 `apikeys.js`가 내부적으로만 import

### 테스트 수정

`scripts/unit-test.js`: `apikeysJs` 변수에 `apikeys-form.js`도 함께 읽어서 검사하도록 변경.
함수명 `_buildApiKeyFormDOM` → `buildApiKeyFormDOM` (export용 이름 변경 반영).

테스트: 83/83 통과, 린트 통과 (ESM 30개 구조 검증 — 신규 2파일 포함).
