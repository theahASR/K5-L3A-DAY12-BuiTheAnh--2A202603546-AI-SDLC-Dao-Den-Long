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
  workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-v11-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Headless CLI — Test Contract v1.1 & Phase 1 Regression', () => {
  it('Phase 1 regression: win-flow runs to won/all_lit with v1.1 snapshot schema and exit 0', () => {
    const outPath = join(workDir, 'win-flow.jsonl');
    const res = runCli([
      '--seed', '100',
      '--night', '1',
      '--scenario', 'scenarios/phase1/win-flow.scenario.json',
      '--inputs', 'scenarios/phase1/win-flow.inputs.json',
      '--ticks', '600',
      '--snapshot-every', '10',
      '--out', outPath,
    ]);

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const snap0 = records[0];
    expect(snap0.type).toBe('snapshot');
    expect(snap0.tick).toBe(0);
    expect(snap0.night).toBe(1);
    expect(snap0.wind).toEqual({ active: false, dir_deg: 0 });
    expect(snap0.player).toHaveProperty('vel');
    expect(snap0.player).toHaveProperty('grounded', true);
    expect(snap0.player).toHaveProperty('dash_cd_s', 0);
    expect(Array.isArray(snap0.drifters)).toBe(true);
    expect(Array.isArray(snap0.charms)).toBe(true);

    const events = records.filter((r) => r.type === 'event');
    expect(events.some((e) => e.name === 'night_start' && e.data.night === 1)).toBe(true);
    expect(events.filter((e) => e.name === 'mote_picked')).toHaveLength(5);
    expect(events.some((e) => e.name === 'deposit' && e.data.lantern_id === 'L1')).toBe(true);
    expect(events.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1')).toBe(true);
    expect(events.some((e) => e.name === 'game_over' && e.data.result === 'won')).toBe(true);

    const end = records[records.length - 1];
    expect(end).toMatchObject({ type: 'end', ticks: 87, state: 'won' });
    expect(end.score).toBeGreaterThan(TUNING.score.per_lantern);
  });

  it('Phase 2: supports --night 2 (jump pad + bridge) and --night 3 (tiers + wind)', () => {
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

  it('Phase 2: pause/resume freezes sim_tick & time_left_s and emits paused/resumed events', () => {
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

  it('Phase 2: full 21,600-tick Night 3 run is deterministic and finishes well under 30s', () => {
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
  });

  it('exits with code 2 on invalid v1.1 shade state or non-monotonic input ticks', () => {
    const badScenario = join(workDir, 'bad-shade-state.json');
    writeFileSync(
      badScenario,
      JSON.stringify({
        shades: [{ id: 'S1', pos: [5, 1, 0], state: 'flee' }], // invalid in v1.1!
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
