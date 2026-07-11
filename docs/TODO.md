# TODO

## 테스트

### 런타임 E2E (Playwright + Electron) — 미구현
현재 `scripts/structure-test.js`는 **정적 구조 회귀 검사**만 수행한다: 소스 파일 존재, 핵심 문자열 포함, HTML ID 존재 등 — 실제 앱을 실행하지 않는다. (이전 `e2e-test.js`가 헤더에서 "Playwright + Electron E2E"라 표기했으나 실제 구현은 정적 검사였고, 이를 `structure-test.js`로 정정함.)

진짜 E2E는 아직 없다. 추후 Playwright로 Electron 앱을 실제 구동해 핵심 경로를 검증할 것:
1. 앱 실행 → 로그인 화면 렌더링
2. 로그인 폼 요소 및 검증
3. API 키 설정 화면 진입/저장
4. 로그인 후 사이드바 렌더링
5. 파이프라인 단계 이동 + 상태 저장/복원 무결성
6. (가능하면) 결과 ZIP 패키징까지 스모크
