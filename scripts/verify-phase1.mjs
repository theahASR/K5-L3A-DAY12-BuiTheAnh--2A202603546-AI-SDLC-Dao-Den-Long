#!/usr/bin/env node
/**
 * Phase 1 automated verification & genuine proof generator.
 * Runs all Phase 1 headless scenarios + determinism SHA-256 check
 * and writes genuine outputs to docs/proof/phase-1/ (unless --ci mode).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isCi = process.argv.includes('--ci');
const outDir = isCi ? 'tmp/ci-proof' : 'docs/proof/phase-1';
mkdirSync(outDir, { recursive: true });

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function runScenario(name, args, checkFn) {
  const outPath = join(outDir, `${name}.jsonl`);
  const fullArgs = ['dist-headless/cli.js', ...args, '--out', outPath];
  const start = performance.now();
  const res = spawnSync(process.execPath, fullArgs, { encoding: 'utf-8' });
  const elapsedMs = (performance.now() - start).toFixed(1);

  if (res.status !== 0) {
    throw new Error(`Scenario "${name}" exited with code ${res.status}: ${res.stderr}`);
  }
  const lines = readFileSync(outPath, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const summary = checkFn(lines);
  console.log(`[PASS] ${name} (${elapsedMs} ms): ${summary}`);
  return { name, outPath, elapsedMs, summary, end: lines[lines.length - 1] };
}

const results = [];

results.push(
  runScenario(
    'win-flow',
    [
      '--seed', '100',
      '--night', '1',
      '--scenario', 'scenarios/phase1/win-flow.scenario.json',
      '--inputs', 'scenarios/phase1/win-flow.inputs.json',
      '--ticks', '600',
      '--snapshot-every', '10',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      if (end.state !== 'won') throw new Error(`Expected won, got ${end.state}`);
      const events = lines.filter((l) => l.type === 'event');
      const picked = events.filter((e) => e.name === 'mote_picked').length;
      if (picked !== 5) throw new Error(`Expected 5 mote_picked, got ${picked}`);
      return `state=${end.state}, ticks=${end.ticks}, score=${end.score}, motes_picked=${picked}`;
    }
  )
);

results.push(
  runScenario(
    'pulse-stun',
    [
      '--seed', '200',
      '--night', '1',
      '--scenario', 'scenarios/phase1/pulse-stun.scenario.json',
      '--inputs', 'scenarios/phase1/pulse-stun.inputs.json',
      '--ticks', '220',
      '--snapshot-every', '10',
    ],
    (lines) => {
      const pulseEvents = lines.filter((l) => l.type === 'event' && l.name === 'pulse');
      if (pulseEvents.length !== 1) throw new Error(`Expected 1 pulse event (cooldown blocks 2nd), got ${pulseEvents.length}`);
      const snap10 = lines.find((l) => l.type === 'snapshot' && l.tick === 10);
      const snap210 = lines.find((l) => l.type === 'snapshot' && l.tick === 210);
      if (snap10.shades[0].state !== 'stunned') throw new Error('Expected S1 stunned at tick 10');
      if (snap210.shades[0].state !== 'chase') throw new Error('Expected S1 recovered to chase at tick 210');
      return `pulse_events=1, S1_tick10=${snap10.shades[0].state} (x=${snap10.shades[0].pos[0]}), S1_tick210=${snap210.shades[0].state}`;
    }
  )
);

results.push(
  runScenario(
    'safe-radius',
    [
      '--seed', '300',
      '--night', '1',
      '--scenario', 'scenarios/phase1/safe-radius.scenario.json',
      '--ticks', '300',
      '--snapshot-every', '10',
    ],
    (lines) => {
      const snaps = lines.filter((l) => l.type === 'snapshot');
      let minDist = Infinity;
      for (const s of snaps) {
        const d = Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2]);
        if (d < minDist) minDist = d;
        if (d <= 6.0) throw new Error(`Shade violated safe_radius at tick ${s.tick}: dist=${d}`);
      }
      return `min_shade_dist=${minDist.toFixed(3)}m (> 6.0m), flames_end=${snaps[snaps.length - 1].player.flames}`;
    }
  )
);

results.push(
  runScenario(
    'shade-loss',
    [
      '--seed', '400',
      '--night', '1',
      '--scenario', 'scenarios/phase1/shade-loss.scenario.json',
      '--ticks', '600',
      '--snapshot-every', '10',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      const hits = lines.filter((l) => l.type === 'event' && l.name === 'player_hit');
      const go = lines.find((l) => l.type === 'event' && l.name === 'game_over');
      if (end.state !== 'lost' || go?.data?.reason !== 'no_flames') {
        throw new Error(`Expected lost/no_flames, got ${end.state}/${go?.data?.reason}`);
      }
      return `state=${end.state}, reason=${go.data.reason}, ticks=${end.ticks}, hits=${hits.length}, first_drop=${hits[0].data.dropped}`;
    }
  )
);

results.push(
  runScenario(
    'dawn-loss',
    [
      '--seed', '500',
      '--night', '1',
      '--scenario', 'scenarios/phase1/dawn-loss.scenario.json',
      '--ticks', '200',
      '--snapshot-every', '20',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      const go = lines.find((l) => l.type === 'event' && l.name === 'game_over');
      if (end.state !== 'lost' || go?.data?.reason !== 'dawn' || end.ticks !== 120) {
        throw new Error(`Expected lost/dawn at tick 120, got ${end.state}/${go?.data?.reason} at ${end.ticks}`);
      }
      return `state=${end.state}, reason=${go.data.reason}, ticks=${end.ticks}`;
    }
  )
);

// Determinism check: run 3000 ticks (50s with random motes + random shades) twice and compare SHA-256
const detA = join(outDir, 'determinism-run1.jsonl');
const detB = join(outDir, 'determinism-run2.jsonl');
const detArgs = [
  'dist-headless/cli.js',
  '--seed', '1337',
  '--night', '1',
  '--inputs', 'scenarios/phase1/full-random.inputs.json',
  '--ticks', '3000',
  '--snapshot-every', '30',
];
const r1 = spawnSync(process.execPath, [...detArgs, '--out', detA], { encoding: 'utf-8' });
const r2 = spawnSync(process.execPath, [...detArgs, '--out', detB], { encoding: 'utf-8' });
if (r1.status !== 0 || r2.status !== 0) {
  throw new Error(`Determinism run failed: ${r1.stderr} ${r2.stderr}`);
}
const hash1 = sha256(detA);
const hash2 = sha256(detB);
if (hash1 !== hash2) {
  throw new Error(`Determinism FAILED: ${hash1} !== ${hash2}`);
}
console.log(`[PASS] determinism (3000 ticks, seed=1337): SHA-256 identical (${hash1})`);

if (!isCi) {
  const detSummary = [
    'Determinism Verification (Phase 1 — Test Contract v1.0)',
    `Command: node dist-headless/cli.js --seed 1337 --night 1 --inputs scenarios/phase1/full-random.inputs.json --ticks 3000 --snapshot-every 30`,
    `Run 1 SHA-256: ${hash1}`,
    `Run 2 SHA-256: ${hash2}`,
    `Result: IDENTICAL (PASS)`,
    '',
    'Scenario Summary:',
    ...results.map((r) => `- ${r.name}: ${r.summary} (${r.elapsedMs} ms)`),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'determinism.txt'), detSummary, 'utf-8');
}
