import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TUNING } from '../src/core/config';

const CLI_PATH = 'dist-headless/cli.js';
let workDir: string;

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf-8',
  });
}

function parseJsonl(filePath: string) {
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  return lines.map((line) => JSON.parse(line));
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-v12-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Headless CLI — Test Contract v1.2, Phase 1–2 Regression & Phase 3 Scenarios', () => {
  it('Phase 1–2 regression (updated for Ticket-03 v1.2): win-flow lights L1 without early all_lit win and emits v1.2 schema', () => {
    // Updated from Phase 1/2 -> Phase 3 (Ticket-03 Contract v1.2):
    // [THAY THẾ] Lighting all 5 lanterns no longer triggers early `all_lit` win; simulation continues playing until dawn,
    // lantern_lit includes `relight: false`, player snapshot includes `capacity` (10 -> 12), and lanterns include `fuel`, `ever_lit`, `relit_count`.
    const outPath = join(workDir, 'win-flow-v12.jsonl');
    const res = runCli([
      '--seed', '100',
      '--night', '1',
      '--scenario', 'scenarios/phase1/win-flow.scenario.json',
      '--inputs', 'scenarios/phase1/win-flow.inputs.json',
      '--ticks', '120',
      '--snapshot-every', '10',
      '--out', outPath,
    ]);

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const snap0 = records[0];
    expect(snap0.type).toBe('snapshot');
    expect(snap0.tick).toBe(0);
    expect(snap0.night).toBe(1);
    expect(snap0.player).toHaveProperty('capacity', 10);
    expect(snap0.lanterns[0]).toMatchObject({
      id: 'L1',
      lit: false,
      fuel: 0,
      ever_lit: false,
      relit_count: 0,
    });
    expect(snap0.lanterns[1]).toMatchObject({
      id: 'L2',
      lit: true,
      fuel: 100,
      ever_lit: true,
      relit_count: 0,
    });

    const events = records.filter((r) => r.type === 'event');
    expect(events.some((e) => e.name === 'night_start' && e.data.night === 1)).toBe(true);
    expect(events.filter((e) => e.name === 'mote_picked')).toHaveLength(5);
    expect(
      events.some(
        (e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1' && e.data.relight === false
      )
    ).toBe(true);
    // No early win on lighting all lanterns!
    expect(events.some((e) => e.name === 'game_over')).toBe(false);

    const end = records[records.length - 1];
    // Score = 5 deposited * 5 + 100 first light = 125
    expect(end).toMatchObject({ type: 'end', ticks: 120, state: 'playing', score: 125 });

    const lastSnap = [...records].reverse().find((r) => r.type === 'snapshot');
    expect(lastSnap.player.capacity).toBe(12);
    expect(lastSnap.lanterns[0].lit).toBe(true);
    expect(lastSnap.lanterns[0].fuel).toBeGreaterThan(95);
    expect(lastSnap.lanterns[0].ever_lit).toBe(true);
  });

  it('Phase 2 regression: supports --night 2 (jump pad + bridge) and --night 3 (tiers + wind)', () => {
    const out2 = join(workDir, 'night2.jsonl');
    const r2 = runCli([
      '--seed', '202',
      '--night', '2',
      '--scenario', 'scenarios/phase2/night2-island-hop.scenario.json',
      '--inputs', 'scenarios/phase2/night2-island-hop.inputs.json',
      '--ticks', '140',
      '--snapshot-every', '20',
      '--out', out2,
    ]);
    expect(r2.status).toBe(0);
    const snaps2 = parseJsonl(out2).filter((r) => r.type === 'snapshot');
    const lastSnap2 = snaps2[snaps2.length - 1];
    expect(lastSnap2.night).toBe(2);
    expect(Math.hypot(lastSnap2.player.pos[0] - 70, lastSnap2.player.pos[2])).toBeLessThan(28);

    const out3 = join(workDir, 'night3.jsonl');
    const r3 = runCli([
      '--seed', '303',
      '--night', '3',
      '--scenario', 'scenarios/phase2/night3-tiers-wind.scenario.json',
      '--inputs', 'scenarios/phase2/night3-tiers-wind.inputs.json',
      '--ticks', '1850',
      '--snapshot-every', '100',
      '--out', out3,
    ]);
    expect(r3.status).toBe(0);
    const snaps3 = parseJsonl(out3).filter((r) => r.type === 'snapshot');
    expect(snaps3.some((s) => s.player.pos[1] >= 5.9)).toBe(true);
    expect(snaps3.some((s) => s.wind.active === true)).toBe(true);
  });

  it('Phase 2 regression: pause/resume freezes sim_tick & time_left_s and emits paused/resumed events', () => {
    const outPath = join(workDir, 'pause.jsonl');
    const res = runCli([
      '--seed', '77',
      '--night', '1',
      '--scenario', 'scenarios/phase2/pause-resume.scenario.json',
      '--inputs', 'scenarios/phase2/pause-resume.inputs.json',
      '--ticks', '60',
      '--snapshot-every', '10',
      '--out', outPath,
    ]);
    expect(res.status).toBe(0);
    const recs = parseJsonl(outPath);
    expect(recs.some((r) => r.type === 'event' && r.name === 'paused')).toBe(true);
    expect(recs.some((r) => r.type === 'event' && r.name === 'resumed')).toBe(true);
    const snap20 = recs.find((r) => r.type === 'snapshot' && r.tick === 20);
    const snap30 = recs.find((r) => r.type === 'snapshot' && r.tick === 30);
    expect(snap20.state).toBe('paused');
    expect(snap30.state).toBe('paused');
    expect(snap20.sim_tick).toBe(snap30.sim_tick);
    expect(snap20.time_left_s).toBe(snap30.time_left_s);
  });

  it('Phase 3: fuel decay -> lantern_out -> relight (5 motes, +40, relit_count=1, capacity=12)', () => {
    const outPath = join(workDir, 'p3-relight.jsonl');
    const res = runCli([
      '--seed', '301',
      '--night', '1',
      '--scenario', 'scenarios/phase3/fuel-decay-out-relight.scenario.json',
      '--inputs', 'scenarios/phase3/fuel-decay-out-relight.inputs.json',
      '--ticks', '120',
      '--snapshot-every', '10',
      '--out', outPath,
    ]);
    expect(res.status).toBe(0);
    const recs = parseJsonl(outPath);
    const outEv = recs.find((r) => r.type === 'event' && r.name === 'lantern_out');
    const relitEv = recs.find((r) => r.type === 'event' && r.name === 'lantern_lit');
    expect(outEv).toMatchObject({ tick: 90, data: { lantern_id: 'L1' } });
    expect(relitEv).toMatchObject({ tick: 100, data: { lantern_id: 'L1', relight: true } });
    const end = recs[recs.length - 1];
    // 5 motes * 5 + 40 relight = 65
    expect(end.score).toBe(65);
    const snap100 = recs.find((r) => r.type === 'snapshot' && r.tick === 100);
    expect(snap100.player.capacity).toBe(12);
    expect(snap100.lanterns[0]).toMatchObject({
      id: 'L1',
      lit: true,
      fuel: 100,
      ever_lit: true,
      relit_count: 1,
    });
  });

  it('Phase 3: dawn_survived win & exact dawn bonus; last-tick no_flames priority', () => {
    const outWin = join(workDir, 'p3-dawn-win.jsonl');
    const rWin = runCli([
      '--seed', '305',
      '--night', '1',
      '--scenario', 'scenarios/phase3/dawn-survived-win.scenario.json',
      '--ticks', '200',
      '--snapshot-every', '60',
      '--out', outWin,
    ]);
    expect(rWin.status).toBe(0);
    const winRecs = parseJsonl(outWin);
    const winEv = winRecs.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(winEv).toMatchObject({ tick: 120, data: { result: 'won', reason: 'dawn_survived' } });
    // After 120t (2.0s), fuels are 58, 38, 78 -> (50+58)+(50+38)+(50+78) + 2*50 = 108+88+128+100 = 424
    expect(winRecs[winRecs.length - 1]).toMatchObject({
      type: 'end',
      ticks: 120,
      state: 'won',
      score: 424,
    });

    const outLoss = join(workDir, 'p3-last-tick.jsonl');
    const rLoss = runCli([
      '--seed', '306',
      '--night', '1',
      '--scenario', 'scenarios/phase3/dawn-last-tick-no-flames.scenario.json',
      '--ticks', '10',
      '--snapshot-every', '1',
      '--out', outLoss,
    ]);
    expect(rLoss.status).toBe(0);
    const lossRecs = parseJsonl(outLoss);
    const lossEv = lossRecs.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(lossEv).toMatchObject({ tick: 1, data: { result: 'lost', reason: 'no_flames' } });
  });

  it('Phase 3: full Night 3 (18,000 ticks under v1.2 300s duration) is deterministic and finishes well under 30s', () => {
    const outA = join(workDir, 'perf-a.jsonl');
    const outB = join(workDir, 'perf-b.jsonl');
    const args = [
      '--seed', '9001',
      '--night', '3',
      '--ticks', '21600',
      '--snapshot-every', '600',
    ];

    const t0 = performance.now();
    const resA = runCli([...args, '--out', outA]);
    const elapsedMs = performance.now() - t0;
    const resB = runCli([...args, '--out', outB]);

    expect(resA.status).toBe(0);
    expect(resB.status).toBe(0);
    expect(elapsedMs).toBeLessThan(30_000);
    expect(readFileSync(outA, 'utf-8')).toBe(readFileSync(outB, 'utf-8'));

    const recs = parseJsonl(outA);
    expect(recs[0].time_left_s).toBe(TUNING.night3_duration_s); // 300s in v1.2
    const end = recs[recs.length - 1];
    expect(end.ticks).toBeLessThanOrEqual(18000);
  });

  it('exits with code 2 on invalid v1.2 shade state, out-of-range fuel, or non-monotonic input ticks', () => {
    const badScenario = join(workDir, 'bad-shade-state.json');
    writeFileSync(
      badScenario,
      JSON.stringify({
        shades: [{ id: 'S1', pos: [5, 1, 0], state: 'flee' }],
      })
    );
    const res1 = runCli([
      '--seed', '1',
      '--night', '1',
      '--scenario', badScenario,
      '--ticks', '60',
      '--out', join(workDir, 'unused1.jsonl'),
    ]);
    expect(res1.status).toBe(2);
    expect(res1.stderr).toContain('spawning');
    expect(res1.stderr).toContain('drain');

    const badFuel = join(workDir, 'bad-fuel.json');
    writeFileSync(
      badFuel,
      JSON.stringify({
        lanterns: [{ id: 'L1', lit: true, fuel: 150 }],
      })
    );
    const resFuel = runCli([
      '--seed', '1',
      '--night', '1',
      '--scenario', badFuel,
      '--ticks', '60',
      '--out', join(workDir, 'unused-fuel.jsonl'),
    ]);
    expect(resFuel.status).toBe(2);
    expect(resFuel.stderr).toContain('fuel');

    const badInputs = join(workDir, 'bad-inputs.json');
    writeFileSync(
      badInputs,
      JSON.stringify({
        frames: [
          { tick: 10, dash: true },
          { tick: 10, dash: false },
        ],
      })
    );
    const res2 = runCli([
      '--seed', '1',
      '--night', '1',
      '--inputs', badInputs,
      '--ticks', '60',
      '--out', join(workDir, 'unused2.jsonl'),
    ]);
    expect(res2.status).toBe(2);
    expect(res2.stderr).toContain('strictly greater');
  });
});
