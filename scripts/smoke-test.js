#!/usr/bin/env node
// ═══════════════════════════════════════════════
// smoke-test.js — v3.5.7 최소 기능 검증
// 실행: node scripts/smoke-test.js
// ═══════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const errors = [];

function ok(name) { passed++; console.log(`  ✅ ${name}`); }
function fail(name, reason) { failed++; errors.push({ name, reason }); console.log(`  ❌ ${name}: ${reason}`); }
function section(title) { console.log(`\n── ${title} ──`); }

// ═══════════════════════════════════════════════
// 1. 파일 존재 검증
// ═══════════════════════════════════════════════
section('파일 존재 검증');

const requiredFiles = [
  'main.js', 'preload.js', 'package.json', 'vite.config.js',
  'src/index.html', 'src/client-proxy.js', 'src/client-proxy-auth.js',
  'src/client-proxy-llm.js', 'src/client-proxy-media.js',
  'src/js/app.js', 'src/js/state.js', 'src/js/api.js', 'src/js/ui.js',
  'src/js/utils.js', 'src/js/router.js', 'src/js/shared.js', 'src/js/mock-data.js',
  'src/js/pipeline/step2-keywords.js', 'src/js/pipeline/step3-4-videos.js',
  'src/js/pipeline/step5-analysis.js', 'src/js/pipeline/step6-script.js',
  'src/js/pipeline/step7-factcheck.js', 'src/js/pipeline/step8-footage.js',
  'src/js/pipeline/step9-voice.js', 'src/js/pipeline/step10-result.js',
  'src/js/pipeline/apikeys.js', 'src/js/pipeline/history.js',
  'supabase/functions/proxy/index.ts',
  'admin-web/index.html', 'admin-shared/admin-core.css',
  'admin-shared/admin-utils.js', 'admin-shared/admin-users.js', 'admin-shared/admin-styles.js',
];

for (const f of requiredFiles) {
  if (fs.existsSync(f)) ok(f);
  else fail(f, '파일 없음');
}

// ═══════════════════════════════════════════════
// 2. package.json 검증
// ═══════════════════════════════════════════════
section('package.json 검증');

try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+$/.test(pkg.version)) ok('버전 ' + pkg.version);
  else fail('버전', `invalid semver: ${pkg.version}`);
  
  if (pkg.main === 'main.js') ok('entry point: main.js');
  else fail('entry point', pkg.main);
  
  const requiredDeps = ['electron-log', 'electron-updater', 'jszip'];
  for (const dep of requiredDeps) {
    if (pkg.dependencies && pkg.dependencies[dep]) ok(`dependency: ${dep}`);
    else fail(`dependency: ${dep}`, 'missing');
  }
  
  const requiredDevDeps = ['electron', 'electron-builder', 'vite'];
  for (const dep of requiredDevDeps) {
    if (pkg.devDependencies && pkg.devDependencies[dep]) ok(`devDependency: ${dep}`);
    else fail(`devDependency: ${dep}`, 'missing');
  }
  
  if (pkg.scripts['dev:vite'] && pkg.scripts['dev:electron']) ok('dev scripts 존재');
  else fail('dev scripts', 'missing');
  
  if (pkg.scripts['build:win'] || pkg.scripts['build:mac']) ok('build scripts 존재');
  else fail('build scripts', 'missing');
} catch (e) {
  fail('package.json 파싱', e.message);
}

// ═══════════════════════════════════════════════
// 3. 보안 설정 검증
// ═══════════════════════════════════════════════
section('보안 설정 검증');

const mainJs = fs.readFileSync('main.js', 'utf8');
const mainModules = ['main/security.js', 'main/keys.js', 'main/ipc-llm.js', 'main/ipc-keytest.js']
  .map(f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
  .join('\n');
const allMainCode = mainJs + '\n' + mainModules;

// contextIsolation
if (allMainCode.includes('contextIsolation: true')) ok('contextIsolation: true');
else fail('contextIsolation', 'not found');

// sandbox
if (allMainCode.includes('sandbox: true')) ok('sandbox: true');
else fail('sandbox', 'not found');

// nodeIntegration
if (allMainCode.includes('nodeIntegration: false')) ok('nodeIntegration: false');
else fail('nodeIntegration', 'should be false');

// assertTrustedSender
if (allMainCode.includes('assertTrustedSender')) ok('IPC sender 검증 존재');
else fail('assertTrustedSender', 'not found');

// safeStorage
if (allMainCode.includes('safeStorage')) ok('safeStorage 사용');
else fail('safeStorage', 'not found');

// ALLOWED_API_KEYS whitelist
if (allMainCode.includes('ALLOWED_API_KEYS')) ok('API 키 화이트리스트');
else fail('ALLOWED_API_KEYS', 'not found');

// v3.4.1: IPC handlers for all LLM APIs
if (allMainCode.includes("'call-gemini'")) ok('Gemini IPC 핸들러');
else fail('Gemini IPC', 'main process에 call-gemini 없음');

if (allMainCode.includes("'call-openai'")) ok('OpenAI IPC 핸들러');
else fail('OpenAI IPC', 'main process에 call-openai 없음');

if (allMainCode.includes("'call-perplexity'")) ok('Perplexity IPC 핸들러');
else fail('Perplexity IPC', 'main process에 call-perplexity 없음');

if (allMainCode.includes("'test-api-key'")) ok('KeyTest IPC 핸들러');
else fail('KeyTest IPC', 'main process에 test-api-key 없음');

// CSP in index.html
const indexHtml = fs.readFileSync('src/index.html', 'utf8');
if (indexHtml.includes("script-src 'self'")) ok('CSP: script-src self');
else fail('CSP', 'script-src self 없음');

if (indexHtml.includes("object-src 'none'")) ok('CSP: object-src none');
else fail('CSP', 'object-src none 없음');

// ═══════════════════════════════════════════════
// 4. preload.js bridge 검증
// ═══════════════════════════════════════════════
section('preload.js bridge 검증');

const preloadJs = fs.readFileSync('preload.js', 'utf8');

const requiredBridges = [
  'getSubtitle', 'getIssueLink', 'callClaude', 'callGemini', 'callOpenAI', 'callPerplexity',
  'getApiKeys', 'setApiKeys', 'clearApiKeys',
  'getSession', 'setSession', 'clearSession',
  'getStorageStatus',
  'testApiKey', 'testApiKeyDirect',
  'getUpdateStatus', 'checkForUpdate', 'installUpdate'
];

for (const bridge of requiredBridges) {
  if (preloadJs.includes(bridge)) ok(`bridge: ${bridge}`);
  else fail(`bridge: ${bridge}`, 'not found in preload.js');
}

// ═══════════════════════════════════════════════
// 5. 상태 관리 검증
// ═══════════════════════════════════════════════
section('상태 관리 검증');

const stateJs = fs.readFileSync('src/js/state.js', 'utf8');

const requiredNS = ['nav', 'auth', 'search', 'video', 'analysis', 'script', 'footage', 'voice'];
for (const ns of requiredNS) {
  if (stateJs.includes(`${ns}:`)) ok(`namespace: ${ns}`);
  else fail(`namespace: ${ns}`, 'not found');
}

const requiredExports = ['sSet', 'sGo', 'sNext', 'sPrev', 'loadProgress', 'sResetAll'];
for (const exp of requiredExports) {
  if (stateJs.includes(`export function ${exp}`) || stateJs.includes(`export async function ${exp}`)) ok(`export: ${exp}`);
  else fail(`export: ${exp}`, 'not exported');
}

// ═══════════════════════════════════════════════
// 6. Pipeline 모듈 등록 검증
// ═══════════════════════════════════════════════
section('Pipeline 등록 검증');

const pipelineDir = 'src/js/pipeline';
const pipelineFiles = fs.readdirSync(pipelineDir).filter(f => f.startsWith('step') && f.endsWith('.js'));

for (const f of pipelineFiles) {
  const content = fs.readFileSync(path.join(pipelineDir, f), 'utf8');
  if (content.includes('registerStep(')) ok(`${f}: registerStep 호출`);
  else fail(`${f}`, 'registerStep 호출 없음');
}

// ═══════════════════════════════════════════════
// 7. 버전 정합성 검증
// ═══════════════════════════════════════════════
section('버전 정합성 검증');

const proxyTs = fs.readdirSync('supabase/functions/proxy').filter(f => f.endsWith('.ts')).map(f => fs.readFileSync('supabase/functions/proxy/' + f, 'utf8')).join('\n');
const healthMatch = proxyTs.match(/version:\s*"([^"]+)"/);
if (healthMatch && /^\d+\.\d+\.\d+$/.test(healthMatch[1])) ok('proxy health version: ' + healthMatch[1]);
else fail('proxy health version', `got ${healthMatch ? healthMatch[1] : 'not found'}`);

// 파일 주석에 오래된 버전이 없는지 (HANDOFF 제외)
const srcFiles = [
  'src/client-proxy.js', 'src/client-proxy-auth.js',
  'src/client-proxy-llm.js', 'src/client-proxy-media.js',
  'src/js/state.js'
];
for (const f of srcFiles) {
  const content = fs.readFileSync(f, 'utf8');
  const firstLine = content.split('\n').slice(0, 5).join(' ');
  if (firstLine.includes('v3.3.1') || firstLine.includes('v3.1')) {
    fail(`${f} 주석 버전`, '오래된 버전 참조 발견');
  } else {
    ok(`${f} 주석 버전 OK`);
  }
}

// ═══════════════════════════════════════════════
// 8. Admin 단일화 검증
// ═══════════════════════════════════════════════
section('Admin 단일화 검증');

const srcAdmin = fs.readFileSync('src/admin.html', 'utf8');
if (srcAdmin.includes('DEPRECATED') || srcAdmin.includes('deprecated') || srcAdmin.includes('이동되었습니다')) {
  ok('src/admin.html: deprecated 처리됨');
} else {
  fail('src/admin.html', '아직 active 상태 — deprecated 처리 필요');
}

if (fs.existsSync('admin-web/index.html')) ok('admin-web/index.html: 정식 관리자 페이지 존재');
else fail('admin-web/index.html', '파일 없음');

// ═══════════════════════════════════════════════
// 9. Edge Function 구조 검증
// ═══════════════════════════════════════════════
section('Edge Function 구조 검증');

const requiredEndpoints = [
  '/auth/signup', '/auth/login', '/auth/refresh',
  '/admin/', '/api/youtube/', '/api/trends', '/api/llm', '/api/tts',
  '/api/elevenlabs/', '/api/gas', '/api/me'
];
for (const ep of requiredEndpoints) {
  if (proxyTs.includes(`"${ep}"`)) ok(`endpoint: ${ep}`);
  else if (proxyTs.includes(`'${ep}'`)) ok(`endpoint: ${ep}`);
  else if (proxyTs.includes(ep)) ok(`endpoint: ${ep}`);
  else fail(`endpoint: ${ep}`, 'not found');
}

if (proxyTs.includes('checkRate')) ok('Rate limiting 존재');
else fail('Rate limiting', 'checkRate 없음');

if (proxyTs.includes('notifySlack')) ok('Slack 알림 존재');
else fail('Slack 알림', 'notifySlack 없음');

if (proxyTs.includes('youtube_cache')) ok('캐시 테이블 사용');
else fail('캐시', 'youtube_cache 없음');

// ═══════════════════════════════════════════════
// 결과 요약
// ═══════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  총 ${passed + failed}건 | ✅ ${passed} 통과 | ❌ ${failed} 실패`);
console.log('════════════════════════════════════════');

if (errors.length > 0) {
  console.log('\n실패 항목:');
  errors.forEach(e => console.log(`  ❌ ${e.name}: ${e.reason}`));
}

process.exit(failed > 0 ? 1 : 0);
