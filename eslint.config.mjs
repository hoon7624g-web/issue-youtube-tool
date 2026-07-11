import js from '@eslint/js';
import globals from 'globals';

// Flat config. 코드베이스가 세 환경으로 나뉘므로 파일 패턴별로 분리한다.
//  - CJS: Electron main / preload / build 스크립트 (require, Node 전역)
//  - ESM: 렌더러 (Vite 번들, 브라우저 전역, import/export)
//  - admin-web: 정적 스크립트 (브라우저 전역)
// Deno Edge Function(supabase/functions)과 Remotion은 별도 런타임이라 제외.
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'build/**',
      'remotion/**',
      'supabase/**',
      'admin-web/**',
      'admin-shared/**',
      'assets/**',
      'coverage/**',
      '**/*.min.js',
    ],
  },

  js.configs.recommended,

  // Electron Main / Preload / 빌드 스크립트 — CommonJS + Node
  {
    files: ['main.js', 'preload.js', 'main/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Vite 설정 — ES Module + Node
  {
    files: ['vite.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // 렌더러 — ES Module + 브라우저
  {
    files: ['src/**/*.js', 'src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // 실용 규칙: 진짜 버그(no-undef, no-dupe-keys 등)는 recommended가 error로 잡고,
  // 스타일성 잡음은 warn으로 낮춰 빌드를 막지 않되 가시화한다.
  {
    rules: {
      // 미사용 변수는 error. catch 바인딩 미사용은 방어적 코드라 허용(caughtErrors:none),
      // 인자 미사용과 _ 접두 변수도 허용.
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // 오피니언/오탐 성격 규칙은 off (버그가 아님).
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
    },
  },
];
