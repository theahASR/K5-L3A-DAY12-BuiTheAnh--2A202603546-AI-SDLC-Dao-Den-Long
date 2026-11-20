import { describe, expect, it } from 'vitest';
import { DT, TUNING } from '../src/core/config';
import { GameSimulation, createDefaultInput } from '../src/core/simulation';
import type { EventRecord } from '../src/core/types';

describe('GameSimulation — Core Mechanics & Test Contract v1.0', () => {
  it('initializes player at (0,0,0) with 5 unlit lanterns and emits no setup events or score', () => {
    const sim = new GameSimulation({
      seed: 42,
      night: 1,
      scenario: {
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', lit: true }],
      },
    });

    const snap0 = sim.getSnapshot(0);
    expect(snap0.tick).toBe(0);
    expect(snap0.sim_tick).toBe(0);
    expect(snap0.state).toBe('playing');
    expect(snap0.score).toBe(0);
    expect(snap0.player.pos).toEqual([0, 0, 0]);
    expect(snap0.player.flames).toBe(TUNING.flames);
    expect(snap0.lanterns).toHaveLength(TUNING.lantern_count_night1);
    expect(snap0.lanterns.find((l) => l.id === 'L1')?.lit).toBe(true);
    expect(snap0.motes_active).toBe(0);
    expect(snap0.shades).toHaveLength(0);
  });

  it('moves player according to cam_yaw_deg formula and normalizes diagonal move vectors', () => {
    const sim = new GameSimulation({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    // yaw = 0, move = [0, 1] -> +Z at player_speed (6.0 m/s => 6.0 m in 60 ticks)
    for (let i = 0; i < 60; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], cam_yaw_deg: 0 });
    }
    expect(sim.player.x).toBeCloseTo(0, 4);
    expect(sim.player.z).toBeCloseTo(TUNING.player_speed, 3);

    // yaw = 90 deg, move = [0, 1] -> x' = sin(90) = +1, z' = cos(90) = 0
    for (let i = 0; i < 60; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], cam_yaw_deg: 90 });
    }
    expect(sim.player.x).toBeCloseTo(TUNING.player_speed, 3);
    expect(sim.player.z).toBeCloseTo(TUNING.player_speed, 3);

    // Diagonal move [1, 1] normalized to length 1 -> total displacement equals player_speed in 60 ticks
    const simDiag = new GameSimulation({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });
    for (let i = 0; i < 60; i++) {
      simDiag.step({ ...createDefaultInput(), move: [1, 1], cam_yaw_deg: 0 });
    }
    expect(Math.hypot(simDiag.player.x, simDiag.player.z)).toBeCloseTo(TUNING.player_speed, 3);
  });

  it('jumps only on rising edge and lands cleanly at Y = 0', () => {
    const sim = new GameSimulation({
      seed: 2,
      scenario: { random_motes: false, random_shades: false },
    });

    // Tick 0 -> 1: jump rises from false -> true
    sim.step({ ...createDefaultInput(), jump: true });
    expect(sim.player.y).toBeGreaterThan(0);

    let peakY = sim.player.y;
    // Hold jump=true continuously; player should NOT double-jump after landing
    for (let i = 0; i < 90; i++) {
      sim.step({ ...createDefaultInput(), jump: true });
      if (sim.player.y > peakY) peakY = sim.player.y;
    }
    expect(peakY).toBeGreaterThan(1.0);
    expect(sim.player.y).toBe(0);
  });

  it('picks up motes within XZ pickup_radius up to carry_capacity and stops picking when full', () => {
    const sim = new GameSimulation({
      seed: 3,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4 },
        random_motes: false,
        random_shades: false,
        motes: [
          [1.0, 0, 0], // within 1.8m -> picked (carried becomes 5)
          [1.2, 0, 0], // within 1.8m -> NOT picked because carry_capacity is 5
        ],
      },
    });

    const events = sim.step(createDefaultInput());
    expect(events).toEqual([{ type: 'event', tick: 1, name: 'mote_picked', data: { carried: 5 } }]);
    expect(sim.player.carried).toBe(5);
    expect(sim.motes).toHaveLength(1);
    expect(sim.score).toBe(TUNING.score.per_mote);
  });

  it('deposits motes on interact rising edge, lights lantern, and wins when all 5 are lit', () => {
    const sim = new GameSimulation({
      seed: 4,
      scenario: {
        player: { pos: [0, 0, 0], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 2.0], lit: false, deposited: 0 },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
        time_left_s: 120,
      },
    });

    const events = sim.step({ ...createDefaultInput(), interact: true });
    expect(events.map((e) => e.name)).toEqual(['deposit', 'lantern_lit', 'game_over']);
    expect(events[0].data).toEqual({ lantern_id: 'L1', amount: 5, deposited: 5 });
    expect(events[2].data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(sim.state).toBe('won');

    const expectedTimeBonus = Math.floor(120 - DT) * TUNING.score.per_second_left;
    const expectedFlameBonus = 3 * TUNING.score.per_flame_left;
    expect(sim.score).toBe(TUNING.score.per_lantern + expectedTimeBonus + expectedFlameBonus);
  });

  it('pulse stuns & pushes shades, deducts pulse_cost, enforces cooldown, and recovers after stun', () => {
    const sim = new GameSimulation({
      seed: 5,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 1, 0] }],
      },
    });

    const ev1 = sim.step({ ...createDefaultInput(), pulse: true });
    expect(ev1).toEqual([{ type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['S1'] } }]);
    expect(sim.player.carried).toBe(1);
    expect(sim.shades[0].state).toBe('stunned');
    expect(sim.shades[0].x).toBeCloseTo(4 + TUNING.pulse_push_m, 3);
    expect(sim.score).toBe(TUNING.score.per_stun);

    // Release and re-press pulse during cooldown -> no pulse event
    sim.step({ ...createDefaultInput(), pulse: false });
    const evCooldown = sim.step({ ...createDefaultInput(), pulse: true });
    expect(evCooldown.filter((e) => e.name === 'pulse')).toHaveLength(0);

    // Advance past pulse_stun_s (3.0s = 180 ticks) -> shade recovers to chase
    for (let i = 0; i < 185; i++) {
      sim.step(createDefaultInput());
    }
    expect(sim.shades[0].state).toBe('chase');
  });

  it('prevents shades from entering safe_radius around a lit lantern', () => {
    const sim = new GameSimulation({
      seed: 6,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        shades: [{ id: 'S1', pos: [9, 1, 0] }],
      },
    });

    for (let i = 0; i < 300; i++) {
      sim.step(createDefaultInput());
      const dist = Math.hypot(sim.shades[0].x, sim.shades[0].z);
      expect(dist).toBeGreaterThan(TUNING.safe_radius);
    }
    expect(sim.player.flames).toBe(3);
  });

  it('applies shade hit, drops motes by hit_drop_ratio, grants invuln_s, and loses at 0 flames', () => {
    const sim = new GameSimulation({
      seed: 7,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [0.5, 1, 0] }],
      },
    });

    // Tick 1: first hit
    const ev1 = sim.step(createDefaultInput());
    expect(ev1).toEqual([
      { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 1, dropped: 2 } },
    ]);
    expect(sim.player.carried).toBe(2);

    // Next 80 ticks (~1.33s < 1.5s invuln_s): no second hit
    for (let i = 0; i < 80; i++) {
      const ev = sim.step(createDefaultInput());
      expect(ev.filter((e) => e.name === 'player_hit')).toHaveLength(0);
    }

    // Advance until second hit triggers game_over no_flames
    let sawGameOver = false;
    for (let i = 0; i < 30 && sim.state === 'playing'; i++) {
      const ev = sim.step(createDefaultInput());
      if (ev.some((e) => e.name === 'game_over' && e.data.reason === 'no_flames')) {
        sawGameOver = true;
      }
    }
    expect(sawGameOver).toBe(true);
    expect(sim.state).toBe('lost');
    expect(sim.player.flames).toBe(0);
  });

  it('loses by dawn when time_left_s reaches 0', () => {
    const sim = new GameSimulation({
      seed: 8,
      scenario: {
        random_motes: false,
        random_shades: false,
        time_left_s: 1,
      },
    });

    let lastEvents: EventRecord[] = [];
    for (let i = 0; i < 65 && sim.state === 'playing'; i++) {
      lastEvents = sim.step(createDefaultInput());
    }
    expect(sim.simTick).toBe(60);
    expect(sim.state).toBe('lost');
    expect(lastEvents).toContainEqual({
      type: 'event',
      tick: 60,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' },
    });
  });

  it('C1 regression: pulse never pushes a stunned shade inside a lit lantern safe_radius', () => {
    const sim = new GameSimulation({
      seed: 9,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true }],
        shades: [{ id: 'S1', pos: [3, 1, 0] }],
      },
    });

    sim.step({ ...createDefaultInput(), pulse: true });
    expect(sim.shades[0].state).toBe('stunned');
    const distToLit = Math.hypot(sim.shades[0].x - 10, sim.shades[0].z);
    expect(distToLit).toBeGreaterThan(TUNING.safe_radius);
  });

  it('C2 regression: cooldown (120t) and stun (180t) expire on exact tick with no float drift', () => {
    const sim = new GameSimulation({
      seed: 10,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 1, 0] }],
      },
    });

    // Tick 1: first pulse sets cooldown = 120 ticks, stun = 180 ticks
    const first = sim.step({ ...createDefaultInput(), pulse: true });
    expect(first.some((e) => e.name === 'pulse')).toBe(true);

    // Advance 119 ticks with pulse=false (now at simTick = 120, cooldown decremented 119 times -> 1 tick left)
    for (let i = 0; i < 119; i++) {
      sim.step({ ...createDefaultInput(), pulse: false });
    }
    // Tick 121 (exact 120 ticks after tick 1): cooldown decrements to 0 -> 2nd pulse MUST fire!
    const second = sim.step({ ...createDefaultInput(), pulse: true });
    expect(second.some((e) => e.name === 'pulse')).toBe(true);
    expect(sim.player.carried).toBe(1);

    // Advance 179 ticks -> still stunned; on tick +180 -> recovers to chase
    const simStun = new GameSimulation({
      seed: 11,
      scenario: {
        player: { pos: [0, 0, 0], carried: 1 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 1, 0] }],
      },
    });
    simStun.step({ ...createDefaultInput(), pulse: true });
    for (let i = 0; i < 179; i++) {
      simStun.step(createDefaultInput());
    }
    expect(simStun.shades[0].state).toBe('stunned');
    simStun.step(createDefaultInput()); // exact 180th tick after pulse
    expect(simStun.shades[0].state).toBe('chase');
  });

  it('C3 regression: fractional time_left_s (3.7s) triggers dawn loss on exact tick 222', () => {
    const sim = new GameSimulation({
      seed: 12,
      scenario: { random_motes: false, random_shades: false, time_left_s: 3.7 },
    });
    for (let i = 0; i < 221; i++) {
      sim.step(createDefaultInput());
      expect(sim.state).toBe('playing');
    }
    const ev = sim.step(createDefaultInput());
    expect(sim.simTick).toBe(222);
    expect(sim.state).toBe('lost');
    expect(ev).toContainEqual({
      type: 'event',
      tick: 222,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' },
    });
  });

  it('C4 regression: explicit scenario.motes / shades disables surprise random spawns by default', () => {
    const sim = new GameSimulation({
      seed: 13,
      scenario: {
        motes: [[0, 0, 15]],
        shades: [],
      },
    });
    for (let i = 0; i < 300; i++) {
      sim.step(createDefaultInput());
    }
    expect(sim.motes).toHaveLength(1);
    expect(sim.shades).toHaveLength(0);
  });
});
