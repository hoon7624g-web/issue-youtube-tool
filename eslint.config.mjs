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
      'no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'preserve-caught-error': 'warn',
      // 스타일/오탐 성격 규칙은 warn (빌드 차단 X). 진짜 버그성 규칙은 error 유지.
      // no-redeclare는 FFmpeg/Remotion의 양성 `var i` 루프 카운터만 걸려 warn으로 둔다.
      'no-redeclare': 'warn',
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
];
