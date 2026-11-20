import { DT, SHADE_DEFAULT_Y, TUNING, round1, round3 } from './config';
import { NIGHT_MAPS, getTerrainHeight } from './maps';
import { SeededRng } from './prng';
import { GameSimulation } from './simulation';
import type { Vec3 } from './types';

export const BENCH_SHADE_COUNT = 200;
export const BENCH_MOTE_COUNT = 100;
export const BENCH_WARMUP_S = 3.0;
export const BENCH_CAM_RADIUS = 30.0;
export const BENCH_CAM_HEIGHT = 15.0;
export const BENCH_CAM_PERIOD_S = 15.0;

export interface BenchMetrics {
  frames: number;
  avg_fps: number;
  p1_low_fps: number;
  frame_ms_p95: number;
}

/**
 * Pure benchmark scene controller matching Ticket-04 Section 1:
 * - Night 1 (Đảo Bến) with L1-L3 lit (fuel 100), L4-L5 unlit
 * - 200 wandering Ink Shades scattered evenly on the island (outside L1-L3 safe zones)
 * - 100 firefly motes scattered evenly on the island
 * - Mây stationary at (0,0,0); spawns/damage/pickup/fuel-decay/end disabled
 */
export class BenchSimulation {
  readonly sim: GameSimulation;
  private readonly rng: SeededRng;

  constructor(seed = 42) {
    this.rng = new SeededRng(seed);
    const map1 = NIGHT_MAPS[1];

    // L1-L3 lit with fuel 100; L4-L5 unlit
    const litLanterns = map1.lanterns.slice(0, 3);

    // Scatter 200 shades evenly across Night 1 circular island (r <= 38m, outside L1-L3 6m safe zones)
    const shades: Array<{ id: string; pos: Vec3; state: 'wander' }> = [];
    for (let i = 0; i < BENCH_SHADE_COUNT; i++) {
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 50; attempt++) {
        const angle = this.rng.range(0, Math.PI * 2);
        const radius = Math.sqrt(this.rng.next()) * 37.5;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        const outsideSafe = litLanterns.every(
          (l) => Math.hypot(x - l.pos[0], z - l.pos[2]) > TUNING.safe_radius + 0.5
        );
        if (outsideSafe) break;
      }
      shades.push({
        id: `BS${i + 1}`,
        pos: [round3(x), SHADE_DEFAULT_Y, round3(z)],
        state: 'wander',
      });
    }

    // Scatter 100 motes evenly across Night 1 island (exceeding gameplay cap per bench spec)
    const motes: Vec3[] = [];
    for (let i = 0; i < BENCH_MOTE_COUNT; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(this.rng.next()) * 37.0;
      motes.push([round3(Math.cos(angle) * radius), 0, round3(Math.sin(angle) * radius)]);
    }

    this.sim = new GameSimulation({
      seed,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 100 },
          { id: 'L2', lit: true, fuel: 100 },
          { id: 'L3', lit: true, fuel: 100 },
          { id: 'L4', lit: false, deposited: 0 },
          { id: 'L5', lit: false, deposited: 0 },
        ],
        shades,
        motes,
        time_left_s: 240,
      },
    });
  }

  /**
   * Advances ONLY the 200 wandering shades at 60 Hz while keeping fuel, spawns,
   * pickups, damage, player position, and Night end completely frozen.
   */
  stepWanderTick(): void {
    const litLanterns = this.sim.lanterns.filter((l) => l.lit);
    const wanderStep = this.sim.map.shadeSpeed * DT * 0.45;
    const safeLimit = this.sim.tuning.safe_radius + 0.05;

    for (const shade of this.sim.shades) {
      shade.state = 'wander';
      shade.wanderChangeTicks -= 1;
      if (shade.wanderChangeTicks <= 0) {
        shade.wanderAngle = this.rng.range(0, Math.PI * 2);
        shade.wanderChangeTicks = 90;
      }

      let candX = shade.x + Math.cos(shade.wanderAngle) * wanderStep;
      let candZ = shade.z + Math.sin(shade.wanderAngle) * wanderStep;

      if (getTerrainHeight(1, candX, candZ) === null) {
        shade.wanderAngle += Math.PI;
        continue;
      }

      // Respect L1-L3 6m safe zones during normal wander
      let hitsSafe = false;
      for (const l of litLanterns) {
        if (Math.hypot(candX - l.x, candZ - l.z) <= safeLimit) {
          hitsSafe = true;
          break;
        }
      }
      if (hitsSafe) {
        shade.wanderAngle += Math.PI * 0.75;
        continue;
      }

      shade.x = candX;
      shade.z = candZ;
    }
  }
}

/**
 * Computes exact Ticket-04 benchmark camera position:
 * Radius 30 m, Y = 15 m, starting at 0° = (30, 15, 0), CCW from above, 15 s / rev.
 */
export function getBenchCameraPos(elapsedS: number): Vec3 {
  const theta = (elapsedS / BENCH_CAM_PERIOD_S) * Math.PI * 2;
  return [
    BENCH_CAM_RADIUS * Math.cos(theta),
    BENCH_CAM_HEIGHT,
    -BENCH_CAM_RADIUS * Math.sin(theta),
  ];
}

/**
 * Computes exact Contract v1.3 benchmark metrics from an array of frame delta times (ms).
 */
export function computeBenchMetrics(frameDtsMs: number[]): BenchMetrics {
  const n = frameDtsMs.length;
  if (n === 0) {
    return { frames: 0, avg_fps: 0, p1_low_fps: 0, frame_ms_p95: 0 };
  }

  let sumDt = 0;
  for (let i = 0; i < n; i++) sumDt += frameDtsMs[i];
  const avgFps = sumDt > 0 ? (1000 * n) / sumDt : 0;

  const sortedAsc = [...frameDtsMs].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  let topKSum = 0;
  for (let i = n - k; i < n; i++) {
    topKSum += sortedAsc[i];
  }
  const avgTopKDt = topKSum / k;
  const p1LowFps = avgTopKDt > 0 ? 1000 / avgTopKDt : 0;

  const p95Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1));
  const frameMsP95 = sortedAsc[p95Idx];

  return {
    frames: n,
    avg_fps: round1(avgFps),
    p1_low_fps: round1(p1LowFps),
    frame_ms_p95: round1(frameMsP95),
  };
}
