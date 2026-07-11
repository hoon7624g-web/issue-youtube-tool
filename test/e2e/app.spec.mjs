import { test, expect, _electron as electron } from '@playwright/test';

// 스모크 E2E: 패키징 전, Electron 앱을 실제로 띄워 렌더러가 로그인 화면까지
// 정상 마운트되는지 확인한다. 백엔드/키 없이 도달 가능한 지점만 검증.
//
// 실행 요건: 디스플레이가 있는 환경(로컬 또는 CI의 windows/xvfb 러너) + `npm run build`.
//   main.js는 VITE_DEV_SERVER_URL이 없으면 dist/index.html을 로드하므로 빌드가 선행되어야 한다.
//   실행: `npm run build && npm run test:e2e`
test('앱이 실행되고 로그인 화면이 렌더된다', async () => {
  const app = await electron.launch({ args: ['.'] });
  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await expect(win.locator('.login-title')).toHaveText('유튜브도사 영상 제작 솔루션', {
      timeout: 20000,
    });
    await expect(win.locator('#lbtn')).toHaveText('로그인');
    await expect(win.getByText('수강생 전용')).toBeVisible();
  } finally {
    await app.close();
  }
});
