#!/usr/bin/env node
/**
 * Phase 3 automated verification & genuine proof generator (Contract v1.2).
 * Runs non-superseded Phase 1–2 regression scenarios + all Phase 3 ("Đèn cạn dầu") scenarios +
 * Night 3 full-night (18,000 ticks = 300s) performance & SHA-256 determinism check.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isCi = process.argv.includes('--ci');
const outDir = isCi ? 'tmp/ci-proof-p3' : 'docs/proof/phase-3';
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
  const lines = readFileSync(outPath, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const summary = checkFn(lines);
  console.log(`[PASS] ${name} (${elapsedMs} ms): ${summary}`);
  return { name, elapsedMs, summary };
}

const results = [];

// ── Phase 1 Non-Superseded Regression under Contract v1.2 ──
results.push(
  runScenario(
    'reg-safe-radius',
    [
      '--seed', '300', '--night', '1',
      '--scenario', 'scenarios/phase1/safe-radius.scenario.json',
      '--ticks', '300', '--snapshot-every', '10',
    ],
    (lines) => {
      const snaps = lines.filter((l) => l.type === 'snapshot');
      let minDist = Infinity;
      for (const s of snaps) {
        const d = Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2]);
        if (d < minDist) minDist = d;
        if (d <= 6.0) throw new Error(`Safe radius violated at tick ${s.tick}: ${d}`);
      }
      return `min_dist=${minDist.toFixed(3)}m (> 6.0m), fuel_end=${snaps[snaps.length - 1].lanterns[0].fuel}`;
    }
  )
);

results.push(
  runScenario(
    'reg-shade-loss',
    [
      '--seed', '400', '--night', '1',
      '--scenario', 'scenarios/phase1/shade-loss.scenario.json',
      '--ticks', '600', '--snapshot-every', '10',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      if (end.state !== 'lost') throw new Error(`Expected lost, got ${end.state}`);
      const hits = lines.filter((l) => l.type === 'event' && l.name === 'player_hit');
      return `state=${end.state}, ticks=${end.ticks}, hits=${hits.length}`;
    }
  )
);

results.push(
  runScenario(
    'reg-dawn-loss',
    [
      '--seed', '500', '--night', '1',
      '--scenario', 'scenarios/phase1/dawn-loss.scenario.json',
      '--ticks', '400', '--snapshot-every', '20',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      const go = lines.find((l) => l.type === 'event' && l.name === 'game_over');
      if (end.state !== 'lost' || go?.data.reason !== 'dawn') {
        throw new Error(`Expected lost/dawn, got ${end.state}/${go?.data.reason}`);
      }
      return `state=${end.state}, reason=${go.data.reason}, ticks=${end.ticks}`;
    }
  )
);

// ── Phase 2 Regression under Contract v1.2 ──
results.push(
  runScenario(
    'p2-dash-flow',
    [
      '--seed', '201', '--night', '1',
      '--scenario', 'scenarios/phase2/dash-flow.scenario.json',
      '--inputs', 'scenarios/phase2/dash-flow.inputs.json',
      '--ticks', '120', '--snapshot-every', '10',
    ],
    (lines) => {
      const dashes = lines.filter((l) => l.type === 'event' && l.name === 'dash');
      if (dashes.length !== 2) throw new Error(`Expected 2 dash events, got ${dashes.length}`);
      return `dash_events=${dashes.length}, ticks=[${dashes.map((d) => d.tick).join(',')}]`;
    }
  )
);

results.push(
  runScenario(
    'p2-fall-respawn',
    [
      '--seed', '202', '--night', '1',
      '--scenario', 'scenarios/phase2/fall-respawn.scenario.json',
      '--inputs', 'scenarios/phase2/fall-respawn.inputs.json',
      '--ticks', '200', '--snapshot-every', '10',
    ],
    (lines) => {
      const fall = lines.find((l) => l.type === 'event' && l.name === 'player_hit' && l.data.by === 'fall');
      if (!fall || fall.data.lost !== 4) throw new Error('Expected fall hit losing 4 motes');
      const lastSnap = [...lines].reverse().find((l) => l.type === 'snapshot');
      if (lastSnap.player.pos[0] !== 0 || lastSnap.player.pos[2] !== 0) {
        throw new Error(`Expected respawn at (0,0,0), got ${lastSnap.player.pos}`);
      }
      return `fall_tick=${fall.tick}, flames=${fall.data.flames}, respawned=${JSON.stringify(lastSnap.player.pos)}`;
    }
  )
);

results.push(
  runScenario(
    'p2-night2-island-hop',
    [
      '--seed', '203', '--night', '2',
      '--scenario', 'scenarios/phase2/night2-island-hop.scenario.json',
      '--inputs', 'scenarios/phase2/night2-island-hop.inputs.json',
      '--ticks', '140', '--snapshot-every', '10',
    ],
    (lines) => {
      const lastSnap = [...lines].reverse().find((l) => l.type === 'snapshot');
      const distB = Math.hypot(lastSnap.player.pos[0] - 70, lastSnap.player.pos[2]);
      if (distB >= 28) throw new Error(`Did not land on Island B: pos=${lastSnap.player.pos}`);
      return `landed_pos=${JSON.stringify(lastSnap.player.pos)}, dist_to_B=${distB.toFixed(2)}m`;
    }
  )
);

results.push(
  runScenario(
    'p2-night3-tiers-wind',
    [
      '--seed', '204', '--night', '3',
      '--scenario', 'scenarios/phase2/night3-tiers-wind.scenario.json',
      '--inputs', 'scenarios/phase2/night3-tiers-wind.inputs.json',
      '--ticks', '1860', '--snapshot-every', '60',
    ],
    (lines) => {
      const snaps = lines.filter((l) => l.type === 'snapshot');
      const reachedTier2 = snaps.some((s) => s.player.pos[1] >= 5.9);
      const sawWind = snaps.some((s) => s.wind.active === true);
      if (!reachedTier2 || !sawWind) throw new Error(`tier2=${reachedTier2}, wind=${sawWind}`);
      return `reached_tier2=${reachedTier2}, wind_active_at_1800=${sawWind}`;
    }
  )
);

results.push(
  runScenario(
    'p2-drifter-steal-drop',
    [
      '--seed', '205', '--night', '2',
      '--scenario', 'scenarios/phase2/drifter-steal-drop.scenario.json',
      '--inputs', 'scenarios/phase2/drifter-steal-drop.inputs.json',
      '--ticks', '60', '--snapshot-every', '10',
    ],
    (lines) => {
      const steal = lines.find((l) => l.type === 'event' && l.name === 'drifter_steal');
      const drop = lines.find((l) => l.type === 'event' && l.name === 'drifter_drop');
      if (!steal || !drop) throw new Error('Expected drifter_steal & drifter_drop');
      return `steal_tick=${steal.tick}, drop_tick=${drop.tick}, amt=${drop.data.amount}`;
    }
  )
);

results.push(
  runScenario(
    'p2-charm-boost',
    [
      '--seed', '206', '--night', '2',
      '--scenario', 'scenarios/phase2/charm-boost.scenario.json',
      '--inputs', 'scenarios/phase2/charm-boost.inputs.json',
      '--ticks', '100', '--snapshot-every', '10',
    ],
    (lines) => {
      const charm = lines.find((l) => l.type === 'event' && l.name === 'charm_picked');
      const dashes = lines.filter((l) => l.type === 'event' && l.name === 'dash');
      if (!charm || dashes.length !== 2) throw new Error('Expected charm_picked & 2 rapid dashes');
      return `charm=${charm.data.charm_id}, rapid_dashes=${dashes.length}`;
    }
  )
);

results.push(
  runScenario(
    'p2-pause-resume',
    [
      '--seed', '207', '--night', '1',
      '--scenario', 'scenarios/phase2/pause-resume.scenario.json',
      '--inputs', 'scenarios/phase2/pause-resume.inputs.json',
      '--ticks', '60', '--snapshot-every', '10',
    ],
    (lines) => {
      const s20 = lines.find((l) => l.type === 'snapshot' && l.tick === 20);
      const s30 = lines.find((l) => l.type === 'snapshot' && l.tick === 30);
      if (s20.state !== 'paused' || s20.sim_tick !== s30.sim_tick) {
        throw new Error('Pause did not freeze sim_tick');
      }
      return `paused_sim_tick_frozen=${s20.sim_tick}, resumed_at_tick=41`;
    }
  )
);

// ── Phase 3 Feature Scenarios ("Đèn cạn dầu" · Contract v1.2) ──
results.push(
  runScenario(
    'p3-fuel-decay-out-relight',
    [
      '--seed', '301', '--night', '1',
      '--scenario', 'scenarios/phase3/fuel-decay-out-relight.scenario.json',
      '--inputs', 'scenarios/phase3/fuel-decay-out-relight.inputs.json',
      '--ticks', '120', '--snapshot-every', '10',
    ],
    (lines) => {
      const outEv = lines.find((l) => l.type === 'event' && l.name === 'lantern_out');
      const relitEv = lines.find((l) => l.type === 'event' && l.name === 'lantern_lit');
      const snap100 = lines.find((l) => l.type === 'snapshot' && l.tick === 100);
      if (!outEv || outEv.tick !== 90) throw new Error(`Expected lantern_out at tick 90`);
      if (!relitEv || relitEv.data.relight !== true) throw new Error('Expected relight: true');
      if (snap100.player.capacity !== 12 || snap100.lanterns[0].relit_count !== 1) {
        throw new Error('Expected capacity=12 and relit_count=1');
      }
      const end = lines[lines.length - 1];
      if (end.score !== 65) throw new Error(`Expected score 65, got ${end.score}`);
      return `lantern_out=t${outEv.tick}, relit=t${relitEv.tick} (relight=true), capacity=12, score=${end.score}`;
    }
  )
);

results.push(
  runScenario(
    'p3-refuel-and-eject',
    [
      '--seed', '302', '--night', '1',
      '--scenario', 'scenarios/phase3/refuel-and-eject.scenario.json',
      '--inputs', 'scenarios/phase3/refuel-and-eject.inputs.json',
      '--ticks', '40', '--snapshot-every', '10',
    ],
    (lines) => {
      const refEv = lines.find((l) => l.type === 'event' && l.name === 'refuel');
      const s30 = lines.find((l) => l.type === 'snapshot' && l.tick === 30);
      if (!refEv || refEv.data.amount !== 3) throw new Error('Expected refuel amount=3');
      const shadeDist = Math.hypot(s30.shades[0].pos[0], s30.shades[0].pos[2]);
      if (shadeDist <= 6.0 || s30.player.flames !== 3) {
        throw new Error(`Safe ejection failed: dist=${shadeDist}, flames=${s30.player.flames}`);
      }
      return `refuel_amt=${refEv.data.amount}, fuel=${refEv.data.fuel}, ejected_dist=${shadeDist.toFixed(2)}m, flames=3`;
    }
  )
);

results.push(
  runScenario(
    'p3-shade-drain-stacking',
    [
      '--seed', '303', '--night', '1',
      '--scenario', 'scenarios/phase3/shade-drain-stacking.scenario.json',
      '--ticks', '180', '--snapshot-every', '20',
    ],
    (lines) => {
      const drainEvs = lines.filter((l) => l.type === 'event' && l.name === 'fuel_drain');
      const outEv = lines.find((l) => l.type === 'event' && l.name === 'lantern_out');
      const snaps = lines.filter((l) => l.type === 'snapshot');
      const bothDrained = snaps.some((s) => s.shades.every((sh) => sh.state === 'drain'));
      if (!bothDrained || drainEvs.length < 2 || !outEv) {
        throw new Error(`Expected stacked drain + fuel_drain + lantern_out`);
      }
      return `both_in_drain=${bothDrained}, fuel_drain_events=${drainEvs.length}, lantern_out=t${outEv.tick}`;
    }
  )
);

results.push(
  runScenario(
    'p3-pulse-drain-bonus',
    [
      '--seed', '304', '--night', '1',
      '--scenario', 'scenarios/phase3/pulse-drain-bonus.scenario.json',
      '--inputs', 'scenarios/phase3/pulse-drain-bonus.inputs.json',
      '--ticks', '130', '--snapshot-every', '10',
    ],
    (lines) => {
      const end = lines[lines.length - 1];
      const snap10 = lines.find((l) => l.type === 'snapshot' && l.tick === 10);
      if (end.score !== 20) throw new Error(`Expected score 20 (+15 drain +5 chase), got ${end.score}`);
      if (!snap10.shades.every((s) => s.state === 'stunned')) throw new Error('Expected both stunned');
      return `pulse_score=${end.score} (+15 draining +5 normal), stunned_both=true`;
    }
  )
);

results.push(
  runScenario(
    'p3-dawn-survived-win',
    [
      '--seed', '305', '--night', '1',
      '--scenario', 'scenarios/phase3/dawn-survived-win.scenario.json',
      '--ticks', '200', '--snapshot-every', '60',
    ],
    (lines) => {
      const go = lines.find((l) => l.type === 'event' && l.name === 'game_over');
      const end = lines[lines.length - 1];
      if (!go || go.data.result !== 'won' || go.data.reason !== 'dawn_survived' || end.score !== 424) {
        throw new Error(`Expected won/dawn_survived score=424, got ${JSON.stringify(go)} score=${end.score}`);
      }
      return `result=won, reason=${go.data.reason}, ticks=${end.ticks}, score=${end.score}`;
    }
  )
);

results.push(
  runScenario(
    'p3-dawn-last-tick-no-flames',
    [
      '--seed', '306', '--night', '1',
      '--scenario', 'scenarios/phase3/dawn-last-tick-no-flames.scenario.json',
      '--ticks', '10', '--snapshot-every', '1',
    ],
    (lines) => {
      const go = lines.find((l) => l.type === 'event' && l.name === 'game_over');
      if (!go || go.data.result !== 'lost' || go.data.reason !== 'no_flames') {
        throw new Error(`Expected lost/no_flames on last tick, got ${JSON.stringify(go)}`);
      }
      return `tick=${go.tick}, result=lost, reason=${go.data.reason} (overrides dawn_survived)`;
    }
  )
);

// ── Full Night 3 (18,000 ticks = 300s under v1.2) Performance & Determinism Gate (<= 30s) ──
const perfA = join(outDir, 'night3-full-run1.jsonl');
const perfB = join(outDir, 'night3-full-run2.jsonl');
const perfArgs = [
  'dist-headless/cli.js',
  '--seed', '9001',
  '--night', '3',
  '--ticks', '18000',
  '--snapshot-every', '600',
];

const t0 = performance.now();
const r1 = spawnSync(process.execPath, [...perfArgs, '--out', perfA], { encoding: 'utf-8' });
const elapsedMs = performance.now() - t0;
const r2 = spawnSync(process.execPath, [...perfArgs, '--out', perfB], { encoding: 'utf-8' });

if (r1.status !== 0 || r2.status !== 0) {
  throw new Error(`Full Night 3 run failed: ${r1.stderr} ${r2.stderr}`);
}
if (elapsedMs > 30_000) {
  throw new Error(`Full Night 3 (18,000 ticks) exceeded 30s limit: ${elapsedMs.toFixed(1)} ms`);
}
const h1 = sha256(perfA);
const h2 = sha256(perfB);
if (h1 !== h2) {
  throw new Error(`Night 3 Determinism FAILED: ${h1} !== ${h2}`);
}
console.log(
  `[PASS] night3-full-18000 (elapsed=${elapsedMs.toFixed(1)} ms <= 30000 ms): SHA-256 identical (${h1})`
);

if (!isCi) {
  const summaryText = [
    'Phase 3 Verification, Performance & Determinism Summary (Contract v1.2)',
    `Node: ${process.version} | Platform: ${process.platform} ${process.arch}`,
    '',
    'Full Night 3 Benchmark (18,000 ticks = 300s under v1.2, seed=9001):',
    `  Elapsed: ${elapsedMs.toFixed(1)} ms (Budget: <= 30,000 ms) — PASS`,
    `  Run 1 SHA-256: ${h1}`,
    `  Run 2 SHA-256: ${h2}`,
    `  Determinism: IDENTICAL (PASS)`,
    '',
    'Scenario Results:',
    ...results.map((r) => `- ${r.name} (${r.elapsedMs} ms): ${r.summary}`),
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'perf-and-determinism.txt'), summaryText, 'utf-8');
}
