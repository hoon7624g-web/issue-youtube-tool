import { defineConfig } from '@playwright/test';

// Electron 앱 스모크 E2E. 브라우저 프로젝트 없이 _electron 런처만 사용한다.
// vitest(test/**/*.test.mjs)와 분리 — 여기선 test/e2e/**/*.spec.mjs만 수집.
export default defineConfig({
  testDir: './test/e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
