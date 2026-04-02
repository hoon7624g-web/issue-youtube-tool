# HANDOFF v3.2.2 — XSS 방어 + Pexels 최적화

## 변경 요약

### 1. inline event handler 전면 제거 (XSS 방어)
모든 `onclick=`, `onchange=`, `onmouseover=`, `onmouseout=`, `onkeydown=`, `oninput=` 인라인 이벤트를
`addEventListener()` 또는 이벤트 위임(event delegation)으로 교체.

**교체된 파일 (12개):**
| 파일 | 주요 변경 |
|---|---|
| `step8-footage.js` | `_tmplSceneCard` → `_buildSceneCard` DOM, `_setupPexels(loadPexelsRow, _pexelsAddDL)` → 모듈 내부 함수 |
| `step10-result.js` | 전체 `ls10()` DOM 전환 (복사, 오디오, 접이식, 다운로드) |
| `step7-factcheck.js` | `_renderTabs` → `_buildTabs` DOM, `rAllFC()` DOM 전환 |
| `step9-voice.js` | 음성 카드, 미리듣기 버튼, 오디오 플레이어 전부 DOM |
| `step3-4-videos.js` | 필터 버튼, URL 입력, sPrev 전부 DOM |
| `step5-analysis.js` | 분석 결과, 에러 핸들러, 자막 입력 전부 DOM |
| `step6-script.js` | 스타일 select, 복사, 에디터 oninput, 재시도 전부 DOM |
| `step2-keywords.js` | 커스텀 키워드 onkeydown/onclick → addEventListener |
| `history.js` | 히스토리 카드 onclick/onmouseover/onmouseout → addEventListener |
| `apikeys.js` | LLM 탭, 키 보기, 음성 업로드 onchange → addEventListener |
| `ui.js` | filterDuration 에러 핸들러 DOM 전환, 헤더 버튼 바인딩 추가 |
| `utils.js` | CANCEL_BTN → class 기반 이벤트 위임 (`cancelAI-trigger`) |
| `index.html` | 헤더 `onclick="toggleTheme()"` / `onclick="doLogout()"` 제거 |

### 2. Pexels 캐싱 (`_pexelsCache`)
- `step8-footage.js`에 `const _pexelsCache = {}` 도입
- 키워드별 첫 검색만 API 호출, 이후 `cacheKey = query.toLowerCase().trim()` 기준 캐시 히트
- 탭 전환 시 동일 키워드 재검색 방지 → API 호출 절감
- 자동 로드(mainEn) UX는 유지

### 3. CSP 메타 태그 추가
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  img-src 'self' https: blob: data:;
  media-src 'self' https: blob:;
  connect-src 'self' https:;
">
```
- `script-src 'self'` — **unsafe-inline 없이 동작** (모든 인라인 핸들러 제거 완료)
- `style-src 'unsafe-inline'` — Vite dev/build의 inline style 주입 + 컴포넌트 `style.cssText` 허용
- `connect-src 'self' https:` — Pexels/YouTube/LLM API 호출 허용

### 4. 기타
- 모든 신규 코드 `const`/`let`만 사용 (`var` 0건)
- `safeUrl()` 적용: step8 썸네일/비디오 URL, step10 오디오/썸네일, step9 오디오, history 썸네일
- `_pexelsPreview` 모달은 이미 v3.2.1에서 DOM 기반으로 완료 → 그대로 유지
- `window._ekGoPage`, `window._fcGoPage` — 페이지네이션용으로만 window 노출 유지

## 검증 결과
```
inline event handlers (onclick/onchange/...): 0건
var declarations in pipeline/: 0건
CSP: script-src 'self' (unsafe-inline 없음)
```

## 빌드 & 테스트
```bash
cd C:\issue-youtube-tool
npm run dev    # Vite dev server
npm run build  # 프로덕션 빌드
npm run lint   # 문법 체크
```

## 기능 체크리스트
- [ ] Step 2: 키워드 선택 + 직접 입력 (Enter/클릭)
- [ ] Step 3: 영상 리스트 필터 (롱폼/미디엄/숏폼) + URL 직접 입력
- [ ] Step 4: 영상 선택 확인
- [ ] Step 5: AI 분석 (AI Studio / 자막 fallback)
- [ ] Step 6: 대본 생성 + 멀티셀렉트 + 롱폼 에디터
- [ ] Step 7: 팩트체크 탭 페이지네이션
- [ ] Step 8: 풋티지 키워드 클릭 → Pexels 검색 (캐시 동작 확인)
- [ ] Step 8: Pexels 미리보기 모달 + 다운로드 토글
- [ ] Step 8: 탭 전환 시 같은 키워드 재검색 안 함 (캐시)
- [ ] Step 9: 음성 선택 + 미리듣기 + 생성
- [ ] Step 10: 복사 버튼 + 오디오 재생 + 패키지 접이식
- [ ] Step 10: ZIP 다운로드 (Pexels 풋티지 포함)
- [ ] 히스토리: 카드 접이식 + 삭제 + 전체 삭제
- [ ] API 키 설정: LLM 탭 전환 + 키 보기/숨기기
- [ ] 다크 모드 토글 + 로그아웃
