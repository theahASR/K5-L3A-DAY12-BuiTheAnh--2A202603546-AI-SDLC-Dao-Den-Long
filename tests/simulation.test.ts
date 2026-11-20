import { describe, expect, it } from 'vitest';
import {
  CHARM_DURATION_TICKS,
  CHARM_SPEED,
  DT,
  PALETTE,
  PULSE_PUSH_TICKS,
  TUNING,
} from '../src/core/config';
import { getTerrainHeight } from '../src/core/maps';
import { GameSimulation, createDefaultInput } from '../src/core/simulation';
import type { EventRecord } from '../src/core/types';

describe('GameSimulation — Phase 1 Regression (updated for Ticket-02 Contract v1.1)', () => {
  it('initializes player at (0,0,0) with 5 Night 1 lanterns and emits no setup events or score', () => {
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
    expect(snap0.night).toBe(1);
    expect(snap0.state).toBe('playing');
    expect(snap0.score).toBe(0);
    expect(snap0.player.pos).toEqual([0, 0, 0]);
    expect(snap0.player.grounded).toBe(true);
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

    for (let i = 0; i < 60; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], cam_yaw_deg: 0 });
    }
    expect(sim.player.x).toBeCloseTo(0, 4);
    expect(sim.player.z).toBeCloseTo(TUNING.player_speed, 3);

    for (let i = 0; i < 60; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], cam_yaw_deg: 90 });
    }
    expect(sim.player.x).toBeCloseTo(TUNING.player_speed, 3);
    expect(sim.player.z).toBeCloseTo(TUNING.player_speed, 3);

    const simDiag = new GameSimulation({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });
    for (let i = 0; i < 60; i++) {
      simDiag.step({ ...createDefaultInput(), move: [1, 1], cam_yaw_deg: 0 });
    }
    expect(Math.hypot(simDiag.player.x, simDiag.player.z)).toBeCloseTo(TUNING.player_speed, 3);
  });

  it('jumps only on rising edge (7.0 m/s, -20 m/s²) and lands cleanly at Y = 0', () => {
    const sim = new GameSimulation({
      seed: 2,
      scenario: { random_motes: false, random_shades: false },
    });

    sim.step({ ...createDefaultInput(), jump: true });
    expect(sim.player.y).toBeGreaterThan(0);

    let peakY = sim.player.y;
    for (let i = 0; i < 90; i++) {
      sim.step({ ...createDefaultInput(), jump: true });
      if (sim.player.y > peakY) peakY = sim.player.y;
    }
    // v^2 / (2g) = 49 / 40 = 1.225 m
    expect(peakY).toBeGreaterThan(1.1);
    expect(peakY).toBeLessThan(1.3);
    expect(sim.player.y).toBe(0);
    expect(sim.player.grounded).toBe(true);
  });

  it('picks up motes within XZ <= 1.0m & dY <= 1.5m up to carry_capacity (10); pickup awards 0 score per Ticket-02', () => {
    // Updated from Phase 1: carry_capacity changed 5 -> 10, pickup_radius 1.8 -> 1.0,
    // score moved from pickup to deposit per Ticket-02 standardized scoring.
    const sim = new GameSimulation({
      seed: 3,
      scenario: {
        player: { pos: [0, 0, 0], carried: 9 },
        random_motes: false,
        random_shades: false,
        motes: [
          [0.8, 0, 0], // within 1.0m -> picked (carried becomes 10)
          [0.9, 0, 0], // within 1.0m -> NOT picked because carry_capacity is 10
          [0.5, 2.0, 0], // dY = 2.0 > 1.5m -> NOT picked
        ],
      },
    });

    const events = sim.step(createDefaultInput());
    expect(events.filter((e) => e.name === 'mote_picked')).toEqual([
      { type: 'event', tick: 1, name: 'mote_picked', data: { carried: 10 } },
    ]);
    expect(sim.player.carried).toBe(10);
    expect(sim.motes).toHaveLength(2);
    expect(sim.score).toBe(0); // Ticket-02: +10 per deposited mote, not on pickup
  });

  it('deposits motes (+10 each), lights lantern (+100), and wins when all 5 are lit', () => {
    // Updated from Phase 1: lantern_cost changed 5 -> 10, interact_radius 2.5 -> 2.0,
    // score includes +10 per deposited mote per Ticket-02.
    const sim = new GameSimulation({
      seed: 4,
      scenario: {
        player: { pos: [0, 0, 0], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 1.8], lit: false, deposited: 0 },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
        time_left_s: 120,
      },
    });

    const events = sim.step({ ...createDefaultInput(), interact: true });
    expect(events.map((e) => e.name)).toEqual(['night_start', 'deposit', 'lantern_lit', 'game_over']);
    expect(events[1].data).toEqual({ lantern_id: 'L1', amount: 10, deposited: 10 });
    expect(events[3].data).toEqual({ result: 'won', reason: 'all_lit' });
    expect(sim.state).toBe('won');

    const expectedDeposit = 10 * TUNING.score.per_mote;
    const expectedTimeBonus = Math.floor(120 - DT) * TUNING.score.per_second_left;
    const expectedFlameBonus = 3 * TUNING.score.per_flame_left;
    expect(sim.score).toBe(
      expectedDeposit + TUNING.score.per_lantern + expectedTimeBonus + expectedFlameBonus
    );
  });

  it('pulse (cost 3, 3D radius 5m) stuns 120t, pushes 4m over 15t, awards +5, and enforces 180t cooldown', () => {
    // Updated from Phase 1: pulse cost 1->3, radius 6->5 (3D from feet+0.8), stun 180->120t,
    // push over 15t, cooldown 120->180t, score 25->5 per Ticket-02.
    const sim = new GameSimulation({
      seed: 5,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4, 1, 0], state: 'chase' }],
      },
    });

    const ev1 = sim.step({ ...createDefaultInput(), pulse: true });
    expect(ev1.find((e) => e.name === 'pulse')).toEqual({
      type: 'event',
      tick: 1,
      name: 'pulse',
      data: { stunned_ids: ['S1'] },
    });
    expect(sim.player.carried).toBe(3);
    expect(sim.shades[0].state).toBe('stunned');
    expect(sim.score).toBe(TUNING.score.per_stun); // +5

    // After 14 more ticks (15 push ticks total including tick 1), shade moved 4.0m horizontally (4 -> 8)
    for (let i = 0; i < PULSE_PUSH_TICKS - 1; i++) {
      sim.step({ ...createDefaultInput(), pulse: false });
    }
    expect(sim.shades[0].x).toBeCloseTo(4 + TUNING.pulse_push_m, 2);

    // Tick 16: re-press pulse during 180t cooldown -> blocked
    const evCd = sim.step({ ...createDefaultInput(), pulse: true });
    expect(evCd.filter((e) => e.name === 'pulse')).toHaveLength(0);

    // Advance to tick 120 (119 ticks after tick 1): still stunned; tick 121 (exact 120t after tick 1): recovers
    for (let i = 0; i < 104; i++) {
      sim.step({ ...createDefaultInput(), pulse: false });
    }
    expect(sim.simTick).toBe(120);
    expect(sim.shades[0].state).toBe('stunned');
    sim.step({ ...createDefaultInput(), pulse: false }); // tick 121
    expect(sim.shades[0].state).not.toBe('stunned');

    // Advance to tick 180, then tick 181 (exact 180t cooldown): 2nd pulse fires!
    for (let i = 0; i < 59; i++) {
      sim.step({ ...createDefaultInput(), pulse: false });
    }
    const ev2 = sim.step({ ...createDefaultInput(), pulse: true });
    expect(ev2.some((e) => e.name === 'pulse')).toBe(true);
    expect(sim.player.carried).toBe(0);
  });

  it('prevents shades from entering safe_radius (6m) around lit lantern and ejects trapped shades in <= 30t', () => {
    const sim = new GameSimulation({
      seed: 6,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        shades: [
          { id: 'S1', pos: [9, 1, 0], state: 'chase' },
          { id: 'S2', pos: [2, 1, 0], state: 'chase' }, // starts inside safe zone -> ejected <= 30t, no dmg
        ],
      },
    });

    for (let i = 0; i < 30; i++) {
      sim.step(createDefaultInput());
    }
    expect(Math.hypot(sim.shades[0].x, sim.shades[0].z)).toBeGreaterThan(TUNING.safe_radius);
    expect(Math.hypot(sim.shades[1].x, sim.shades[1].z)).toBeGreaterThan(TUNING.safe_radius);
    expect(sim.player.flames).toBe(3);
  });

  it('shade hit spawns dropped motes on 1.5-2.5m ring (TTL 480t, pickable next tick), recoils 60t, and loses at 0 flames', () => {
    const sim = new GameSimulation({
      seed: 7,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
      },
    });

    const ev1 = sim.step(createDefaultInput());
    expect(ev1.find((e) => e.name === 'player_hit')).toEqual({
      type: 'event',
      tick: 1,
      name: 'player_hit',
      data: { by: 'shade', flames: 1, dropped: 2 },
    });
    expect(sim.player.carried).toBe(2);
    expect(sim.shades[0].state).toBe('recoil');
    expect(sim.motes).toHaveLength(2);
    expect(sim.motes.every((m) => m.kind === 'dropped' && m.ttlTicks === 480)).toBe(true);
    for (const m of sim.motes) {
      const r = Math.hypot(m.x, m.z);
      expect(r).toBeGreaterThanOrEqual(1.49);
      expect(r).toBeLessThanOrEqual(2.51);
    }

    // Wait for invuln (90t) + recoil (60t) + shade walk back to trigger 2nd hit -> lost (no_flames)
    let sawNoFlames = false;
    for (let i = 0; i < 200 && sim.state === 'playing'; i++) {
      const ev = sim.step(createDefaultInput());
      if (ev.some((e) => e.name === 'game_over' && e.data.reason === 'no_flames')) {
        sawNoFlames = true;
      }
    }
    expect(sawNoFlames).toBe(true);
    expect(sim.state).toBe('lost');
  });

  it('fractional time_left_s (3.7s) triggers dawn loss on exact tick 222', () => {
    const sim = new GameSimulation({
      seed: 12,
      scenario: { random_motes: false, random_shades: false, time_left_s: 3.7 },
    });
    for (let i = 0; i < 221; i++) {
      sim.step(createDefaultInput());
      expect(sim.state).toBe('playing');
    }
    const ev: EventRecord[] = sim.step(createDefaultInput());
    expect(sim.simTick).toBe(222);
    expect(sim.state).toBe('lost');
    expect(ev).toContainEqual({
      type: 'event',
      tick: 222,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' },
    });
  });
});

describe('GameSimulation — Phase 2 Features (Ticket-02 · Contract v1.1)', () => {
  it('Dash moves at 14 m/s for 12t, holds altitude in air, enforces 90t cooldown from start, emits dash', () => {
    const sim = new GameSimulation({
      seed: 21,
      scenario: { random_motes: false, random_shades: false },
    });

    // Jump first so player is airborne
    sim.step({ ...createDefaultInput(), jump: true, move: [0, 1] });
    for (let i = 0; i < 4; i++) sim.step({ ...createDefaultInput(), jump: false, move: [0, 1] });
    const airY = sim.player.y;
    expect(airY).toBeGreaterThan(0.3);

    // Trigger dash on tick 6
    const startZ = sim.player.z;
    const ev = sim.step({ ...createDefaultInput(), move: [0, 1], dash: true });
    expect(ev.some((e) => e.name === 'dash')).toBe(true);

    // Run remaining 11 dash ticks -> total 12 ticks at 14 m/s = 2.8m, Y stays equal to airY
    for (let i = 0; i < 11; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], dash: false });
      expect(sim.player.y).toBeCloseTo(airY, 4);
    }
    expect(sim.player.z - startZ).toBeCloseTo(14.0 * 0.2, 2);

    // Cooldown (90t from tick 6 -> ready at tick 96): trying at tick 20 fails
    for (let i = 0; i < 2; i++) sim.step(createDefaultInput());
    expect(sim.step({ ...createDefaultInput(), dash: true }).some((e) => e.name === 'dash')).toBe(
      false
    );

    // Advance to tick 95, then tick 96 -> dash ready!
    while (sim.simTick < 95) sim.step(createDefaultInput());
    expect(sim.step({ ...createDefaultInput(), dash: true }).some((e) => e.name === 'dash')).toBe(
      true
    );
  });

  it('Falling off island (Y < -10) ignores invuln, loses 1 flame & all carried motes, waits 60t, respawns with 90t invuln', () => {
    const sim = new GameSimulation({
      seed: 22,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 39.5], carried: 5, flames: 3, invuln_ticks: 120 },
        random_motes: false,
        random_shades: false,
      },
    });

    let fallEvent: EventRecord | undefined;
    for (let i = 0; i < 120 && !fallEvent; i++) {
      const evs = sim.step({ ...createDefaultInput(), move: [0, 1] });
      fallEvent = evs.find((e) => e.name === 'player_hit' && e.data.by === 'fall');
    }
    expect(fallEvent).toBeDefined();
    expect(fallEvent!.data).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 5 });
    expect(sim.player.carried).toBe(0);
    expect(sim.player.respawning).toBe(true);

    // Wait 59 ticks -> still respawning; 60th tick -> respawns at (0,0,0) with 90t invuln
    for (let i = 0; i < 59; i++) sim.step(createDefaultInput());
    expect(sim.player.respawning).toBe(true);
    sim.step(createDefaultInput());
    expect(sim.player.respawning).toBe(false);
    expect([sim.player.x, sim.player.y, sim.player.z]).toEqual([0, 0, 0]);
    expect(sim.getSnapshot().player.invuln).toBe(true);
  });

  it('Night 2 Jump Pad launches player from Island A (20,0,18) to Island B ignoring move keys', () => {
    const sim = new GameSimulation({
      seed: 23,
      night: 2,
      scenario: {
        player: { pos: [19.5, 0, 18] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    // Step onto pad at (20,0,18), then hold opposite move [-1, 0] during flight
    sim.step({ ...createDefaultInput(), move: [1, 0] });
    for (let i = 0; i < 100; i++) {
      sim.step({ ...createDefaultInput(), move: [-1, 0] });
      if (sim.player.grounded && i > 10) break;
    }
    expect(sim.player.grounded).toBe(true);
    expect(sim.player.y).toBe(0);
    // Landed squarely on Island B (center 70,0, radius 28)
    expect(Math.hypot(sim.player.x - 70, sim.player.z)).toBeLessThan(28);
  });

  it('Night 3 ramps, Tier 2 jump pad, Bell Tower blocking, and Wind gust at tick 1800 work accurately', () => {
    // Check ramp geometry at 30 deg from r=30 (Y=0) to r=24 (Y=3)
    const rad30 = (30 * Math.PI) / 180;
    expect(getTerrainHeight(3, 30 * Math.cos(rad30), 30 * Math.sin(rad30))).toBeCloseTo(0, 2);
    expect(getTerrainHeight(3, 27 * Math.cos(rad30), 27 * Math.sin(rad30))).toBeCloseTo(1.5, 2);
    expect(getTerrainHeight(3, 24 * Math.cos(rad30), 24 * Math.sin(rad30))).toBeCloseTo(3.0, 2);

    // Jump pad at (0, 3, 13) lands on Tier 2 (Y = 6)
    const sim = new GameSimulation({
      seed: 24,
      night: 3,
      scenario: {
        player: { pos: [0, 3, 13.5] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: true,
      },
    });
    sim.step({ ...createDefaultInput(), move: [0, -1] });
    for (let i = 0; i < 70; i++) {
      sim.step(createDefaultInput());
      if (sim.player.grounded && i > 10) break;
    }
    expect(sim.player.y).toBeCloseTo(6.0, 2);
    expect(Math.hypot(sim.player.x, sim.player.z)).toBeLessThanOrEqual(8.0);

    // Walk toward Bell Tower at (0, 6, 0) -> blocked at r >= 2.0m
    for (let i = 0; i < 60; i++) {
      sim.step({ ...createDefaultInput(), move: [0, -1] });
    }
    expect(Math.hypot(sim.player.x, sim.player.z)).toBeGreaterThanOrEqual(1.99);

    // Advance to tick 1800 -> wind activates!
    while (sim.simTick < 1799) sim.step(createDefaultInput());
    expect(sim.wind.warning).toBe(true);
    sim.step(createDefaultInput()); // simTick === 1800
    expect(sim.wind.active).toBe(true);
  });

  it('Gió Lạc (Drifter) steals 3 motes ignoring invuln, and Pulse during flee drops them all', () => {
    const sim = new GameSimulation({
      seed: 25,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, invuln_ticks: 90 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [2.0, 1.2, 0], state: 'idle', stolen: 0 }],
      },
    });

    // Advance until D1 chases and steals 3 motes
    let stealEv: EventRecord | undefined;
    for (let i = 0; i < 30 && !stealEv; i++) {
      const evs = sim.step(createDefaultInput());
      stealEv = evs.find((e) => e.name === 'drifter_steal');
    }
    expect(stealEv).toBeDefined();
    expect(stealEv!.data).toEqual({ drifter_id: 'D1', amount: 3, carried: 3 });
    expect(sim.player.flames).toBe(3); // Drifters never damage flames
    expect(sim.drifters[0].state).toBe('flee');

    // Immediately Pulse (player has 3 motes) while D1 is fleeing within 5m -> drops 3 motes!
    const pulseEvs = sim.step({ ...createDefaultInput(), pulse: true });
    expect(pulseEvs.find((e) => e.name === 'drifter_drop')).toEqual({
      type: 'event',
      tick: sim.totalTick,
      name: 'drifter_drop',
      data: { drifter_id: 'D1', amount: 3 },
    });
    expect(sim.motes.filter((m) => m.kind === 'dropped')).toHaveLength(3);
  });

  it('Bùa Gió (Wind Charm) boosts speed to 7.2 m/s and removes dash cooldown for 600 ticks', () => {
    const sim = new GameSimulation({
      seed: 26,
      night: 2,
      scenario: {
        player: { pos: [34.2, 0, 0] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    // Pick up C1 at (35, 0, 0)
    const ev = sim.step(createDefaultInput());
    expect(ev.find((e) => e.name === 'charm_picked')).toEqual({
      type: 'event',
      tick: 1,
      name: 'charm_picked',
      data: { charm_id: 'C1', charm_ticks: CHARM_DURATION_TICKS },
    });

    // Verify 7.2 m/s speed over 10 ticks (= 1.2 m)
    const z0 = sim.player.z;
    for (let i = 0; i < 10; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1] });
    }
    expect(sim.player.z - z0).toBeCloseTo(CHARM_SPEED * (10 / 60), 2);

    // Back-to-back dashes (12t duration, 0 cooldown!)
    expect(sim.step({ ...createDefaultInput(), dash: true }).some((e) => e.name === 'dash')).toBe(
      true
    );
    for (let i = 0; i < 11; i++) sim.step({ ...createDefaultInput(), dash: false });
    // Next tick after 12t dash ends: dash immediately available again!
    expect(sim.step({ ...createDefaultInput(), dash: true }).some((e) => e.name === 'dash')).toBe(
      true
    );
  });

  it('Pause freezes sim_tick, time_left_s, and timers while tick advances; Resume continues cleanly', () => {
    const sim = new GameSimulation({
      seed: 27,
      scenario: { random_motes: false, random_shades: false },
    });

    for (let i = 0; i < 10; i++) sim.step({ ...createDefaultInput(), move: [0, 1] });
    expect(sim.simTick).toBe(10);
    const zBeforePause = sim.player.z;
    const timeBeforePause = sim.timeLeftS;

    // Pause on tick 11
    const pauseEv = sim.step({ ...createDefaultInput(), move: [0, 1], pause: true });
    expect(pauseEv).toEqual([{ type: 'event', tick: 11, name: 'paused', data: {} }]);
    expect(sim.state).toBe('paused');

    // Stay paused for 19 more ticks
    for (let i = 0; i < 19; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], pause: false });
    }
    expect(sim.totalTick).toBe(30);
    expect(sim.simTick).toBe(10);
    expect(sim.player.z).toBe(zBeforePause);
    expect(sim.timeLeftS).toBe(timeBeforePause);
    expect(sim.getSnapshot().state).toBe('paused');

    // Resume on tick 31
    const resumeEv = sim.step({ ...createDefaultInput(), move: [0, 1], pause: true });
    expect(resumeEv.some((e) => e.name === 'resumed')).toBe(true);
    expect(sim.state).toBe('playing');
    expect(sim.simTick).toBe(11);
    expect(sim.player.z).toBeGreaterThan(zBeforePause);
  });

  it('exposes exact Ticket-02 standard color palette hex values', () => {
    expect(PALETTE.sky).toBe(0x0e1430);
    expect(PALETTE.fog).toBe(0x1b2350);
    expect(PALETTE.lanternLit).toBe(0xffb347);
    expect(PALETTE.shadeBody).toBe(0x120a1a);
    expect(PALETTE.shadeRim).toBe(0x7a3cff);
    expect(PALETTE.mayScarfCharm).toBe(0xc8102e);
    expect(PALETTE.uiDanger).toBe(0xff5a5f);
  });

  it('Audit regression: Night 3 Tier 2 Drifter tracks elevation so 3D Pulse hits it; idle Drifter never steals < 5 motes', () => {
    const simIdle = new GameSimulation({
      seed: 28,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [0.5, 1.2, 0], state: 'idle', stolen: 0 }],
      },
    });
    const evIdle = simIdle.step(createDefaultInput());
    expect(evIdle.some((e) => e.name === 'drifter_steal')).toBe(false);
    expect(simIdle.player.carried).toBe(4);

    // Night 3 Tier 2 (Y=6): chasing Drifter rises to Tier 2 elevation and gets hit by 3D Pulse!
    const simTier2 = new GameSimulation({
      seed: 29,
      night: 3,
      scenario: {
        player: { pos: [0, 6, 5], carried: 6 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [2, 1.2, 5], state: 'idle', stolen: 0 }],
      },
    });
    simTier2.step(createDefaultInput()); // D1 switches to chase & rises to Tier 2 elevation
    expect(simTier2.drifters[0].y).toBeGreaterThanOrEqual(6.0);
    simTier2.step({ ...createDefaultInput(), pulse: true });
    expect(simTier2.drifters[0].state).toBe('flee');
  });
});
