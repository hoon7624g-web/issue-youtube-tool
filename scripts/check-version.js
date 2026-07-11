// ═══════════════════════════════════════════════
// scripts/check-version.js — 릴리즈 버전 정합성 체크
// CI/배포 전 실행: node scripts/check-version.js
// RELEASE_TAG 환경변수가 있으면 태그와도 비교
// ═══════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));
const pkgVer = pkg.version;

console.log('[version-check] package.json:', pkgVer);

// ── 1) main.js 주석 버전과 비교 ──
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const mainMatch = mainJs.match(/main\.js\s*—\s*Electron Main Process\s*\(v([\d.]+)\)/);
if (mainMatch) {
  const mainVer = mainMatch[1];
  if (mainVer !== pkgVer) {
    console.error(`[version-check] ❌ main.js 주석 버전(${mainVer}) ≠ package.json(${pkgVer})`);
    process.exit(1);
  }
  console.log('[version-check] main.js 주석: OK');
}

// ── 2) RELEASE_TAG 환경변수와 비교 (CI용) ──
const tag = (process.env.RELEASE_TAG || '').replace(/^v/, '');
if (tag) {
  if (tag !== pkgVer) {
    console.error(`[version-check] ❌ RELEASE_TAG(${tag}) ≠ package.json(${pkgVer})`);
    process.exit(1);
  }
  console.log('[version-check] RELEASE_TAG:', tag, 'OK');
} else {
  console.log('[version-check] RELEASE_TAG 미설정 (로컬 빌드)');
}

console.log('[version-check] ✅ 버전 정합성 확인 완료');
