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
  workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-test-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Headless CLI — Test Contract v1.0 Compliance', () => {
  it('runs win-flow scenario to won/all_lit with exact schema and exit code 0', () => {
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
    expect(records[0].type).toBe('snapshot');
    expect(records[0].tick).toBe(0);
    expect(records[0].score).toBe(0);

    const events = records.filter((r) => r.type === 'event');
    expect(events.filter((e) => e.name === 'mote_picked')).toHaveLength(5);
    expect(events.some((e) => e.name === 'deposit' && e.data.lantern_id === 'L1')).toBe(true);
    expect(events.some((e) => e.name === 'lantern_lit' && e.data.lantern_id === 'L1')).toBe(true);
    expect(events.some((e) => e.name === 'game_over' && e.data.result === 'won' && e.data.reason === 'all_lit')).toBe(true);

    const end = records[records.length - 1];
    expect(end.type).toBe('end');
    expect(end.state).toBe('won');
    expect(end.ticks).toBe(87); // interact at tick 86 -> step 86 -> tick 87
    expect(end.score).toBeGreaterThan(TUNING.score.per_lantern);
  });

  it('runs safe-radius scenario keeping shade outside safe_radius for 300 ticks', () => {
    const outPath = join(workDir, 'safe-radius.jsonl');
    const res = runCli([
      '--seed', '42',
      '--night', '1',
      '--scenario', 'scenarios/phase1/safe-radius.scenario.json',
      '--ticks', '300',
      '--snapshot-every', '10',
      '--out', outPath,
    ]);

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const snapshots = records.filter((r) => r.type === 'snapshot');
    expect(snapshots.length).toBe(31); // 0, 10, ..., 300
    for (const snap of snapshots) {
      const s1 = snap.shades[0];
      expect(Math.hypot(s1.pos[0], s1.pos[2])).toBeGreaterThan(TUNING.safe_radius);
      expect(snap.player.flames).toBe(3);
    }
    expect(records[records.length - 1]).toMatchObject({ type: 'end', ticks: 300, state: 'playing' });
  });

  it('produces byte-identical JSONL output across repeated runs with same seed and inputs (determinism)', () => {
    const outA = join(workDir, 'det-a.jsonl');
    const outB = join(workDir, 'det-b.jsonl');
    const argsBase = [
      '--seed', '1337',
      '--night', '1',
      '--inputs', 'scenarios/phase1/full-random.inputs.json',
      '--ticks', '3000',
      '--snapshot-every', '30',
    ];

    const resA = runCli([...argsBase, '--out', outA]);
    const resB = runCli([...argsBase, '--out', outB]);
    expect(resA.status).toBe(0);
    expect(resB.status).toBe(0);

    const bytesA = readFileSync(outA, 'utf-8');
    const bytesB = readFileSync(outB, 'utf-8');
    expect(bytesA).toBe(bytesB);

    // Confirm dynamic shade_spawned occurred in 50s run and matched identically
    const records = parseJsonl(outA);
    expect(records.some((r) => r.type === 'event' && r.name === 'shade_spawned')).toBe(true);
  });

  it('exits with code 2 and stderr message on non-increasing input frame ticks', () => {
    const badInputs = join(workDir, 'bad-inputs.json');
    writeFileSync(
      badInputs,
      JSON.stringify({
        frames: [
          { tick: 10, move: [0, 1] },
          { tick: 10, move: [0, 0] },
        ],
      })
    );
    const res = runCli([
      '--seed', '1',
      '--night', '1',
      '--inputs', badInputs,
      '--ticks', '60',
      '--out', join(workDir, 'unused.jsonl'),
    ]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('strictly greater');
  });

  it('exits with code 2 on malformed JSON syntax in scenario file', () => {
    const badScenario = join(workDir, 'bad-scenario.json');
    writeFileSync(badScenario, '{ invalid json');
    const res = runCli([
      '--seed', '1',
      '--night', '1',
      '--scenario', badScenario,
      '--ticks', '60',
      '--out', join(workDir, 'unused2.jsonl'),
    ]);
    expect(res.status).toBe(2);
    expect(res.stderr.length).toBeGreaterThan(0);
  });

  it('exits with non-zero code on missing required CLI flags', () => {
    const res = runCli(['--seed', '1']);
    expect(res.status).not.toBe(0);
    expect(res.stderr.length).toBeGreaterThan(0);
  });
});
