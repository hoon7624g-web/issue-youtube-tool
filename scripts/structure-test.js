// ═══════════════════════════════════════
// structure-test.js — 정적 구조 회귀 검사 (런타임/Electron 미실행)
// 소스 파일 존재·핵심 문자열 포함·HTML ID 등 정적 구조가
// 회귀하지 않았는지만 검사한다. 실제 브라우저나 Electron 앱을 띄우지 않는다.
//
// 실행: node scripts/structure-test.js
// 런타임 E2E(Playwright + Electron)는 test/e2e/app.spec.mjs 참고 (`npm run test:e2e`).
// ═══════════════════════════════════════
const fs = require('fs');
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  ✕ ' + msg);
  }
}

// ═══════════════════════════════════════
// Part 1: 정적 구조 검증 (Electron 없이)
// ═══════════════════════════════════════
console.log('\n── 정적 구조 검증 ──');

// 1. 빌드 가능 여부
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert(pkg.scripts && pkg.scripts.build, 'Vite build script 존재');
assert(pkg.scripts && pkg.scripts.start, 'Electron start script 존재');

// 2. HTML 진입점 무결성
const html = fs.readFileSync('src/index.html', 'utf8');
assert(html.includes('id="app"'), 'index.html에 #app 컨테이너');
assert(html.includes('id="main"'), 'index.html에 #main 컨테이너');
assert(html.includes('id="sidebar"'), 'index.html에 #sidebar');
assert(html.includes('id="tw"'), 'index.html에 #tw (토스트)');
assert(html.includes('js/app.js'), 'index.html에 app.js 진입점');
assert(html.includes('Content-Security-Policy'), 'CSP 헤더 존재');

// 3. 파이프라인 모듈 등록 체인
const appJs = fs.readFileSync('src/js/app.js', 'utf8');
const stepFiles = [
  'pipeline/apikeys.js',
  'pipeline/step2-keywords.js',
  'pipeline/step3-4-videos.js',
  'pipeline/step5-analysis.js',
  'pipeline/step6-script.js',
  'pipeline/step7-factcheck.js',
  'pipeline/step8-footage.js',
  'pipeline/step9-voice.js',
  'pipeline/step10-result.js',
  'pipeline/history.js',
];
stepFiles.forEach((f) => {
  assert(appJs.includes(f), 'app.js에서 ' + f + ' import');
});

// 4. registerStep 호출 확인
const stepsToCheck = [2, 3, 5, 6, 7, 8, 9, 10];
stepsToCheck.forEach((n) => {
  const filePath =
    'src/js/pipeline/' +
    (n === 3
      ? 'step3-4-videos.js'
      : n === 2
        ? 'step2-keywords.js'
        : n === 5
          ? 'step5-analysis.js'
          : n === 6
            ? 'step6-script.js'
            : n === 7
              ? 'step7-factcheck.js'
              : n === 8
                ? 'step8-footage.js'
                : n === 9
                  ? 'step9-voice.js'
                  : 'step10-result.js');
  if (fs.existsSync(filePath)) {
    const src = fs.readFileSync(filePath, 'utf8');
    assert(src.includes('registerStep('), filePath + ': registerStep 호출');
  }
});

// 5. 상태 관리 무결성
const stateJs = fs.readFileSync('src/js/state.js', 'utf8');
assert(stateJs.includes('NS_DEFAULTS'), 'state.js: NS_DEFAULTS 정의');
assert(stateJs.includes('MAX_SAFE_RESTORE_STEP'), 'state.js: 복원 안전 상한');
assert(stateJs.includes('needsRerun'), 'state.js: P2-14 needsRerun 플래그');

// 6. 보안 검증
const preload = fs.readFileSync('preload.js', 'utf8');
assert(preload.includes('contextBridge'), 'preload.js: contextBridge 사용');
assert(
  !preload.includes('require(') ||
    preload.indexOf('require(') === preload.indexOf("require('electron')"),
  'preload.js: require 최소화'
);

const mainJs = fs.readFileSync('main.js', 'utf8');
assert(mainJs.includes('contextIsolation: true'), 'main.js: contextIsolation 활성화');
assert(mainJs.includes('sandbox: true'), 'main.js: sandbox 활성화');
assert(mainJs.includes('nodeIntegration: false'), 'main.js: nodeIntegration 비활성화');

// 7. IPC 핸들러 완전성
const ipcHandlers = [
  'get-api-keys',
  'set-api-keys',
  'clear-api-keys',
  'get-session',
  'set-session',
  'clear-session',
  'get-storage-status',
  'test-api-key',
  'test-api-key-direct',
  'call-claude',
  'call-gemini',
  'call-openai',
  'call-perplexity',
  'call-tts',
  'call-elevenlabs-tts',
  'yt-fetch',
  'pexels-search',
  'get-subtitle',
  'get-issuelink',
];
ipcHandlers.forEach((h) => {
  assert(preload.includes("'" + h + "'") || preload.includes('"' + h + '"'), 'IPC 핸들러: ' + h);
});

// 8. Edge Function 엔드포인트
const edgeIndex = fs.readFileSync('supabase/functions/proxy/index.ts', 'utf8');
assert(edgeIndex.includes('/api/config'), 'Edge Function: /api/config (P2-19)');
assert(edgeIndex.includes('/api/telemetry'), 'Edge Function: /api/telemetry (P2-20)');
assert(edgeIndex.includes('WEB_CLIENT_ONLY'), 'Edge Function: 비활성 엔드포인트 문서화 (P2-22)');
assert(edgeIndex.includes('telemetry_events'), 'Edge Function: 텔레메트리 테이블 참조');

// 9. P0 보안 확인
const formJs = fs.readFileSync('src/js/pipeline/apikeys-form.js', 'utf8');
const formInnerHtml = (formJs.match(/\.innerHTML\s*=/g) || []).length;
assert(formInnerHtml === 0, 'apikeys-form.js: innerHTML 할당 0건 (P0-1)');
assert(formJs.includes('validateSingleKey'), 'apikeys-form.js: 필드별 검증 (P0-2)');
assert(formJs.includes('_createEyeToggle'), 'apikeys-form.js: 필드별 키 보기 (P0-3)');
assert(formJs.includes('sessionOnlyMode'), 'apikeys-form.js: 세션 전용 모드 (P0-4)');

// 10. P1 UX 확인
const uiJs = fs.readFileSync('src/js/ui.js', 'utf8');
assert(uiJs.includes('STEP_GROUPS'), 'ui.js: 사이드바 그룹핑 (P1-5)');
assert(uiJs.includes('DeviceNotice'), 'ui.js: 기기 종속성 안내 (P2-17)');

const kwJs = fs.readFileSync('src/js/pipeline/step2-keywords.js', 'utf8');
assert(kwJs.includes('kw-rank'), 'step2: 키워드 순위 표시 (P1-6)');

// 11. P2 기술 부채 확인
const configJs = fs.readFileSync('src/config.js', 'utf8');
assert(configJs.includes('fetchServerConfig'), 'config.js: 동적 모델 로딩 (P2-19)');

const utilsJs = fs.readFileSync('src/js/utils.js', 'utf8');
// cleanAI 등 순수 함수는 pure-utils.mjs로 분리됨 (utils.js는 re-export)
const pureUtilsJs = fs.readFileSync('src/js/pure-utils.mjs', 'utf8');
assert(pureUtilsJs.includes('keepEmoji'), 'pure-utils.mjs: cleanAI keepEmoji (P2-18)');
assert(utilsJs.includes('updateMessage'), 'utils.js: createProgress updateMessage (P1-9)');

const compJs = fs.readFileSync('src/js/components.js', 'utf8');
assert(compJs.includes('ErrorCard'), 'components.js: ErrorCard (P2-15)');
assert(compJs.includes('DeviceNotice'), 'components.js: DeviceNotice (P2-17)');

// ═══════════════════════════════════════
// Part 2: 런타임 모의 검증 (DOM 없이)
// ═══════════════════════════════════════
console.log('\n── 런타임 모의 검증 ──');

// cleanAI keepEmoji 테스트
try {
  // 소스 수준 분기 검증 (실행 기반 동작 검증은 unit 테스트에서 수행)
  const cleanAISrc = pureUtilsJs.substring(
    pureUtilsJs.indexOf('export function cleanAI'),
    pureUtilsJs.indexOf('export function cleanAI') + 800
  );
  assert(
    cleanAISrc.includes('keepEmoji') && cleanAISrc.includes('if (!keepEmoji)'),
    'cleanAI: keepEmoji 분기 로직'
  );
} catch (e) {}

// sSet strict mode 테스트
assert(
  stateJs.includes('import.meta.env') && stateJs.includes('DEV'),
  'sSet: dev 모드 strict throw'
);
assert(stateJs.includes('p[1] in NS_DEFAULTS[p[0]]'), 'sSet: NS_DEFAULTS 키 검증');

// ═══════════════════════════════════════
// 결과
// ═══════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  구조 검사: ' + passed + ' passed, ' + failed + ' failed');
console.log('═══════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
