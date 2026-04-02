# 보안 모델 & API 호출 경로 (v3.5.5)

## 개요

이 앱은 **개인 키를 개인 클라이언트에서 직접 사용하는 모델**입니다.
서버(Supabase Edge Function)는 인증, rate limiting, usage logging을 담당하지만,
**모든 외부 API 호출이 서버를 경유하지는 않습니다.**

**운영 권장 환경: Electron 데스크톱 앱**
- 웹 환경에서는 모든 키가 브라우저에 노출되므로 운영 배포에 권장하지 않습니다.
- Electron 환경에서는 모든 API 키가 Main Process IPC를 통해 보호됩니다.

이 문서는 각 API 호출이 실제로 어떤 경로를 타는지 정확히 기록합니다.

---

## Electron 환경 호출 경로

| API | 호출 경로 | 키 보호 | 구현 위치 |
|-----|----------|---------|----------|
| Claude/Gemini/OpenAI (LLM) | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-llm.js |
| Claude/Gemini 스트리밍 | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-llm.js (SSE → IPC 이벤트) |
| Perplexity | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-llm.js |
| Gemini Video | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-llm.js |
| Google TTS | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-tts.js |
| ElevenLabs TTS | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-elevenlabs.js |
| ElevenLabs 보이스 업로드 | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-elevenlabs.js (v3.5.7~) |
| YouTube Data API | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-youtube.js (v3.5.1~) |
| Pexels | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-pexels.js (v3.5.1~, 프리패치 포함 v3.5.4~) |
| 이슈링크 | ✅ Main IPC | N/A (키 없음) | main.js get-issuelink |
| 자막 추출 | ✅ Main IPC | N/A | subtitle.js (hidden window) |
| API 키 연결 테스트 | ✅ Main IPC | ✅ 렌더러 미노출 | ipc-keytest.js (v3.5.5~) |

> **v3.5.5 기준으로 Electron 환경의 모든 API 호출이 Main IPC를 경유합니다.**
> API 키 연결 테스트도 v3.5.5에서 IPC로 전환되어, 렌더러에 키가 노출되는 예외 경로가 없습니다.

## 웹 환경 (Electron 없음) 호출 경로

| API | 호출 경로 | 키 보호 | 서버 Rate Limit |
|-----|----------|---------|----------------|
| LLM (모든 provider) | ⚠️ 렌더러 직접 | ❌ 키 노출 | ❌ 미적용 |
| YouTube Data API | ⚠️ 렌더러 직접 | ❌ 키 노출 | ❌ 미적용 |
| ElevenLabs | ⚠️ 렌더러 직접 | ❌ 키 노출 | ❌ 미적용 |
| Google TTS | ⚠️ 렌더러 직접 | ❌ 키 노출 | ❌ 미적용 |
| Pexels | ⚠️ 렌더러 직접 | ❌ 키 노출 | ❌ 미적용 |

> 웹 환경에서는 `window.electronAPI`가 없으므로 모든 호출이 렌더러 직접 fetch입니다.
> 이 환경은 개발/테스트 전용으로 간주하며, 운영 배포에는 Electron을 권장합니다.

## 서버 프록시가 적용되는 경로

현재 서버 rate limit / usage log가 **실제로 적용되는** 엔드포인트:

| 서버 엔드포인트 | 적용 대상 | Rate Limit |
|---------------|----------|-----------|
| `/auth/signup` | 회원가입 | IP 기반 5회/분 |
| `/auth/login` | 로그인 | IP 기반 10회/5분 + Brute force Slack 알림 |
| `/auth/refresh` | 토큰 갱신 | IP 기반 30회/5분 |
| `/api/me` | 세션 검증 | 인증 필수 |
| `/api/trends` | Google Trends | 인증 + 30회/시간 |
| `/api/llm` | LLM 프록시 | 인증 + 60회/시간 (현재 클라이언트 미사용) |
| `/api/llm/stream` | LLM SSE 스트리밍 | 인증 + 60회/시간 (현재 클라이언트 미사용) |
| `/admin/*` | 관리자 API | admin role 필수 |

> **참고**: `/api/llm`, `/api/tts`, `/api/elevenlabs` 프록시 엔드포인트가 서버에 존재하지만,
> 현재 클라이언트 코드는 Electron IPC 또는 직접 호출을 사용합니다.

## 인증 체계

- **로그인**: Supabase Auth + profiles.approval_status 기반
- **승인 체계**: 회원가입 → 관리자 승인 → 로그인 가능
- **오프라인 시**: 로그인 차단 (서버 미연결 시 명확한 에러 메시지)
- **토큰 갱신**: 45분 간격 자동 refresh + 만료 시 재로그인 유도
- **세션 저장**: Electron에서는 safeStorage 암호화, 웹에서는 localStorage

## 키 저장 방식

| 환경 | 저장소 | 보호 수준 | UI 표시 |
|------|--------|----------|---------|
| Electron (safeStorage 가용) | OS 키체인/DPAPI | ✅ 암호화 | 🔒 OS 보안 저장소 |
| Electron (safeStorage 불가) | localStorage fallback | ⚠️ 평문 | ⚠ 브라우저 로컬 저장소 |
| 웹 | localStorage | ⚠️ 평문 | ⚠ 브라우저 로컬 저장소 |

> API 키 설정 화면에서 현재 저장 방식이 배지로 실시간 표시됩니다.

## 보안 방어선 요약

1. **CSP**: `script-src 'self'`, `connect-src` 12개 도메인 allowlist
2. **XSS 방어**: innerHTML 전면 제거, esc() + DOM API 기반 렌더링
3. **IPC 신뢰 경계**: assertTrustedSender() — file:// 앱 디렉토리만 허용
4. **키 암호화**: safeStorage (OS 키체인) — Electron에서만 동작
5. **클라이언트 쓰로틀링**: 분당 20회 API 호출 제한 (모든 환경)
6. **서버 Rate Limit**: 인증/공개 엔드포인트 모두 적용 (위 표 참조)
7. **Brute force 방어**: 로그인 10회/5분 초과 시 Slack 즉시 알림
8. **인증 통제**: 오프라인 시 로그인 차단, mock 진입 불가

## 핵심 리스크

- **XSS 1건 발생 시**: Electron에서는 모든 API 키가 IPC로 보호되어 렌더러 메모리에 키가 없음. 연결 테스트도 v3.5.5에서 IPC 전환 완료.
- **웹 환경**: 모든 키가 브라우저에 노출되며, 서버 rate limit 우회 가능
- **관측성 사각지대**: Electron IPC 경유 호출(YouTube/Pexels/LLM/TTS)은 서버 usage log에 남지 않음
- **safeStorage 불가 시**: OS 키체인을 사용할 수 없는 환경에서는 localStorage fallback 발생. v3.5.5에서 실제 저장 방식 배지를 safeStorage 가용 여부 기준으로 표시하도록 개선.

## 향후 개선 방향

**v3.5.5 기준으로 Electron 환경의 모든 API 호출(연결 테스트 포함)이 Main IPC를 경유합니다.**

> YouTube Data API: v3.5.1에서 ipc-youtube.js로 이동 완료.
> Pexels: v3.5.1에서 ipc-pexels.js로 이동 완료. v3.5.4에서 프리패치 경로도 IPC 통일.
> ElevenLabs, Google TTS: v3.5.3에서 IPC로 이동 완료.
> API 키 연결 테스트: v3.5.5에서 ipc-keytest.js로 이동 완료. 렌더러 키 노출 예외 경로 제거.

남은 개선 과제:
- 웹 환경에서도 서버 프록시를 경유하도록 전환 (현재 개발/테스트 전용으로 간주)
- 운영 telemetry (step 진입/완료, 기능 사용 여부 등 익명 이벤트) 추가
