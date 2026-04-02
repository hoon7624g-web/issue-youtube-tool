# HANDOFF v3.5.4 — 코드 리뷰 P1 버그 수정 + 문서 최신화

## 변경 요약

외부 코드 리뷰 2건에서 발견된 실사용 버그 5건 + 문서-코드 불일치를 일괄 수정.
기능 추가 없이 기존 코드의 정확성과 문서 신뢰도를 개선하는 릴리스.

---

### 1. extractJSON() progressive scanning으로 전면 재작성 (🔴 치명)

**파일**: `src/js/utils.js`

**버그**: 기존 구현이 `{`를 `[`보다 무조건 먼저 찾아서, AI가 `[{...}, {...}]` 배열 응답을 보내면 첫 번째 객체만 잘리는 문제.
HANDOFF_v3_5_2.md에는 progressive scanning으로 수정했다고 적혀 있었으나 **실제 코드는 미수정 상태였음.**

**영향 범위**:
- 숏폼 5개 → 1개만 파싱
- 팩트체크 배열 → 첫 항목만
- 풋티지 키워드 배열 → 불완전

**수정**: 모든 `{`, `[` 위치를 수집 → earliest 순으로 depth-matching + `JSON.parse` 시도. 첫 매칭 실패 시 다음 후보로 자동 fallback.

### 2. unit-test.js 테스트 신뢰도 개선

**파일**: `scripts/unit-test.js`

**문제**: extractJSON 테스트가 실제 `src/js/utils.js`의 함수를 import하지 않고, 테스트 파일 안에 **다른 구현의 복사본**을 넣어 돌리고 있었음. 테스트 초록불 ≠ 실제 앱 안전.

**수정**:
- 테스트 내 extractJSON을 src/js/utils.js와 동일한 progressive scanning 구현으로 교체
- ESM → CJS 호환 불가로 복사 방식 유지하되, "반드시 src와 동일하게 유지" 경고 주석 추가
- P1 회귀 테스트 7개 추가 (배열+프리앰블, 숏폼 5개, 깨진 JSON 건너뛰기, 빈 배열/객체, 중첩 구조 등)

### 3. 선택 키 실패가 필수 흐름을 막는 버그 수정

**파일**: `src/js/pipeline/apikeys.js`

**버그**: `_validateAllKeys()`에서 필수 키 failCount와 선택 키 failCount를 합산하여, `failCount === 0`일 때만 다음으로 진행 허용.
→ YouTube/Claude/Google AI가 전부 정상이어도, Pexels 키 하나 틀리면 앱 시작 불가.
→ "선택 설정", "나중에 추가 가능" 안내와 실제 동작이 모순.

**수정**:
- `failCount`를 `requiredFailCount` + `optionalFailCount`로 분리
- 선택 키 실패 시 주황색 경고 톤 + "(선택 — 나중에 수정 가능)" 메시지
- 저장 콜백: `result.requiredFailCount === 0`이면 자동 진행 (선택 키 실패는 경고만)
- 요약 메시지: "필수 키는 정상입니다! 선택 키 N개에 문제가 있지만 바로 시작할 수 있습니다."

### 4. Ctrl+Enter 셀렉터 버그 수정

**파일**: `src/js/app.js`

**버그**: 키보드 단축키(Ctrl+Enter)로 현재 스텝의 실행 버튼을 클릭할 때, `.panel.on`으로 셀렉트하고 있었으나 실제 CSS 클래스는 `.pnl.on`. → 단축키가 아예 동작하지 않음.

**수정**: `.panel.on` → `.pnl.on`

### 5. Pexels 프리패치 IPC 우회 수정

**파일**: `src/js/pipeline/step8-footage.js`

**문제**: 개별 Pexels 검색은 `window.electronAPI.pexelsSearch()` IPC를 타지만, Step 8 진입 시 프리패치는 `fetch('https://api.pexels.com/...')`로 직접 호출. 같은 파일 안에서 경로가 갈라지는 부분 누락.

**수정**: 프리패치도 Electron일 때 `window.electronAPI.pexelsSearch()` IPC 경유, 웹 환경에서만 직접 fetch fallback.

### 6. YouTube IPC 상태 확인 → 문서만 수정

**확인 결과**: `client-proxy-media.js`에서 이미 `window.electronAPI.ytFetch()` IPC를 사용 중이었음.
`main/ipc-youtube.js`도 정상 등록. **코드는 정상이고 문서만 잘못된 상태.**

### 7. 보안 문서 + HANDOFF 최신화

**파일**: `docs/SECURITY_MODEL.md`

- Electron 호출 경로 표: YouTube ✅ Main IPC, Pexels ✅ Main IPC로 수정
- 연결 테스트 예외 사항 명시 (apikeys.js의 _testYouTube 등은 렌더러 직접 호출)
- 핵심 리스크 섹션 갱신: "Electron에서 모든 API 키가 IPC로 보호됨"
- 향후 개선 방향: "v3.5.4 기준 Electron 환경의 모든 API 호출이 Main IPC 경유" 반영
- 버전: v3.5.3 → v3.5.4

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/js/utils.js` | extractJSON() progressive scanning 전면 재작성 |
| `scripts/unit-test.js` | extractJSON 테스트 동기화 + 회귀 테스트 7개 추가 |
| `src/js/pipeline/apikeys.js` | failCount 필수/선택 분리, 저장 콜백 requiredFailCount 기준 |
| `src/js/app.js` | Ctrl+Enter 셀렉터 `.panel.on` → `.pnl.on` |
| `src/js/pipeline/step8-footage.js` | Pexels 프리패치 IPC 경유로 통일 |
| `docs/SECURITY_MODEL.md` | YouTube/Pexels IPC 반영, 연결 테스트 예외 명시, 리스크 갱신 |
| `docs/HANDOFF_v3_5_4.md` | 본 문서 (신규) |

## 배포 시 주의사항

1. **Edge Function 재배포 불필요**: 서버 코드 변경 없음
2. **Electron 빌드 필요**: src/js 변경이 있으므로 Vite 빌드 + Electron 패키징 필요
3. **기존 사용자 영향**: 선택 키만 입력한 사용자가 시작 불가했던 문제가 해소됨
