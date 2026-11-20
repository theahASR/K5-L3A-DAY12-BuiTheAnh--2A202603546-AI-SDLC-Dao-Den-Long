import contractJson from '../../game.contract.json';
import type { GameContract, GameTuning } from './types';

export const CONTRACT: GameContract = contractJson as GameContract;
export const TUNING: GameTuning = CONTRACT.tuning;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const ISLAND_RADIUS = 38.0;
export const LANTERN_RING_RADIUS = 20.0;
export const JUMP_VELOCITY = 7.5;
export const GRAVITY = -20.0;

export const INITIAL_MOTE_COUNT = 20;
export const MIN_MOTE_THRESHOLD = 12;
export const MOTE_RESPAWN_INTERVAL_S = 4.0;

export const INITIAL_SHADE_COUNT = 2;
export const MAX_SHADE_COUNT = 5;
export const SHADE_SPAWN_INTERVAL_S = 45.0;
export const SHADE_DEFAULT_Y = 1.0;

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
