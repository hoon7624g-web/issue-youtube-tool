// scripts/lint.js — 문법 검증 (ESM + CJS)
// 3-11: ESM 파일도 기본 구조 검증 추가
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let failed = false;
let esmChecked = 0;
let cjsChecked = 0;

function checkDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((f) => {
    if (!f.endsWith('.js')) return;
    const fp = path.join(dir, f);
    const code = fs.readFileSync(fp, 'utf8');
    const isESM = /\b(import|export)\s/.test(code);

    if (!isESM) {
      try {
        execSync(`node --check "${fp}"`, { stdio: 'pipe' });
        cjsChecked++;
      } catch (e) {
        console.error(`❌ ${fp} (CJS syntax error)`);
        failed = true;
      }
    } else {
      esmChecked++;
      const errors = [];

      // 1) import 경로 검증 — 상대 경로의 파일 존재 확인
      const importRe = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.[^'"]+)['"]/g;
      let m;
      while ((m = importRe.exec(code)) !== null) {
        const importPath = m[1];
        const resolved = path.resolve(path.dirname(fp), importPath);
        const candidates = [resolved, resolved + '.js', resolved + '/index.js'];
        const exists = candidates.some((c) => fs.existsSync(c));
        if (!exists) errors.push(`  import 경로 미존재: "${importPath}"`);
      }

      // 2) 중복 import 확인
      const importNames = {};
      const namedImportRe = /import\s+\{([^}]+)\}\s+from/g;
      while ((m = namedImportRe.exec(code)) !== null) {
        m[1]
          .split(',')
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              .trim()
          )
          .filter(Boolean)
          .forEach((name) => {
            if (importNames[name]) errors.push(`  중복 import: "${name}"`);
            importNames[name] = true;
          });
      }

      // 3) 흔한 실수 패턴 검출
      const lines = code.split('\n');
      lines.forEach((line, li) => {
        // console.log 남은 것 (디버깅용 제외)
        // 의도적 window 전역 노출
        if (
          /\bwindow\.\w+\s*=\s*(?!undefined)/.test(line) &&
          !/electronAPI|addEventListener/.test(line)
        ) {
          errors.push(`  L${li + 1}: window 전역 할당 의심 — ${line.trim().substring(0, 60)}`);
        }
      });

      if (errors.length) {
        console.error(`⚠️  ${fp} (ESM 구조 검증 경고)`);
        errors.forEach((e) => console.error(e));
        // import 경로 미존재만 실패 처리, 나머지는 경고
        if (errors.some((e) => e.includes('import 경로 미존재') || e.includes('중복 import'))) {
          failed = true;
        }
      }
    }
  });
}

checkDir('src/js');
checkDir('src/js/pipeline');
checkDir('src');
checkDir('main');

if (failed) {
  console.error('\nSyntax check failed');
  process.exit(1);
} else {
  console.log(
    `✅ Syntax check passed (CJS: ${cjsChecked}개 node --check, ESM: ${esmChecked}개 구조 검증)`
  );
}
