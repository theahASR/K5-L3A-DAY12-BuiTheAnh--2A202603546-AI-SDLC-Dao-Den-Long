export type Vec3 = [number, number, number];

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface GameTuning {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface GameContract {
  contract_version: string;
  team: string;
  build_cmd: string;
  run_cmd: string;
  headless_cmd: string;
  tuning: GameTuning;
}

export type GameState = 'playing' | 'won' | 'lost';
export type GameOverReason = 'all_lit' | 'dawn' | 'no_flames';
export type ShadeState = 'chase' | 'flee' | 'stunned';

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
}

export interface InputFrame {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  lit?: boolean;
  deposited?: number;
}

export type ScenarioMote = Vec3 | { id?: string; pos: Vec3 };

export interface ScenarioFile {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface PlayerEntity {
  x: number;
  y: number;
  z: number;
  vy: number;
  facingYaw: number;
  flames: number;
  carried: number;
  invulnTimer: number;
  pulseCooldown: number;
}

export interface LanternEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  deposited: number;
}

export interface ShadeEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  state: ShadeState;
  stunTimer: number;
}

export interface MoteEntity {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GameState;
  time_left_s: number;
  score: number;
  player: {
    pos: Vec3;
    flames: number;
    carried: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3;
    state: ShadeState;
  }>;
  motes: Array<{
    id: string;
    pos: Vec3;
  }>;
  motes_active: number;
}

export type EventName =
  | 'mote_picked'
  | 'deposit'
  | 'lantern_lit'
  | 'pulse'
  | 'player_hit'
  | 'shade_spawned'
  | 'game_over';

export interface EventRecord {
  type: 'event';
  tick: number;
  name: EventName;
  data: Record<string, unknown>;
}

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}

export type JsonlRecord = SnapshotRecord | EventRecord | EndRecord;
