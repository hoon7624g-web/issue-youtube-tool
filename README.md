# 유튜브도사 영상 제작 솔루션

> 비개발자 사용자를 위해 데스크톱 앱으로 배포되는 유튜브 영상 제작 자동화 도구. 이슈 키워드 발굴부터 대본·팩트체크·풋티지·AI 음성·최종 패키지까지 **10단계 파이프라인**을 하나의 Electron 앱에서 처리합니다.

API 키는 사용자 각자가 로컬에 보관하며(OS 키체인 암호화), 앱은 그 키로 외부 AI/미디어 API를 직접 호출합니다. 인증·사용량 제한·로깅은 Supabase Edge Function이 담당합니다.

---

## 기술 스택

| 영역 | 사용 기술 |
|------|-----------|
| 런타임 | **Electron 33** (Node.js 메인 프로세스 + Chromium 렌더러) |
| 프론트엔드 | **Vanilla JS (ES Modules)**, **Vite 8** 번들 |
| 영상 렌더링 | **Remotion 4** (React 19), **FFmpeg** (`ffmpeg-static`) |
| 백엔드 | **Supabase** — Auth + Edge Functions 프록시 |
| 패키징 · 업데이트 | `electron-builder 25`, `electron-updater 6`, `electron-log` |
| 외부 API | YouTube Data API · Claude/Gemini/OpenAI(LLM) · Perplexity(팩트체크) · Google TTS·ElevenLabs(음성) · Pexels(풋티지) · Google AI Studio(영상 분석) · Google Trends |

---

## 10단계 파이프라인

| # | 단계 | 내용 |
|---|------|------|
| 1 | 이슈 키워드 발굴 | 이슈링크 실시간 이슈 + Google Trends + 커스텀 키워드 |
| 2 | 키워드 선정 | 후보 중 제작 주제 확정 |
| 3 | 영상 검색 | YouTube Data API로 롱폼/숏폼 레퍼런스 수집 (기간 필터) |
| 4 | 레퍼런스 선택 | 분석 대상 영상 확정 |
| 5 | 영상 분석 | Google AI Studio 영상 분석 + 자막 fallback |
| 6 | 대본 생성 | 롱폼·숏폼 AI 대본 (Claude/Gemini/GPT), 멀티셀렉트 에디터 |
| 7 | 팩트 검증 | AI + Perplexity 팩트체크(안전/주의/미확인), 문장 반영 |
| 8 | 풋티지 브리프 | 장면별 라벨/키워드 생성 + Pexels 검색 |
| 9 | AI 음성 합성 | Google TTS / ElevenLabs 순차 생성 |
| 10 | 결과 패키징 | 롱폼/숏폼 미리보기 + 대본·음성·풋티지 ZIP 다운로드 |

---

## 아키텍처 하이라이트

### Electron 보안
- **BrowserWindow 하드닝**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **preload contextBridge**: 최소한의 `electronAPI`만 렌더러에 노출
- **IPC 신뢰 경계**: `assertTrustedSender()` — `file://` 앱 디렉토리와 dev 서버 URL만 허용
- **CSP**: `script-src 'self'` + `connect-src` 도메인 allowlist, 외부 URL은 `isAllowedUrl()` 화이트리스트
- **XSS 방어**: `innerHTML` 제거, `esc()` + DOM API 기반 렌더링, 인라인 이벤트 핸들러 전면 제거
- **자식 창 하드닝**: 팝업/권한/네비게이션 deny (`hardenChildWindow()`)

### API 키 관리
- Electron **safeStorage**(OS 키체인: Windows DPAPI / macOS Keychain / Linux libsecret)로 암호화 저장
- safeStorage 불가 환경에서는 **fail-closed** — 평문 저장을 하지 않고 저장 불가를 안내
- 비밀 키는 **메인 프로세스 IPC 경유로만** 사용 → 렌더러 메모리·DOM에 평문 미노출

### Supabase Edge Function 프록시
- **인증**: Supabase Auth + 승인 상태(`approval_status`) 기반 접근 통제
- **Rate limiting**: 로그인/회원가입/토큰갱신 등 IP 기반 제한, 인증 엔드포인트별 시간당 제한
- **Usage logging**: 요청 사용량 기록, brute-force 감지 시 Slack 알림

### 자동 업데이트 & 배포 CI
- **electron-updater** 기반 자동 업데이트 (GitHub Releases 피드)
- **GitHub Actions**: 태그(`v*`) push 시 macOS DMG 빌드 + **Apple 코드사이닝·노터라이즈** (`.github/workflows/build-mac.yml`)

---

## 프로젝트 구조

```
main.js, main/            메인 프로세스 — IPC, 키/보안, LLM·TTS·자막·FFmpeg·Remotion 핸들러
preload.js                contextBridge 브릿지
src/                      렌더러 — 파이프라인 UI, client-proxy, 10개 스텝 모듈
remotion/                 Remotion 영상/썸네일 컴포지션 (React)
supabase/functions/proxy  Edge Function 프록시 — 인증 / rate limit / usage log
admin-web/, admin-shared  관리자 대시보드
api-key-guide/            API 키 발급 가이드
scripts/                  lint / smoke / unit / structure / check-version
build/                    앱 아이콘 등 빌드 리소스
docs/                     설계 · 핸드오프 · 보안 문서
```

---

## 개발 & 빌드

### 요구사항
- Node.js 20.19+ 또는 22.12+ (`.nvmrc` 참고)
- npm

> ⚠️ 이 앱은 **승인된 계정 + 운영 Supabase 백엔드**가 있어야 실제 파이프라인을 사용할 수 있습니다. 저장소를 clone·빌드하는 것만으로는 로그인/기능이 동작하지 않습니다(백엔드·관리자는 별도 배포). API 키는 사용자가 로컬에 직접 보관합니다.

### 개발 모드
```bash
npm install
npm run dev:vite       # Vite 개발 서버 (localhost:5173)
npm run dev:electron   # Electron 실행 (별도 터미널)
```

### 검증
```bash
npm run verify         # check-version + lint + test(smoke+unit) + build 일괄 실행
```

### 프로덕션 빌드
```bash
npm run build:win      # Windows NSIS 인스톨러
npm run build:mac      # macOS DMG/zip (arm64)
```

> 영상 렌더링(Remotion)을 로컬에서 사용하려면 `npm run remotion:install`로 `remotion/` 의존성을 먼저 설치하세요.

---

## 문서

- [보안 모델 & API 호출 경로](docs/SECURITY_MODEL.md)
- [코드 리뷰 가이드](docs/REVIEW.md)
- 릴리스 핸드오프 노트: `docs/HANDOFF_*.md`
