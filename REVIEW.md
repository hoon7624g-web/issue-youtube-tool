# 유튜브도사 영상 제작 솔루션 v3.5.0 — 코드 리뷰 가이드

## 제품 개요
체인저스캠퍼스 수강생(비개발자, 수백 명)이 사용하는 유튜브 영상 제작 보조 Electron 앱.
이슈 키워드 발굴 → 영상 분석 → 대본 생성 → 팩트 검증 → 풋티지 브리프 → AI 음성 → 결과 패키징의 10단계 파이프라인.

## 기술 스택
- Electron 33 + Vite 8 (rolldown) + Vanilla JS ES Modules
- API 키: 수강생 로컬 관리 (safeStorage OS 키체인 암호화)
- 외부 API: YouTube Data API, Claude/Gemini/ChatGPT, Google TTS, ElevenLabs, Pexels, Perplexity, Google AI Studio

## 파일 구조 및 역할

### 메인 프로세스 (Node.js)
| 파일 | LOC | 역할 |
|------|-----|------|
| `main.js` | ~640 | Electron main process. IPC 핸들러, safeStorage 암호화, 이슈링크 크롤링(Node.js https), 자막 추출(hidden window), Claude API 프록시(CORS 우회), Perplexity 내장 브라우저, 자동 업데이트 |
| `preload.js` | ~30 | contextBridge로 electronAPI 노출. 최소한의 IPC 브릿지만 포함 |

### 렌더러 프로세스 (브라우저)
| 파일 | LOC | 역할 |
|------|-----|------|
| `src/index.html` | ~130 | SPA 진입점. CSP 메타 태그 포함 |
| `src/client-proxy.js` | ~600 | 모든 외부 API 호출 래퍼. LLM 라우팅(Claude/Gemini/ChatGPT), Google TTS, ElevenLabs, Pexels, YouTube, Google Trends, Google AI Studio 영상 분석. API 키 관리(safeStorage IPC) |
| `src/js/state.js` | ~120 | 앱 전역 상태 관리 (window.S). sSet/sGet/sNext/sPrev |
| `src/js/api.js` | ~210 | 비즈니스 로직 API. analyze, genScriptDual, genFactCheck, genFootageBrief, genVoice 등 파이프라인 단계별 LLM 프롬프트 + 파싱 |
| `src/js/ui.js` | ~280 | 공통 UI 함수. renderVidList, filterDuration, syncSb(사이드바) |
| `src/js/utils.js` | ~280 | 유틸리티. esc(XSS), cleanAI(이모지/마크다운 제거), extractJSON, createProgress, safeUrl, toast |
| `src/js/app.js` | ~100 | 앱 초기화. 로그인 체크, API 키 로드, 이벤트 바인딩 |
| `src/js/mock-data.js` | ~40 | 오프라인/데모용 목업 데이터 |

### 파이프라인 단계별 모듈
| 파일 | 단계 | 역할 |
|------|------|------|
| `pipeline/step2-keywords.js` | Step 1-2 | 이슈링크 TOP 10 + Google Trends + 커스텀 키워드 |
| `pipeline/step3-4-videos.js` | Step 3-4 | 영상 리스트(롱폼/숏폼 필터) + 영상 선택 확인 |
| `pipeline/step5-analysis.js` | Step 5 | Google AI Studio 영상 분석 + 자막 fallback |
| `pipeline/step6-script.js` | Step 6 | 롱폼+숏폼 대본 생성 + 멀티셀렉트 + 에디터 |
| `pipeline/step7-factcheck.js` | Step 7 | AI 팩트체크(안전/주의/미확인) + 삭제→대본 반영 |
| `pipeline/step8-footage.js` | Step 8 | 풋티지 브리프(장면별 라벨/키워드) + Pexels 검색 |
| `pipeline/step9-voice.js` | Step 9 | 음성 설정 + Google TTS/ElevenLabs 순차 생성 |
| `pipeline/step10-result.js` | Step 10 | 결과 확인(탭 페이지네이션) + ZIP 패키징 |
| `pipeline/apikeys.js` | 설정 | API 키 입력 폼 + LLM/Gemini/Claude 모델 선택 |
| `pipeline/history.js` | 사이드바 | 프로젝트 히스토리 |

### 설정 / 빌드
| 파일 | 역할 |
|------|------|
| `package.json` | 의존성, electron-builder 설정, 스크립트 |
| `vite.config.js` | Vite 설정 (root: src, outDir: dist) |
| `scripts/lint.js` | ESM 호환 린트 스크립트 |

## 보안 구현 현황

### XSS 방어
- 인라인 이벤트 핸들러(onclick/onchange) 전면 제거 → addEventListener/이벤트 위임
- innerHTML 사용 시 `esc()` 함수로 외부 문자열 이스케이프
- CSP 메타 태그: `script-src 'self'`, `connect-src` 12개 도메인 allowlist

### IPC 신뢰 경계
- `assertTrustedSender()`: file:// 앱 디렉토리 + dev server URL만 허용
- `asString(v, maxLen)`: 입력 길이 검증

### API 키 보안
- safeStorage (OS 키체인: Windows DPAPI / macOS Keychain / Linux libsecret)
- ALLOWED_KEYS whitelist로 저장 가능한 키 이름 제한
- prototype pollution 방지

### 외부 URL 제한
- `isAllowedUrl()`: ALLOWED_HOSTS 화이트리스트
- `safeUrl()`: Pexels/Storyblocks host suffix 매칭

### BrowserWindow 하드닝
- main window: contextIsolation + sandbox + nodeIntegration:false
- Perplexity 창: `hardenChildWindow()` (popup deny + permission deny + will-navigate + will-redirect)
- hidden window(자막): sandbox + contextIsolation, popup deny만 적용

## v3.3.1에서 변경된 주요 사항

1. **리브랜딩**: "이슈 유튜브 제작툴" → "유튜브도사 영상 제작 솔루션" + 체인저스캠퍼스 C 로고
2. **이슈링크**: BrowserWindow → Node.js https 직접 요청 (SSL 핸드셰이크 문제 해결)
3. **preload.js**: jszip require 제거 (asar 패키징 호환)
4. **CSP**: media-src에 data: 추가 (TTS 미리듣기)
5. **TTS 청크**: 2000자 → 1500자 (한글 UTF-8 바이트 초과 방지)
6. **max_tokens**: Claude IPC 캡 8192→16384, 전 LLM 16384 통일
7. **cleanAI**: 이모지 유니코드 전체 제거 정규식 추가
8. **영상 필터**: 3개(롱/미디엄/숏) → 2개(롱폼 4분+/숏폼 4분-)
9. **Step 10**: 탭 페이지네이션 (롱폼/숏폼 분리)
10. **Gemini 모델 선택**: 3.1 Pro / 2.5 Pro 드롭다운
11. **Claude 모델 선택**: Sonnet 4 / Opus 4 드롭다운
12. **영상 분석 타임아웃**: 90초 → 180초
13. **extractJSON/parseResult**: 배열 summary 처리 + 마크다운 코드블록 제거 강화
14. **영상 리스트**: 영상 길이 표시 + 20분 이상 비추천 배지
15. **음성 생성**: 결과 페이지 제거 → 완료 시 바로 Step 10

## 리뷰 시 특히 확인해주셨으면 하는 부분

1. **보안**: CSP, IPC 신뢰 경계, safeStorage 구현이 Electron 보안 모범 사례에 부합하는지
2. **에러 핸들링**: API 호출 실패 시 fallback/재시도/사용자 안내가 적절한지
3. **상태 관리**: window.S 전역 상태 + sSet() 패턴의 문제점
4. **메모리 누수**: hidden window 파괴, setInterval 정리, blob URL revoke 등
5. **코드 품질**: var vs const/let, 모듈 간 의존성, 함수 크기/복잡도
6. **UX**: 비개발자 수강생 관점에서의 흐름 자연스러움
