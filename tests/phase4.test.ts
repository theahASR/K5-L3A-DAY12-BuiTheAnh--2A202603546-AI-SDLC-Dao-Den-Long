import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BENCH_MOTE_COUNT,
  BENCH_SHADE_COUNT,
  BenchSimulation,
  computeBenchMetrics,
  getBenchCameraPos,
} from '../src/core/bench';
import {
  addLeaderboardEntry,
  formatIsoWithTimezone,
  sortAndTrimLeaderboard,
  validatePlayerName,
  type LeaderboardEntry,
} from '../src/core/leaderboard';
import {
  BINDABLE_ACTIONS,
  DEFAULT_KEYBINDINGS,
  DEFAULT_SETTINGS,
  findKeyConflict,
} from '../src/game/settings';

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'dao-den-long-p4-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('Phase 4 — Benchmark Scene & Metrics (Contract v1.3)', () => {
  it('initializes Night 1 with exact 200 wandering shades, 100 motes, L1-L3 lit fuel 100, Mây static', () => {
    const bench = new BenchSimulation(42);
    expect(bench.sim.night).toBe(1);
    expect(bench.sim.shades).toHaveLength(BENCH_SHADE_COUNT);
    expect(bench.sim.motes).toHaveLength(BENCH_MOTE_COUNT);
    expect(bench.sim.shades.every((s) => s.state === 'wander')).toBe(true);

    const lit = bench.sim.lanterns.filter((l) => l.lit);
    expect(lit.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    for (const l of lit) {
      expect(bench.sim.getLanternFuel(l)).toBe(100);
    }

    // Step 120 ticks -> shades move, but fuel, motes, flames, player pos & state stay frozen
    const initialX0 = bench.sim.shades[0].x;
    for (let i = 0; i < 120; i++) {
      bench.stepWanderTick();
    }
    expect(bench.sim.shades[0].x).not.toBe(initialX0);
    expect(bench.sim.shades).toHaveLength(200);
    expect(bench.sim.motes).toHaveLength(100);
    expect(bench.sim.player.flames).toBe(3);
    expect([bench.sim.player.x, bench.sim.player.y, bench.sim.player.z]).toEqual([0, 0, 0]);
    for (const l of lit) {
      expect(bench.sim.getLanternFuel(l)).toBe(100);
    }
  });

  it('computes exact CCW orbital camera position (radius 30m, Y=15m, 15s period from (30,15,0))', () => {
    const p0 = getBenchCameraPos(0);
    expect(p0[0]).toBeCloseTo(30, 5);
    expect(p0[1]).toBe(15);
    expect(p0[2]).toBeCloseTo(0, 5);

    const pQuarter = getBenchCameraPos(3.75); // 90 deg CCW from above (+X -> -Z)
    expect(pQuarter[0]).toBeCloseTo(0, 4);
    expect(pQuarter[1]).toBe(15);
    expect(pQuarter[2]).toBeCloseTo(-30, 4);

    const pFull = getBenchCameraPos(15);
    expect(pFull[0]).toBeCloseTo(30, 4);
    expect(pFull[2]).toBeCloseTo(0, 4);
  });

  it('computes exact avg_fps, p1_low_fps, and frame_ms_p95 formulas', () => {
    // 99 frames at 10ms + 1 slow frame at 50ms -> N=100, sum=1040ms
    const dts = [...Array(99).fill(10), 50];
    const m = computeBenchMetrics(dts);
    expect(m.frames).toBe(100);
    expect(m.avg_fps).toBeCloseTo(1000 * 100 / 1040, 1); // 96.2
    expect(m.p1_low_fps).toBeCloseTo(1000 / 50, 1); // 20.0 (k=1 worst dt=50ms)
    expect(m.frame_ms_p95).toBe(10);
  });
});

describe('Phase 4 — Local Leaderboard & --export-leaderboard', () => {
  it('validates 3-12 char names (ASCII & Vietnamese) and rejects invalid inputs', () => {
    expect(validatePlayerName('May_2026').valid).toBe(true);
    expect(validatePlayerName('ThếAnh').valid).toBe(true);
    expect(validatePlayerName('ab').valid).toBe(false);
    expect(validatePlayerName('TooLongPlayerName').valid).toBe(false);
    expect(validatePlayerName('Has Space').valid).toBe(false);
    expect(validatePlayerName('Bad!Name').valid).toBe(false);
  });

  it('sorts descending by score, breaks ties by earlier achieved_at, and trims to top 10', () => {
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < 12; i++) {
      entries.push({
        name: `Player_${i}`,
        score: i === 5 ? 900 : i * 100,
        nights_won: 2,
        achieved_at: `2026-11-20T10:${String(i).padStart(2, '0')}:00+07:00`,
        seed: 100 + i,
      });
    }
    // Player_5 (10:05) and Player_9 (10:09) both have score 900 -> Player_5 must rank above Player_9!
    const sorted = sortAndTrimLeaderboard(entries);
    expect(sorted).toHaveLength(10);
    expect(sorted[0].name).toBe('Player_11');
    expect(sorted[2].name).toBe('Player_5');
    expect(sorted[3].name).toBe('Player_9');

    const iso = formatIsoWithTimezone();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('exports disk leaderboard via run_cmd --export-leaderboard out.json with exit code 0', () => {
    const lbFile = join(workDir, 'disk-lb.json');
    const outFile = join(workDir, 'exported-lb.json');
    const { entries } = addLeaderboardEntry([], {
      name: 'May_Test',
      score: 1450,
      nights_won: 3,
      seed: 2026,
      achieved_at: '2026-11-20T23:00:00+07:00',
    });
    writeFileSync(lbFile, JSON.stringify({ entries }, null, 2));

    const res = spawnSync(
      process.execPath,
      ['scripts/run-game.mjs', '--export-leaderboard', outFile],
      {
        encoding: 'utf-8',
        env: { ...process.env, DAO_DEN_LONG_LEADERBOARD: lbFile },
      }
    );
    expect(res.status).toBe(0);
    const exported = JSON.parse(readFileSync(outFile, 'utf-8'));
    expect(exported.entries).toHaveLength(1);
    expect(exported.entries[0].name).toBe('May_Test');
    expect(exported.entries[0].score).toBe(1450);
  });
});

describe('Phase 4 — Accessibility Key Rebinding & Settings', () => {
  it('provides all 9 bindable actions, detects duplicate conflicts, and exposes reduceMotion & largeText', () => {
    expect(BINDABLE_ACTIONS).toHaveLength(9);
    expect(DEFAULT_SETTINGS.reduceMotion).toBe(false);
    expect(DEFAULT_SETTINGS.largeText).toBe(false);

    // Assigning KeyW (moveForward) to jump must report conflict with moveForward
    expect(findKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'KeyW')).toBe('moveForward');
    // Re-assigning jump to Space (its own key) is not a conflict
    expect(findKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'Space')).toBeNull();
    // Unused key KeyK has no conflict
    expect(findKeyConflict(DEFAULT_KEYBINDINGS, 'jump', 'KeyK')).toBeNull();
  });
});

describe('Phase 4 — Soak Test CLI (Contract v1.3)', () => {
  it('runs 3 consecutive Nights without crashes and keeps RSS within 1.2x budget', () => {
    const outPath = join(workDir, 'soak-test.json');
    const res = spawnSync(
      process.execPath,
      ['dist-headless/soak.js', '--seed', '7', '--nights', '3', '--out', outPath],
      { encoding: 'utf-8' }
    );
    expect(res.status).toBe(0);
    const soak = JSON.parse(readFileSync(outPath, 'utf-8'));
    expect(soak.nights).toBe(3);
    expect(soak.crashes).toBe(0);
    expect(soak.results).toHaveLength(3);
    expect(soak.mem_end_mb).toBeLessThanOrEqual(soak.mem_start_mb * 1.2);
  });
});
