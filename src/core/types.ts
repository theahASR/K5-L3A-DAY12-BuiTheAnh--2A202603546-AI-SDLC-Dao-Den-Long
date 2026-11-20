export type Vec3 = [number, number, number];

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_relight: number;
  per_stun: number;
  per_drain_stun: number;
  per_lit_lantern_dawn: number;
  per_flame_left: number;
}

export interface GameTuning {
  player_speed: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  carry_capacity: number;
  capacity_max: number;
  lantern_cost: number;
  relight_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  win_ratio: number;
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  drain_per_s: number;
  low_fuel_threshold: number;
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
  bench_cmd?: string;
  soak_cmd?: string;
  tuning: GameTuning;
}

export type GameState = 'playing' | 'paused' | 'won' | 'lost';
export type GameOverReason = 'dawn_survived' | 'dawn' | 'no_flames';
export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned' | 'drain';
export type DrifterState = 'idle' | 'chase' | 'flee';
export type MoteKind = 'random' | 'dropped';

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioPlayer {
  pos?: Vec3;
  carried?: number;
  flames?: number;
  successful_lights?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeState;
  state_ticks_left?: number;
  target_lantern_id?: string | null;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  lit?: boolean;
  deposited?: number;
  fuel?: number;
  ever_lit?: boolean;
}

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3;
  state?: DrifterState;
  stolen?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos?: Vec3;
  available?: boolean;
  respawn_ticks?: number;
  respawn_s?: number;
}

export type ScenarioMote =
  | Vec3
  | { id?: string; pos: Vec3; kind?: MoteKind; ttl_s?: number | null };

export interface ScenarioFile {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  time_left_s?: number;
}

export interface PlayerEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  facingYaw: number;
  flames: number;
  carried: number;
  capacity: number;
  successfulLights: number;
  invulnTimer: number;
  dashCooldown: number;
  pulseCooldown: number;
  charmTimer: number;
  dashing: boolean;
  respawning: boolean;
}

export interface LanternEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  lit: boolean;
  deposited: number;
  /** Exact integer fuel in 1/60 units (6000 = 100.0 fuel). Always 0 when unlit. */
  fuelSixtieths: number;
  everLit: boolean;
  relitCount: number;
}

export interface ShadeEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  state: ShadeState;
  stateTicksLeft: number;
  targetLanternId: string | null;
  drainTicks: number;
  pushTicksLeft: number;
  pushDirX: number;
  pushDirZ: number;
  recoilDirX: number;
  recoilDirZ: number;
  safePushTicksLeft: number;
  inSafeEjection: boolean;
  wanderAngle: number;
  wanderChangeTicks: number;
}

export interface MoteEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: MoteKind;
  ttlTicks: number | null;
  pickupDelayTicks: number;
}

export interface DrifterEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  fleeTicksLeft: number;
  idleAngle: number;
}

export interface CharmEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  available: boolean;
  respawnTicks: number;
}

export interface WindState {
  enabled: boolean;
  warning: boolean;
  active: boolean;
  dirDeg: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: number;
  state: GameState;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3;
    vel: Vec3;
    grounded: boolean;
    flames: number;
    carried: number;
    capacity: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
    fuel: number;
    ever_lit: boolean;
    relit_count: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3;
    state: ShadeState;
  }>;
  motes: Array<{
    id: string;
    pos: Vec3;
    kind: MoteKind;
    ttl_s: number | null;
  }>;
  motes_active: number;
  drifters: Array<{
    id: string;
    pos: Vec3;
    state: DrifterState;
    stolen: number;
  }>;
  charms: Array<{
    id: string;
    available: boolean;
    respawn_s: number;
  }>;
}

export type EventName =
  | 'night_start'
  | 'mote_picked'
  | 'deposit'
  | 'lantern_lit'
  | 'refuel'
  | 'lantern_out'
  | 'fuel_drain'
  | 'pulse'
  | 'dash'
  | 'charm_picked'
  | 'drifter_steal'
  | 'drifter_drop'
  | 'player_hit'
  | 'shade_spawned'
  | 'paused'
  | 'resumed'
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
