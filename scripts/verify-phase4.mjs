#!/usr/bin/env node
/**
 * Phase 4 Release Verification Gate (Contract v1.3).
 * Runs:
 * 1) Full Phase 1-3 regression suite (verify-phase3.mjs --ci)
 * 2) 10-night Soak Test (seed=7, nights=10 -> soak.json) asserting crashes===0 & mem_end <= 1.2*mem_start
 * 3) Leaderboard export CLI check (<run_cmd> --export-leaderboard)
 * 4) Contract v1.3 schema check on game.contract.json & bench.json (if present)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isCi = process.argv.includes('--ci');
const proofDir = isCi ? 'tmp/ci-proof-p4' : 'docs/proof/phase-4';
mkdirSync(proofDir, { recursive: true });

// 1. Run Phase 1-3 regression scenarios + Night 3 determinism
console.log('=== [1/4] Phase 1-3 Regression & Determinism ===');
const reg = spawnSync(process.execPath, ['scripts/verify-phase3.mjs', '--ci'], {
  stdio: 'inherit',
});
if (reg.status !== 0) {
  throw new Error('Phase 1-3 regression failed!');
}

// 2. Run real 10-night Soak Test (Ticket-04 Section 2)
console.log('=== [2/4] 10-Night Soak Test (seed=7, nights=10) ===');
const soakOut = isCi ? join(proofDir, 'soak.json') : 'soak.json';
const soakRun = spawnSync(
  process.execPath,
  ['dist-headless/soak.js', '--seed', '7', '--nights', '10', '--out', soakOut],
  { encoding: 'utf-8' }
);
if (soakRun.status !== 0) {
  throw new Error(`Soak test failed: ${soakRun.stderr}`);
}
console.log(soakRun.stdout.trim());

const soak = JSON.parse(readFileSync(soakOut, 'utf-8'));
if (soak.nights !== 10 || soak.crashes !== 0 || soak.results.length !== 10) {
  throw new Error(`Invalid soak result: ${JSON.stringify(soak)}`);
}
const memLimit = Number((soak.mem_start_mb * 1.2).toFixed(2));
if (soak.mem_end_mb > memLimit) {
  throw new Error(`Soak memory growth exceeded 1.2x: ${soak.mem_end_mb} > ${memLimit} MB`);
}
console.log(
  `[PASS] soak (10 nights): crashes=0, mem=${soak.mem_start_mb} -> ${soak.mem_end_mb} MB (<= ${memLimit} MB), duration=${soak.duration_s}s`
);

// 3. Verify <run_cmd> --export-leaderboard
console.log('=== [3/4] Leaderboard Export CLI Check ===');
const lbOut = join(proofDir, 'exported-leaderboard.json');
const lbRun = spawnSync(
  process.execPath,
  ['scripts/run-game.mjs', '--export-leaderboard', lbOut],
  { encoding: 'utf-8' }
);
if (lbRun.status !== 0) {
  throw new Error(`Leaderboard export failed: ${lbRun.stderr}`);
}
const lbData = JSON.parse(readFileSync(lbOut, 'utf-8'));
if (!Array.isArray(lbData.entries)) {
  throw new Error('Exported leaderboard missing entries array');
}
console.log(`[PASS] export-leaderboard -> ${lbOut} (${lbData.entries.length} entries)`);

// 4. Verify game.contract.json v1.3 & bench.json (if already generated)
console.log('=== [4/4] Contract v1.3 & Benchmark Artifact Check ===');
const contract = JSON.parse(readFileSync('game.contract.json', 'utf-8'));
if (contract.contract_version !== '1.3' || !contract.bench_cmd || !contract.soak_cmd) {
  throw new Error('game.contract.json missing v1.3 contract fields');
}

let benchSummary = 'bench.json not generated yet (run: npm run bench)';
if (existsSync('bench.json')) {
  const bench = JSON.parse(readFileSync('bench.json', 'utf-8'));
  const requiredKeys = [
    'contract_version',
    'avg_fps',
    'p1_low_fps',
    'frame_ms_p95',
    'frames',
    'load_ms',
    'peak_mem_mb',
    'vsync_off',
    'renderer',
    'os',
  ];
  for (const k of requiredKeys) {
    if (!(k in bench)) throw new Error(`bench.json missing key "${k}"`);
  }
  benchSummary = `avg_fps=${bench.avg_fps}, p1_low_fps=${bench.p1_low_fps}, frame_ms_p95=${bench.frame_ms_p95}ms, frames=${bench.frames}, load_ms=${bench.load_ms}ms, vsync_off=${bench.vsync_off}`;
  console.log(`[PASS] bench.json verified: ${benchSummary}`);
} else {
  console.log(`[INFO] ${benchSummary}`);
}

if (!isCi) {
  const summary = [
    'Phase 4 Verification Gate Summary (Contract v1.3 — v1.0.0)',
    `Node: ${process.version} | Platform: ${process.platform} ${process.arch}`,
    '',
    `Soak Test (10 nights, seed=7): crashes=${soak.crashes}, mem=${soak.mem_start_mb} -> ${soak.mem_end_mb} MB (limit <= ${memLimit} MB), duration=${soak.duration_s}s`,
    `Soak Results: ${JSON.stringify(soak.results)}`,
    `Leaderboard Export: PASS (${lbData.entries.length} entries)`,
    `Benchmark (bench.json): ${benchSummary}`,
    '',
  ].join('\n');
  writeFileSync(join(proofDir, 'summary.txt'), summary, 'utf-8');
}
