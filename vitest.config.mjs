import { defineConfig } from 'vitest/config';

// pure-utils.mjs는 DOM 비의존 순수 함수라 node 환경에서 실제 동작을 검증한다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/js/pure-utils.mjs'],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
