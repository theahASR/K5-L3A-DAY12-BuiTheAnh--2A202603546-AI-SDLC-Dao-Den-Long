import contractJson from '../../game.contract.json';
import type { GameContract, GameTuning } from './types';

export const CONTRACT: GameContract = contractJson as GameContract;
export const TUNING: GameTuning = CONTRACT.tuning;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

// Standardized Ticket-02 constants
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = -20.0;
export const PICKUP_MAX_DY = 1.5;
export const SHADE_HIT_MAX_DY = 1.5;
export const PULSE_ORIGIN_Y_OFFSET = 0.8;
export const PULSE_PUSH_TICKS = 15;
export const SAFE_EJECT_MAX_TICKS = 30;

export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_LOSE_RADIUS = 18.0;
export const SHADE_RECOIL_DIST = 2.0;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_SPAWN_FIRST_TICK = 300;
export const SHADE_SPAWN_ANIM_TICKS = 30;
export const SHADE_DEFAULT_Y = 1.0;

export const INITIAL_MOTE_COUNT = 20;
export const MAX_MOTE_COUNT = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;
export const DROPPED_MOTE_TTL_TICKS = 480;
export const DROPPED_MOTE_RING_MIN = 1.5;
export const DROPPED_MOTE_RING_MAX = 2.5;

export const FALL_Y_THRESHOLD = -10.0;
export const FALL_RESPAWN_WAIT_TICKS = 60;

export const DRIFTER_IDLE_SPEED = 2.0;
export const DRIFTER_CHASE_SPEED = 7.0;
export const DRIFTER_DETECT_RADIUS = 15.0;
export const DRIFTER_MIN_CARRIED = 5;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_MAX_STEAL = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_DROP_FLEE_TICKS = 120;
export const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
export const DRIFTER_MAX_COUNT = 2;
export const DRIFTER_DEFAULT_Y = 1.2;

export const CHARM_SPEED = 7.2;
export const CHARM_DURATION_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;

export const WIND_CYCLE_TICKS = 1800; // 30s
export const WIND_WARNING_TICKS = 120; // 2s before gust
export const WIND_DURATION_TICKS = 300; // 5s
export const WIND_PUSH_SPEED = 2.0;

// Official Ticket-02 Standard Color Palette (exact hex values)
export const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeStunned: 0x3a3450,
  mayCloak: 0xe8e2d0,
  mayScarfCharm: 0xc8102e,
  goldScore: 0xf2c14e,
  drifter: 0x8fa3b8,
  uiDanger: 0xff5a5f,
  uiText: 0xf5f1e6,
} as const;

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
