# 유튜브도사 — 썸네일 생성기 v4 통합 패키지

## 개요

좌측 네비게이션에 독립 "썸네일" 탭을 추가합니다.
파이프라인 Step과 별도로, 언제든 제목 + 배경 + 스타일 프리셋을 조합해 썸네일을 생성할 수 있습니다.

### 기능

| 기능 | 설명 |
|------|------|
| 롱폼 썸네일 | 1280×720 — YouTube 표준 |
| 숏폼 썸네일 | 1080×1920 — Shorts/릴스용, 상단·하단 바 + 채널 로고 |
| 스타일 프리셋 3종 | Bold / News / Minimal |
| 색상 변형 6종 | 오렌지, 레드, 블루, 그린, 퍼플, 옐로우 |
| 배치 프리뷰 | 3×6 = 18개 변형을 한 번에 렌더링 → 그리드 비교 |
| 배경 소스 3가지 | Pexels 검색 / 로컬 파일 업로드 / 없음(그라디언트) |
| 고화질 저장 | 선택 → PNG 다운로드 (파일 저장 다이얼로그) |

---

## 파일 구조

```
C:\issue-youtube-tool\
├── preload.js                          ← 덮어쓰기 (IPC 3개 추가)
├── main/
│   └── ipc-remotion.js                 ← 덮어쓰기 (배치/HQ/로컬이미지 핸들러)
├── remotion/
│   └── src/
│       ├── Root.jsx                    ← 덮어쓰기 (ShortsThumbnail 등록)
│       └── compositions/
│           ├── LongformThumbnail.jsx   ← 기존 유지 (변경 없음)
│           └── ShortsThumbnail.jsx     ← 신규 추가
└── src/
    └── js/
        └── thumbnail/
            └── thumbnail-tab.js        ← 신규 추가
```

---

## 설치 순서

### 1단계: 파일 교체/추가

```
# 기존 파일 덮어쓰기
preload.js                 → C:\issue-youtube-tool\preload.js
main/ipc-remotion.js       → C:\issue-youtube-tool\main\ipc-remotion.js
remotion/src/Root.jsx       → C:\issue-youtube-tool\remotion\src\Root.jsx

# 신규 파일 추가
remotion/src/compositions/ShortsThumbnail.jsx
    → C:\issue-youtube-tool\remotion\src\compositions\ShortsThumbnail.jsx

src/js/thumbnail/thumbnail-tab.js
    → C:\issue-youtube-tool\src\js\thumbnail\thumbnail-tab.js
```

### 2단계: 좌측 네비게이션에 썸네일 탭 연결

> 이 부분은 기존 네비게이션 코드가 프로젝트마다 다를 수 있으므로, 패턴만 안내합니다.

**네비게이션 HTML/JS에서 (예: `src/js/app.js` 또는 `src/js/nav.js`):**

```javascript
// 1) 모듈 임포트 추가
import { mountThumbnailTab } from './thumbnail/thumbnail-tab.js';

// 2) 네비에 탭 버튼 추가 (파이프라인 Step 아래)
//    기존 nav 컨테이너에 구분선 + 썸네일 버튼을 DOM으로 추가합니다.
//    예시:

const nav = document.querySelector('.nav-list'); // 실제 선택자에 맞게 변경
if (nav) {
  // 구분선
  const divider = document.createElement('div');
  divider.style.cssText = 'height:1px;background:var(--bdr);margin:12px 8px;';
  nav.appendChild(divider);

  // 썸네일 탭 버튼
  const thumbNavBtn = document.createElement('button');
  thumbNavBtn.className = 'nav-item'; // 기존 nav-item 클래스와 동일하게
  thumbNavBtn.innerHTML = '🖼️ 썸네일';
  thumbNavBtn.dataset.tab = 'thumbnail';
  thumbNavBtn.addEventListener('click', () => {
    // 기존 모든 nav-item에서 active 제거
    nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    thumbNavBtn.classList.add('active');

    // 기존 모든 step 패널 숨기기
    document.querySelectorAll('.step-panel').forEach(p => p.style.display = 'none');

    // 썸네일 패널 표시
    let thumbPanel = document.getElementById('panel-thumbnail');
    if (!thumbPanel) {
      thumbPanel = document.createElement('div');
      thumbPanel.id = 'panel-thumbnail';
      thumbPanel.className = 'step-panel';
      document.querySelector('.main-content').appendChild(thumbPanel); // 실제 컨테이너에 맞게 변경
    }
    thumbPanel.style.display = 'block';
    mountThumbnailTab(thumbPanel);
  });
  nav.appendChild(thumbNavBtn);
}
```

**핵심 원리:**
- `mountThumbnailTab(container)` 를 호출하면 해당 DOM 요소 안에 썸네일 생성기 전체 UI가 렌더링됩니다.
- 탭 전환 시 매번 새로 마운트되므로 상태가 초기화됩니다 (의도된 동작).
- 기존 파이프라인 Step의 `registerStep()`과 독립적이므로 충돌하지 않습니다.

### 3단계: 빌드

```bash
cd C:\issue-youtube-tool
npm run build   # Vite 빌드 (thumbnail-tab.js 포함)
npm start       # 테스트 실행
```

---

## 새로 추가된 IPC 채널

| 채널명 | 방향 | 용도 |
|--------|------|------|
| `remotion-thumbnail-batch` | invoke | 여러 스타일×색상 변형을 한 번에 렌더 → base64 배열 반환 |
| `remotion-thumbnail-save-hq` | invoke | 선택된 변형을 고화질 PNG로 렌더 → 파일 저장 다이얼로그 |
| `remotion-select-local-image` | invoke | OS 파일 선택 다이얼로그 → 이미지 경로 + base64 반환 |

기존 채널 (`remotion-render-thumbnail`, `remotion-check` 등)은 하위 호환을 유지합니다.

---

## 아키텍처 다이어그램

```
┌───────── 렌더러 (Chromium) ─────────┐
│                                      │
│  thumbnail-tab.js                    │
│    ├─ mountThumbnailTab(container)   │
│    ├─ 제목/배경/모드 입력 UI        │
│    ├─ Pexels 검색 (pexelsSearch IPC) │
│    ├─ 로컬 이미지 (selectLocalImage) │
│    ├─ 프리뷰 생성 (thumbnailBatch)   │
│    └─ 고화질 저장 (thumbnailSaveHQ)  │
│                                      │
└──────────── preload.js ──────────────┘
                  │ IPC
┌─────── Main Process ────────┐
│                              │
│  ipc-remotion.js             │
│    ├─ renderThumbnailBatch() │    ┌──── Remotion ────┐
│    │   (번들 1회 → N회 renderStill) ←→│ Root.jsx        │
│    ├─ renderThumbnailHQ()    │    │ LongformThumbnail│
│    ├─ selectLocalImage()     │    │ ShortsThumbnail  │
│    └─ 기존 render/check      │    └──────────────────┘
│                              │
└──────────────────────────────┘
```

### 성능 참고

- 배치 프리뷰는 **번들링을 1회만** 수행하고 `renderStill`을 N회 반복합니다.
- 18개 변형 기준: 번들링 ~20초 + 렌더링 ~2~3초/개 = 총 약 60~80초.
- 고화질 저장은 선택된 1개만 다시 렌더링 (번들링 포함 ~25초).

---

## 커스터마이징

### 색상 변형 추가/변경

`thumbnail-tab.js` 상단의 `COLOR_VARIANTS` 배열을 수정하세요:

```javascript
const COLOR_VARIANTS = [
  { id: 'orange',  color: '#FF6B35', label: '오렌지' },
  { id: 'red',     color: '#E53935', label: '레드' },
  // ... 원하는 색상 추가
];
```

### 스타일 프리셋 추가

1. `LongformThumbnail.jsx` 또는 `ShortsThumbnail.jsx`의 `STYLES` 객체에 새 키 추가
2. `thumbnail-tab.js`의 `STYLE_PRESETS` 배열에 해당 키 추가
3. 자동으로 프리셋 × 색상 조합이 확장됩니다

### 숏폼 상단/하단 바 커스터마이징

`ShortsThumbnail.jsx`에서:
- `barStyle: 'solid'` → 단색 채널명 바
- `barStyle: 'accent'` → 강조색 바
- `barStyle: 'minimal'` → 얇은 라인만

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| "Remotion 미설치" | remotion 의존성 없음 | `cd remotion && npm install` |
| 프리뷰 생성 무한 로딩 | 번들링 경로 오류 | `remotion/src/index.js` 존재 확인 |
| Pexels 검색 안됨 | Pexels API 키 미설정 | 설정 탭에서 Pexels API 키 입력 |
| 배경 이미지 적용 안됨 | 이미지 URL 접근 불가 | 로컬 업로드 사용 또는 URL 확인 |
| 한글 폰트 깨짐 | 시스템 폰트 미설치 | Pretendard 또는 Noto Sans KR 설치 |
