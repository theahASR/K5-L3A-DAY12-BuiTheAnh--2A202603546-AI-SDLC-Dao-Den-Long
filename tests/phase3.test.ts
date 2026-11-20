import { describe, expect, it } from 'vitest';
import { CONTRACT, PALETTE, TUNING } from '../src/core/config';
import { GameSimulation, createDefaultInput } from '../src/core/simulation';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/game/settings';

describe('Ticket-03 — "Đèn cạn dầu" (Phase 3 · Contract v1.2)', () => {
  it('Contract v1.2 exposes exact required tuning keys and updated night durations (240/270/300s)', () => {
    expect(CONTRACT.contract_version).toBe('1.2');
    expect(TUNING.fuel_max).toBe(100);
    expect(TUNING.fuel_decay_per_s).toBe(1.0);
    expect(TUNING.fuel_per_mote).toBe(10);
    expect(TUNING.relight_cost).toBe(5);
    expect(TUNING.win_ratio).toBe(0.6);
    expect(TUNING.drain_per_s).toBe(5);
    expect(TUNING.low_fuel_threshold).toBe(30);
    expect(TUNING.capacity_max).toBe(20);
    expect(TUNING.night1_duration_s).toBe(240);
    expect(TUNING.night2_duration_s).toBe(270);
    expect(TUNING.night3_duration_s).toBe(300);
    expect(TUNING.score.per_mote).toBe(5);
    expect(TUNING.score.per_lantern).toBe(100);
    expect(TUNING.score.per_relight).toBe(40);
    expect(TUNING.score.per_stun).toBe(5);
    expect(TUNING.score.per_drain_stun).toBe(15);
    expect(TUNING.score.per_lit_lantern_dawn).toBe(50);
    expect(TUNING.score.per_flame_left).toBe(50);
  });

  it('Decays fuel at exact 1/60 per tick, emits lantern_out at 0, remembers ever_lit, and relights for 5 motes (+40)', () => {
    const sim = new GameSimulation({
      seed: 301,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 7 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 1.5], lit: true, fuel: 1.0 }],
      },
    });

    // Tick 1..59: still lit
    for (let i = 0; i < 59; i++) {
      const evs = sim.step(createDefaultInput());
      expect(evs.some((e) => e.name === 'lantern_out')).toBe(false);
    }
    expect(sim.lanterns[0].lit).toBe(true);
    expect(sim.lanterns[0].fuelSixtieths).toBe(1);

    // Tick 60: fuel hits exact 0 -> lantern_out, deposited=0, ever_lit=true
    const ev60 = sim.step(createDefaultInput());
    expect(ev60).toContainEqual({
      type: 'event',
      tick: 60,
      name: 'lantern_out',
      data: { lantern_id: 'L1' },
    });
    const snap60 = sim.getSnapshot();
    expect(snap60.lanterns[0]).toMatchObject({
      id: 'L1',
      lit: false,
      deposited: 0,
      fuel: 0,
      ever_lit: true,
      relit_count: 0,
    });

    // Tick 61: interact with 7 carried -> uses only 5 (relight_cost), score = 5*5 + 40 = 65, carried = 2, capacity = 12
    const ev61 = sim.step({ ...createDefaultInput(), interact: true });
    expect(ev61).toContainEqual({
      type: 'event',
      tick: 61,
      name: 'deposit',
      data: { lantern_id: 'L1', amount: 5, deposited: 5 },
    });
    expect(ev61).toContainEqual({
      type: 'event',
      tick: 61,
      name: 'lantern_lit',
      data: { lantern_id: 'L1', relight: true },
    });
    expect(sim.player.carried).toBe(2);
    expect(sim.player.capacity).toBe(12);
    expect(sim.score).toBe(65);
    expect(sim.getSnapshot().lanterns[0]).toMatchObject({
      lit: true,
      fuel: 100,
      ever_lit: true,
      relit_count: 1,
    });
  });

  it('Refuels using ceil((100 - fuel)/10), skips full lanterns (used=0), and restores safe zone when crossing >= 30', () => {
    // 1. Exact refuel formula & skipping full lantern (tested with fuel_decay_per_s = 0 to keep L1 strictly at 100)
    const simFull = new GameSimulation({
      seed: 302,
      night: 1,
      tuning: { ...TUNING, fuel_decay_per_s: 0 },
      scenario: {
        player: { pos: [0, 0, 0], carried: 5 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 0.5], lit: true, fuel: 100 }, // closer, but FULL -> skipped!
          { id: 'L2', pos: [0, 0, 1.5], lit: true, fuel: 85 }, // needs ceil(15/10) = 2 motes
        ],
      },
    });
    const evSkip = simFull.step({ ...createDefaultInput(), interact: true });
    expect(evSkip.find((e) => e.name === 'refuel')).toEqual({
      type: 'event',
      tick: 1,
      name: 'refuel',
      data: { lantern_id: 'L2', amount: 2, fuel: 100 },
    });
    expect(simFull.player.carried).toBe(3);
    expect(simFull.score).toBe(10); // 2 * 5

    // Interacting again when BOTH L1 & L2 are full -> no event, no score
    const evNone = simFull.step({ ...createDefaultInput(), interact: false });
    expect(evNone.filter((e) => e.name === 'refuel')).toHaveLength(0);
    const evNone2 = simFull.step({ ...createDefaultInput(), interact: true });
    expect(evNone2.filter((e) => e.name === 'refuel')).toHaveLength(0);
    expect(simFull.player.carried).toBe(3);
    expect(simFull.score).toBe(10);

    // 2. Refueling across 30 restores safe zone & ejects shade within <= 30t with 0 damage
    const simEject = new GameSimulation({
      seed: 303,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 1.0], carried: 2, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 25 }],
        shades: [{ id: 'S1', pos: [1.8, 1.0, 0], state: 'drain', target_lantern_id: 'L1' }],
      },
    });
    const evRefuel = simEject.step({ ...createDefaultInput(), interact: true });
    expect(evRefuel.find((e) => e.name === 'refuel')).toMatchObject({
      data: { lantern_id: 'L1', amount: 2 },
    });
    expect(simEject.shades[0].state).toBe('wander');
    for (let i = 0; i < 29; i++) {
      simEject.step(createDefaultInput());
    }
    expect(Math.hypot(simEject.shades[0].x, simEject.shades[0].z)).toBeGreaterThan(TUNING.safe_radius);
    expect(simEject.player.flames).toBe(3);
  });

  it('Enforces exact fuel >= 30 safe zone boundary (exact 30 keeps safe zone, < 30 loses safe zone)', () => {
    const sim = new GameSimulation({
      seed: 304,
      night: 1,
      scenario: {
        player: { pos: [0, 0, -30] }, // far from shade
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 31.0 }],
        shades: [{ id: 'S1', pos: [7.0, 1.0, 0], state: 'wander' }],
      },
    });

    // Run exactly 60 ticks -> fuel drops from 31.0 to exact 30.0 (1800 sixtieths)
    for (let i = 0; i < 60; i++) {
      sim.step(createDefaultInput());
    }
    expect(sim.lanterns[0].fuelSixtieths).toBe(1800);
    expect(sim.hasSafeZone(sim.lanterns[0])).toBe(true);
    expect(Math.hypot(sim.shades[0].x, sim.shades[0].z)).toBeGreaterThan(TUNING.safe_radius);

    // Tick 61: fuel drops to 1799 (< 30) -> safe zone vanishes, wander shade walks in and enters drain!
    sim.step(createDefaultInput());
    expect(sim.hasSafeZone(sim.lanterns[0])).toBe(false);

    let enteredDrain = false;
    for (let i = 0; i < 200; i++) {
      sim.step(createDefaultInput());
      if (sim.shades[0].state === 'drain') {
        enteredDrain = true;
        break;
      }
    }
    expect(enteredDrain).toBe(true);
    expect(Math.hypot(sim.shades[0].x, sim.shades[0].z)).toBeLessThanOrEqual(2.0);
  });

  it('Stacks multi-shade drain (1 + 5*N fuel/s), emits fuel_drain every 60t, switches drain->chase at <=6m, and awards +15 Pulse on draining shade', () => {
    // 1. Stacking drain by 2 shades = 1 + 5 + 5 = 11 fuel/s -> 11.0 dropped in 60 ticks
    const simDrain = new GameSimulation({
      seed: 305,
      night: 1,
      scenario: {
        player: { pos: [0, 0, -25] }, // > 6m away
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
        shades: [
          { id: 'S1', pos: [1.5, 1, 25], state: 'drain', target_lantern_id: 'L1' },
          { id: 'S2', pos: [-1.5, 1, 25], state: 'drain', target_lantern_id: 'L1' },
        ],
      },
    });
    const drainEvents = [];
    for (let i = 0; i < 60; i++) {
      drainEvents.push(...simDrain.step(createDefaultInput()).filter((e) => e.name === 'fuel_drain'));
    }
    expect(simDrain.getLanternFuel(simDrain.lanterns[0])).toBeCloseTo(14.0, 5);
    expect(drainEvents).toEqual([
      { type: 'event', tick: 60, name: 'fuel_drain', data: { lantern_id: 'L1', shade_id: 'S1', fuel: 14 } },
      { type: 'event', tick: 60, name: 'fuel_drain', data: { lantern_id: 'L1', shade_id: 'S2', fuel: 14 } },
    ]);

    // 2. Drain -> chase when Mây enters <= 6m; chase shade never switches to weak lantern
    const simAggro = new GameSimulation({
      seed: 306,
      night: 1,
      scenario: {
        player: { pos: [6.0, 0, 0] },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }],
        shades: [{ id: 'S1', pos: [1.5, 1, 0], state: 'drain', target_lantern_id: 'L1' }],
      },
    });
    simAggro.step(createDefaultInput()); // dist = 4.5 <= 6m -> switches drain -> chase!
    expect(simAggro.shades[0].state).toBe('chase');

    // 3. Pulse awards +15 total for draining shade and +5 for normal shade; stun recovers to 'wander'
    const simPulse = new GameSimulation({
      seed: 307,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [4.0, 0, 0], lit: true, fuel: 20 }],
        shades: [
          { id: 'S1', pos: [3.0, 1, 0], state: 'drain', target_lantern_id: 'L1' },
          { id: 'S2', pos: [-3.0, 1, 0], state: 'chase' },
        ],
      },
    });
    simPulse.step({ ...createDefaultInput(), pulse: true });
    expect(simPulse.score).toBe(20); // +15 (drain) + +5 (chase) = 20
    expect(simPulse.shades[0].state).toBe('stunned');
    expect(simPulse.shades[1].state).toBe('stunned');

    // Wait exact 120 ticks for stun to end -> both recover to 'wander'
    for (let i = 0; i < 120; i++) {
      simPulse.step(createDefaultInput());
    }
    expect(simPulse.shades[0].state).toBe('wander');
    expect(simPulse.shades[1].state).toBe('wander');
  });

  it('Evaluates dawn survival threshold per night (3/5, 4/6, 5/7), awards dawn bonus, and prioritizes no_flames on last tick', () => {
    // Night 1: 3/5 lit -> dawn_survived
    const n1Win = new GameSimulation({
      seed: 310,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 2 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 51 },
          { id: 'L2', lit: true, fuel: 31 },
          { id: 'L3', lit: true, fuel: 11 },
        ],
        time_left_s: 1.0,
      },
    });
    for (let i = 0; i < 60; i++) n1Win.step(createDefaultInput());
    expect(n1Win.state).toBe('won');
    expect(n1Win.gameOverReason).toBe('dawn_survived');
    // After 1.0s: fuels are 50, 30, 10 -> (50+50)+(50+30)+(50+10) + 2*50 = 100+80+60+100 = 340
    expect(n1Win.score).toBe(340);

    // Night 2: 3/6 lit (< 4) -> dawn loss; 4/6 lit -> dawn_survived
    const n2Loss = new GameSimulation({
      seed: 311,
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
        ],
        time_left_s: 0.5,
      },
    });
    for (let i = 0; i < 30; i++) n2Loss.step(createDefaultInput());
    expect(n2Loss.state).toBe('lost');
    expect(n2Loss.gameOverReason).toBe('dawn');

    // Night 3: 5/7 lit -> dawn_survived
    const n3Win = new GameSimulation({
      seed: 312,
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
          { id: 'L4', lit: true, fuel: 50 },
          { id: 'L5', lit: true, fuel: 50 },
        ],
        time_left_s: 0.5,
      },
    });
    for (let i = 0; i < 30; i++) n3Win.step(createDefaultInput());
    expect(n3Win.state).toBe('won');
    expect(n3Win.gameOverReason).toBe('dawn_survived');

    // Final dawn tick with 5/5 lit BUT player takes lethal hit on that tick -> no_flames MUST win!
    const lastTickDeath = new GameSimulation({
      seed: 313,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 1 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 },
          { id: 'L4', lit: true, fuel: 80 },
          { id: 'L5', lit: true, fuel: 80 },
        ],
        shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
        time_left_s: 1 / 60,
      },
    });
    const evFinal = lastTickDeath.step(createDefaultInput());
    expect(lastTickDeath.state).toBe('lost');
    expect(lastTickDeath.gameOverReason).toBe('no_flames');
    expect(evFinal.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'no_flames',
    });
  });

  it('Progressive carry capacity scales 10 + 2*successful_lights up to 20, excludes pre-lit scenario lanterns, and honors scenario successful_lights', () => {
    const sim = new GameSimulation({
      seed: 320,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 15, successful_lights: 4 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 1.5], lit: false, deposited: 0 },
          { id: 'L2', lit: true }, // pre-lit -> does NOT count toward successful_lights
          { id: 'L3', pos: [0, 0, -1.2], lit: false, ever_lit: true, deposited: 0 },
        ],
        motes: [[0.5, 0, 0]],
      },
    });

    // Starting capacity: 10 + 2 * 4 = 18
    expect(sim.getSnapshot(0).player.capacity).toBe(18);
    // Tick 1: pick 1 mote (15 -> 16) + relight closer L3 (dist 1.2m, 5 motes -> carried 11, successful_lights 4 -> 5, capacity -> 20)
    sim.step({ ...createDefaultInput(), interact: true });
    expect(sim.player.capacity).toBe(20);
    expect(sim.player.successfulLights).toBe(5);

    // Move closer to L1 (beyond L3's interact_radius) and light L1 (10 motes) -> successful_lights = 6, capacity stays capped at 20!
    for (let i = 0; i < 15; i++) {
      sim.step({ ...createDefaultInput(), move: [0, 1], interact: false });
    }
    sim.step({ ...createDefaultInput(), interact: true });
    expect(sim.player.successfulLights).toBe(6);
    expect(sim.player.capacity).toBe(20);
  });

  it('Supports Colorblind Mode palette tokens (#00B3FF shade rim/eyes, #FFFFFF UI warning) and persists setting', () => {
    expect(PALETTE.shadeRim).toBe(0x7a3cff);
    expect(PALETTE.shadeRimColorblind).toBe(0x00b3ff);
    expect(PALETTE.uiDanger).toBe(0xff5a5f);
    expect(PALETTE.uiDangerColorblind).toBe(0xffffff);
    expect(DEFAULT_SETTINGS.colorblindMode).toBe(false);

    // Mock localStorage to verify round-trip persistence
    const store = new Map<string, string>();
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    });
    try {
      saveSettings({ volume: 0.5, mouseSensitivity: 0.4, colorblindMode: true });
      expect(loadSettings()).toEqual({ volume: 0.5, mouseSensitivity: 0.4, colorblindMode: true });
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: orig });
    }
  });

  it('Audit edge cases: interact & wander id tie-breaks, chase target lock, drain exits, floor(fuel) bonus, Night 2 win (4/6) & Night 3 loss (4/7)', () => {
    // 1. Interact tie-break: equidistant eligible L2 and L1 -> selects smaller id (L1)
    const simTie = new GameSimulation({
      seed: 330,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L2', pos: [-1.5, 0, 0], lit: true, fuel: 80 },
          { id: 'L1', pos: [1.5, 0, 0], lit: true, fuel: 80 },
        ],
      },
    });
    const tieEvs = simTie.step({ ...createDefaultInput(), interact: true });
    expect(tieEvs.find((e) => e.name === 'refuel')?.data).toMatchObject({ lantern_id: 'L1', amount: 2 });

    // 2. Wander tie-break: equidistant weak L1 & L2 -> walks toward smaller id (L1); fallback to unlit when none weak
    const simWander = new GameSimulation({
      seed: 331,
      night: 1,
      scenario: {
        player: { pos: [0, 0, -35] },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [5, 0, 10], lit: true, fuel: 20 },
          { id: 'L2', pos: [-5, 0, 10], lit: true, fuel: 20 },
        ],
        shades: [{ id: 'S1', pos: [0, 1, 10], state: 'wander' }],
      },
    });
    simWander.step(createDefaultInput());
    expect(simWander.shades[0].x).toBeGreaterThan(0); // moved toward L1 (+5), not L2 (-5)

    // 3. Chase shade NEVER switches target to weak lit lantern even when passing <= 2m of it
    const simChase = new GameSimulation({
      seed: 332,
      night: 1,
      scenario: {
        player: { pos: [10, 0, 0] },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }],
        shades: [{ id: 'S1', pos: [1.0, 1, 0], state: 'chase' }],
      },
    });
    simChase.step(createDefaultInput());
    expect(simChase.shades[0].state).toBe('chase');
    expect(simChase.shades[0].x).toBeGreaterThan(1.0);

    // 4. Drain exits to wander on dist > 2m and on lantern_out (even if player is at 8m <= 12m!)
    const simDrainExit = new GameSimulation({
      seed: 333,
      night: 1,
      scenario: {
        player: { pos: [8.0, 0, 0] }, // 6m < 8m <= 12m
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 0], lit: true, fuel: 0.05 }, // expires on tick 1
          { id: 'L2', pos: [0, 0, 15], lit: true, fuel: 20 },
        ],
        shades: [
          { id: 'S1', pos: [1.0, 1, 0], state: 'drain', target_lantern_id: 'L1' },
          { id: 'S2', pos: [3.0, 1, 15], state: 'drain', target_lantern_id: 'L2' }, // > 2m away
        ],
      },
    });
    const exitEvs = simDrainExit.step(createDefaultInput());
    expect(exitEvs.some((e) => e.name === 'lantern_out' && e.data.lantern_id === 'L1')).toBe(true);
    expect(simDrainExit.shades[0].state).toBe('wander'); // exited drain on lantern_out -> observed as wander!
    expect(simDrainExit.shades[1].state).toBe('wander'); // exited drain on dist > 2m -> observed as wander!

    // 5. Dawn bonus exact floor(fuel) edge case: 59.95 rounds to 60.0 in snapshot, but floor(fuel) MUST award +59!
    const simFloor = new GameSimulation({
      seed: 334,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 1 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 60 },
          { id: 'L2', lit: true, fuel: 60 },
          { id: 'L3', lit: true, fuel: 60 },
        ],
        time_left_s: 1 / 60, // 1 tick: fuel becomes 59 + 59/60 = 59.9833 (snapshot rounds to 60, floor is 59!)
      },
    });
    simFloor.step(createDefaultInput());
    expect(simFloor.state).toBe('won');
    expect(simFloor.getSnapshot().lanterns[0].fuel).toBe(60); // rounded to 1 decimal on output
    // Score = 3 * (50 + 59) + 1 * 50 = 327 + 50 = 377 (NOT 380!)
    expect(simFloor.score).toBe(377);

    // 6. Night 2 exact win (4/6 -> dawn_survived) & Night 3 exact loss (4/7 -> dawn)
    const n2Win = new GameSimulation({
      seed: 335,
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
          { id: 'L4', lit: true, fuel: 50 },
        ],
        time_left_s: 1 / 60,
      },
    });
    n2Win.step(createDefaultInput());
    expect(n2Win.state).toBe('won');
    expect(n2Win.gameOverReason).toBe('dawn_survived');

    const n3Loss = new GameSimulation({
      seed: 336,
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
          { id: 'L4', lit: true, fuel: 50 },
        ],
        time_left_s: 1 / 60,
      },
    });
    n3Loss.step(createDefaultInput());
    expect(n3Loss.state).toBe('lost');
    expect(n3Loss.gameOverReason).toBe('dawn');
  });
});
