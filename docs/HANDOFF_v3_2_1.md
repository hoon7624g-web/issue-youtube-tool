# 이슈 유튜브 제작툴 — 핸드오프 문서

> 최종 업데이트: 2026-03-23
> 버전: v3.2.0 → **v3.2.1**
> 담당: 상훈 (체인저스캠퍼스 운영매니저)

---

## v3.2.1 변경 요약 (v3.2.0 대비)

### 핵심: pipeline.js 모듈 분할 + Vite 번들러 도입

**Before**: `pipeline.js` 1,054줄 단일 파일 (10단계 파이프라인 + 히스토리 + API 키 설정 전부 포함)
**After**: 10개 ES Module로 분할 + Vite 번들러로 빌드

```
src/js/pipeline/
├── apikeys.js           (144줄) API 키 설정 UI + _tmplApiKeyForm() 템플릿 분리
├── step2-keywords.js    (123줄) ls2 + syncSelectedKw + addCustomKw
├── step3-4-videos.js     (90줄) ls3 + ls4 + URL 직접 입력
├── step5-analysis.js    (140줄) ls5 + AI Studio/자막 분석 + rAna
├── step6-script.js      (106줄) ls6 + renderDualScript (롱폼+숏폼)
├── step7-factcheck.js    (85줄) ls7 + rFC + Perplexity 연동
├── step8-footage.js     (150줄) ls8 + rEK + Pexels (_tmplSceneCard 분리)
├── step9-voice.js       (118줄) ls9 + rV + _tmplVoiceCard 분리
├── step10-result.js      (96줄) ls10 + downloadPkg (ZIP)
└── history.js            (87줄) saveToHistory + renderHistory
                        ─────
                    합계 1,139줄
```

### ES Module 전환 (전체 파일)

| 파일 | 변경 내용 |
|------|-----------|
| `utils.js` (156줄) | `export` 추가 + `window.$`, `window.toast`, `window.cancelAI` 노출 |
| `state.js` (128줄) | `export` + `window.S`, `sSet`, `sGo`, `sNext`, `sPrev`, `sK`, `sK2` 노출 |
| `mock-data.js` (61줄) | `export var M` |
| `client-proxy.js` (466줄) | `import/export` + `patchApi(ApiObj)` 파라미터 방식 (순환 import 방지) |
| `api.js` (145줄) | `export var Api` + `client-proxy.js`에서 import |
| `ui.js` (218줄) | `export` + 인라인 HTML 가독성 개선 |
| `app.js` (51줄) | **Vite entry point** — pipeline 모듈 import, 테마/부트 초기화 |

### Vite 번들러 설정

| 항목 | 설정 |
|------|------|
| 설정 파일 | `vite.config.js` |
| 소스 루트 | `src/` |
| 빌드 출력 | `dist/` |
| base URL | `./` (file:// 프로토콜 호환) |
| 개발 서버 | `npm run dev:vite` → localhost:5173 |

### index.html 변경

- **Before**: 9개 `<script>` 태그 (순서 의존)
- **After**: 1개 `<script type="module" src="js/app.js">`
- Vite 빌드 시 자동으로 해시된 번들 `<script>` 삽입

### package.json 변경

```json
"scripts": {
  "dev:vite": "vite --config vite.config.js",
  "dev:electron": "cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electron .",
  "build": "vite build --config vite.config.js",
  "start": "electron .",
  "build:win": "npm run build && electron-builder --win --publish never",
  ...
}
```

> **Note:** `cross-env` 사용으로 Windows/macOS/Linux 모두 동일하게 동작.

### main.js 변경

- 개발 모드: `VITE_DEV_SERVER_URL` 환경변수 → Vite dev server 로드
- 프로덕션: `dist/index.html` 로드
- electron-builder files: `src/**/*` → `dist/**/*`

### 인라인 HTML 정리 내역

| 파일 | Before | After |
|------|--------|-------|
| `apikeys.js` | 87줄짜리 인라인 HTML 문자열 | `_tmplApiKeyForm()` 템플릿 함수 + `_llmTabClick()` 이벤트 분리 |
| `step8-footage.js` | 장면카드+Storyblocks 각 30줄+ 인라인 | `_tmplSceneCard()` + `_tmplStoryblocksPanel()` 함수 분리 |
| `step9-voice.js` | 음성 카드 인라인 | `_tmplVoiceCard()` 함수 분리 |
| 모든 step 파일 | 500자+ 한 줄 HTML | 여러 줄 `+` 연결로 포맷 정리 |

### 직접 상태 변이 sSet 통일 (4곳 — v3.2.0에서 이관)

| 파일 | 줄 | 변경 전 | 변경 후 |
|---|---|---|---|
| `ui.js:14` | filterDays | `S.search.filterDays=d` | `sSet({'search.filterDays':d})` |
| `api.js:124` | factCheckedBy | `S.script.factCheckedBy='perplexity'` | `sSet({'script.factCheckedBy':'perplexity'})` |
| `api.js:128` | factCheckedBy | `S.script.factCheckedBy='llm'` | `sSet({'script.factCheckedBy':'llm'})` |
| `api.js:132` | factCheckedBy | `S.script.factCheckedBy='llm'` | `sSet({'script.factCheckedBy':'llm'})` |

### _saveLs() 빈 catch 수정 (1곳)

| 파일 | 줄 | 변경 전 | 변경 후 |
|---|---|---|---|
| `state.js:75` | localStorage 저장 | `catch(e){}` | `catch(e){console.warn('[LS] save failed:',e.message)}` |

---

## 빌드 & 실행 방법

### 개발 모드 (HMR 지원)

```bash
# 최초 1회: 의존성 설치 (cross-env 포함)
npm install

# 터미널 1: Vite dev server
npm run dev:vite

# 터미널 2: Electron (Vite dev server 연결, cross-env로 OS 무관 동작)
npm run dev:electron
```

### 프로덕션 빌드

```bash
# 1) Vite 빌드 (src/ → dist/)
npm run build

# 2) Electron 앱 패키징 (dist/ 포함)
npm run build:win    # Windows
npm run build:mac    # macOS
```

### 검증 완료 항목

- [x] `npx vite build` 성공 (21 modules → 128KB 단일 번들)
- [x] window.ls2~ls10 전부 번들에 포함
- [x] window.* 전역 노출 49개 전부 확인 (함수 + 상태 변수 포함)
- [x] 인라인 HTML onclick 참조 함수 전부 window 노출 확인
- [x] base: './' 설정으로 Electron file:// 프로토콜 호환

---

## 리팩터링 전체 현황

### ✅ 완료

| # | 항목 | 버전 |
|---|------|------|
| ③ | voiceResult.blob 직렬화 | v3.1.2 |
| ⑤ | Claude dangerous header → IPC 프록시 | v3.1.2 |
| ⑥ | GAS URL 의존 제거 | v3.1.2 |
| ⑦ | admin.html 빌드 제외 + files 정리 | v3.1.2 |
| ⑧ | createObjectURL 누수 / newProject/doLogout 해제 | v3.1.2 |
| ⑨ | JSZip CDN → npm | v3.1.2-patched |
| ⑩ | usage_logs 자동 정리 (90일/1%) | v3.1.2-patched |
| 보안 | contextIsolation:true, videoId 검증, XSS 래핑 | v3.1.2-patched |
| ① | 상태 네임스페이스 분리 | v3.2.0 |
| ④ | safeStorage 전환 (API 키 암호화) | v3.2.0 |
| — | 직접 상태 변이 sSet 통일 + _saveLs 로깅 | v3.2.1 |
| **②** | **pipeline.js 모듈 분할 + Vite 번들러 + 인라인 HTML 정리** | **v3.2.1** ✅ |

### 잔여 작업 없음

리팩터링 10개 항목 + 보안 패치 전부 완료.

---

## 파일 구조

```
├── main.js              # Electron 메인 프로세스 (dist/ 로드)
├── preload.js           # contextBridge
├── package.json         # v3.2.1, cross-env + Vite scripts
├── vite.config.js       # Vite 설정 (root: src/, base: ./)
├── build/               # electron-builder 아이콘
│   ├── icon.ico         # Windows 아이콘
│   └── icon.png         # macOS 아이콘 (electron-builder가 icns 자동 변환)
├── dist/                # Vite 빌드 출력 (프로덕션)
│   ├── index.html
│   └── assets/
│       └── index-[hash].js
├── src/
│   ├── index.html       # <script type="module" src="js/app.js">
│   ├── client-proxy.js  # ES Module — API 호출 래퍼
│   └── js/
│       ├── utils.js     # ES Module — 유틸리티
│       ├── state.js     # ES Module — 상태 관리
│       ├── mock-data.js # ES Module — 목업 데이터
│       ├── api.js       # ES Module — API 호출
│       ├── ui.js        # ES Module — UI 렌더링
│       ├── app.js       # ES Module — Vite entry point
│       └── pipeline/    # ← 10개 모듈 (원래 pipeline.js)
│           ├── apikeys.js
│           ├── step2-keywords.js
│           ├── step3-4-videos.js
│           ├── step5-analysis.js
│           ├── step6-script.js
│           ├── step7-factcheck.js
│           ├── step8-footage.js
│           ├── step9-voice.js
│           ├── step10-result.js
│           └── history.js
├── admin-web/
│   ├── index.html
│   └── client-proxy.js  # (별도 — 이번 스코프 밖)
└── api-key-guide/
    └── index.html
```

---

## 주요 URL / 설정값

- **GitHub:** `hoon7624g-web/issue-youtube-tool`
- **빌드 배포:** GitHub Releases (electron-builder)
- **Edge Function:** `supabase functions deploy proxy --no-verify-jwt`
- **GAS Deployment:** `https://script.google.com/macros/s/AKfycbwtmASwkreCs6etm1JVOjBasK-6pVzyNhIctzL764xJ42oVUKT3WYDbGMuMYKIfxxM/exec`
