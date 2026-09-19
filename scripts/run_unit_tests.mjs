// scripts/run_unit_tests.mjs — 跑所有 unit test 脚本 (Sprint 5 C7)
//
// 替代 vitest/jest, 用 node:test 内置
// 输出: PASS / FAIL + 总计

import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const tests = readdirSync(__dirname)
  .filter((f) => f.startsWith('test_') && f.endsWith('.mjs'))
  .sort();

console.log(`\n🧪 Unit Tests — ${tests.length} 个测试文件\n`);
console.log('═'.repeat(70));

let totalPass = 0;
let totalFail = 0;
let totalFiles = 0;

for (const f of tests) {
  totalFiles++;
  process.stdout.write(`  ${f.padEnd(40)} `);
  const result = await new Promise((resolve) => {
    const p = spawn('node', ['--test', f], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => out += d.toString());
    p.stderr.on('data', (d) => err += d.toString());
    p.on('close', (code) => resolve({ code, out, err }));
  });
  // 解析 pass/fail — Node 24 末尾输出 "ℹ pass N" / "ℹ fail N" / "ℹ skipped N"
  // fallback: 数 ✔/✖ 字符
  const passMatch = result.out.match(/ℹ\s*pass\s*(\d+)/i);
  const failMatch = result.out.match(/ℹ\s*fail\s*(\d+)/i);
  let pass = passMatch ? parseInt(passMatch[1], 10) : 0;
  let fail = failMatch ? parseInt(failMatch[1], 10) : 0;
  if (!passMatch && !failMatch) {
    const okCount = (result.out.match(/✔/g) || []).length;
    const failCount = (result.out.match(/✖/g) || []).length;
    pass = okCount;
    fail = failCount;
  }
  const skipMatch = result.out.match(/ℹ\s*skipped\s*(\d+)/i);
  totalPass += pass;
  totalFail += fail;
  if (result.code === 0 && fail === 0) {
    console.log(`✅ PASS  (${pass} tests)`);
  } else {
    console.log(`❌ FAIL  (${fail} fail / ${pass} pass)`);
    if (result.err) console.log('  ' + result.err.split('\n').slice(0, 3).join('\n  '));
  }
}

console.log('═'.repeat(70));
console.log(`\n📊 Total: ${totalFiles} files · ${totalPass} pass · ${totalFail} fail\n`);
process.exit(totalFail > 0 ? 1 : 0);