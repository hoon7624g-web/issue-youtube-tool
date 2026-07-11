# 의존성 취약점 감사 (Dependency Audit)

작성: 2026-07-11 · 기준: `npm audit --package-lock-only` (Node 24 / npm 11)
방식: `npm audit fix --force`는 **사용하지 않음**(major/breaking 금지). patch/minor 범위 내에서만 조치.

## 요약

| | before | after |
|---|---|---|
| **critical** | 7 | **0** ✅ |
| high | 17 | 10 |
| moderate | 5 | 0 ✅ |
| low | 2 | 0 ✅ |
| **합계** | **31** | **10** |

- **Remotion RCE·임의 파일쓰기(critical) 전량 해소** (patch 업그레이드).
- 남은 10건은 **전부 `electron` / `electron-builder` major 업그레이드로만** 해결 가능 → 이번엔 미적용, 아래 계획만.

---

## 직접 의존성별 분석

| 패키지 | 이전→현재 | 취약점 | 영향 | 조치 |
|---|---|---|---|---|
| **remotion** | 4.0.250 → **4.0.487** | RCE `GHSA-2jqp-f4gr-44fr`(CWE-94), 임의 파일쓰기 `GHSA-g6pc-6676-c23j`(CWE-123), 둘 다 **critical** (`<4.0.410`) | **런타임** — 로컬 숏폼 렌더링에 실사용(`main/ipc-remotion.js`) | ✅ **patch 업그레이드 완료** (4.0.x 내) |
| **@remotion/bundler** | 4.0.250 → **4.0.487** | 위 remotion + esbuild/webpack 경유 | 런타임(렌더 번들링) | ✅ 완료 |
| **@remotion/renderer** | 4.0.250 → **4.0.487** | 위 remotion + `ws`(메모리 노출/DoS) 경유 | 런타임(렌더링) | ✅ 완료 |
| **vite** | 8.0.x → **8.1.4** | dev server 경로순회·`server.fs.deny` 우회·WS 임의 파일읽기 (`GHSA-p9ff-h696-f583` 등, `<=8.0.15`) | **빌드타임/개발** — dev server 구동 시에만 노출, 배포 앱엔 미포함 | ✅ **범위 내(^8) 업그레이드 완료** |
| **electron** | ~33.0.0 (33.0.2) | UAF 다수(high: offscreen paint, PowerMonitor, WebContents 등) + ASAR 무결성 우회·권한/오리진 이슈(moderate) | **런타임** — 앱 프레임워크 | ⏸ **미적용 (fix=electron 43, MAJOR)** — 아래 계획 |
| **electron-builder** | ^25.0.0 (25.1.8) | transitive `tar`/`node-gyp`/`cacache`/`make-fetch-happen`/`app-builder-lib`/`dmg-builder` 경로순회·심링크 (high) | **빌드타임 전용** — 패키징 도구, 배포 앱에 **미포함** | ⏸ **미적용 (fix=electron-builder 26, MAJOR)** — 아래 계획 |

취약점 없음(직접): `electron-log`, `electron-updater`, `ffmpeg-static`, `jszip`, `react`, `react-dom`, `cross-env`.

---

## 남은 취약점 (10 high) — 전부 major 트리

| 패키지 | 유형 | 해소 조건 |
|---|---|---|
| electron | 직접·런타임 | electron 43 (major) |
| electron-builder | 직접·빌드타임 | electron-builder 26 (major) |
| @electron/rebuild, app-builder-lib, cacache, dmg-builder, electron-builder-squirrel-windows, make-fetch-happen, node-gyp, tar | transitive·빌드타임 | electron-builder 26 (major)로 일괄 해소 |

> **빌드타임 취약점은 배포 산출물(.exe/.dmg)에 실리지 않습니다.** 빌드 환경(개발/CI)에서만 노출되므로 런타임 리스크는 낮음. 다만 CI에서 신뢰 안 되는 입력을 다루지 않도록 유지.

---

## Major 업그레이드 계획 (이번 미실행 — 별도 작업 필요)

### electron 33 → 43 (런타임, 우선순위 중)
- **영향**: 10개 major 버전 점프. main 프로세스 API·BrowserWindow 옵션·세션/권한 API·업데이터 호환성 변경 가능.
- **절차**: (1) 33→43 breaking change 검토(각 major changelog) → (2) `contextIsolation`/`sandbox`/`nodeIntegration` 설정·preload·IPC 재확인 → (3) `npm run verify` + 실제 앱 구동(로그인→파이프라인→렌더) → (4) win NSIS / mac DMG 빌드 + 코드사이닝 CI 재확인.
- **주의**: 현재 대부분 취약점은 UAF·특정 조건(offscreen 렌더, 특정 IPC)으로 즉시 악용성은 낮으나, 런타임인 만큼 다음 정비 사이클에 우선 처리 권장.

### electron-builder 25 → 26 (빌드타임, 우선순위 하)
- **영향**: config 스키마 일부 변경 가능. transitive tar/node-gyp 취약점 일괄 해소.
- **절차**: 26 마이그레이션 노트 확인 → `build` 설정(win/mac/nsis/dmg) 호환 확인 → win/mac 빌드 산출물 + 코드사이닝/노터라이즈 CI 통과 확인.
- **주의**: 빌드타임 전용이라 배포 앱 리스크는 없음 → electron 업그레이드와 함께 묶어 진행해도 무방.

---

## 조치 로그
- `remotion`·`@remotion/bundler`·`@remotion/renderer`: package.json 4.0.250→4.0.487 (root + `remotion/package.json` 동기화), `npm install`.
- `npm audit fix` (**non-force**) 로 vite(8.1.4) 및 in-range transitive(form-data/lodash/tmp/ws/esbuild/webpack 등) 해소.
- `npm run verify` (check-version + lint + test 94 + build) 통과 확인.
- `npm audit fix --force` **미사용**, electron/electron-builder major **미실행**.
