import {
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  CHARM_SPEED,
  DRIFTER_CHASE_SPEED,
  DRIFTER_DEFAULT_Y,
  DRIFTER_DETECT_RADIUS,
  DRIFTER_DROP_FLEE_TICKS,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_COUNT,
  DRIFTER_MAX_STEAL,
  DRIFTER_MIN_CARRIED,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_RING_MAX,
  DROPPED_MOTE_RING_MIN,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_RESPAWN_WAIT_TICKS,
  FALL_Y_THRESHOLD,
  GRAVITY,
  INITIAL_MOTE_COUNT,
  JUMP_VELOCITY,
  MAX_MOTE_COUNT,
  MOTE_SPAWN_INTERVAL_TICKS,
  PICKUP_MAX_DY,
  PULSE_ORIGIN_Y_OFFSET,
  PULSE_PUSH_TICKS,
  SAFE_EJECT_MAX_TICKS,
  SHADE_DEFAULT_Y,
  SHADE_DETECT_RADIUS,
  SHADE_HIT_MAX_DY,
  SHADE_LOSE_RADIUS,
  SHADE_RECOIL_DIST,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWN_ANIM_TICKS,
  SHADE_SPAWN_FIRST_TICK,
  TICK_RATE,
  TUNING,
  WIND_CYCLE_TICKS,
  WIND_DURATION_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARNING_TICKS,
  round3,
} from './config';
import {
  NIGHT_MAPS,
  getTerrainHeight,
  isHorizontallyBlocked,
  resolveHorizontalMove,
  type NightMapDef,
} from './maps';
import { SeededRng } from './prng';
import type {
  CharmEntity,
  DrifterEntity,
  EndRecord,
  EventName,
  EventRecord,
  GameOverReason,
  GameState,
  GameTuning,
  InputState,
  LanternEntity,
  MoteEntity,
  PlayerEntity,
  ScenarioFile,
  ShadeEntity,
  ShadeState,
  SnapshotRecord,
  Vec3,
  WindState,
} from './types';

const SAFE_MARGIN = 0.05;

function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICK_RATE));
}

export function createDefaultInput(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export class GameSimulation {
  readonly tuning: GameTuning;
  readonly seed: number;
  readonly night: 1 | 2 | 3;
  readonly map: NightMapDef;
  private readonly rng: SeededRng;

  state: GameState = 'playing';
  gameOverReason: GameOverReason | null = null;
  totalTick = 0;
  simTick = 0;
  readonly initialTimeLeftS: number;
  timeLeftS: number;
  score = 0;

  readonly player: PlayerEntity;
  readonly lanterns: LanternEntity[] = [];
  readonly shades: ShadeEntity[] = [];
  readonly motes: MoteEntity[] = [];
  readonly drifters: DrifterEntity[] = [];
  readonly charms: CharmEntity[] = [];
  readonly wind: WindState;

  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;
  private readonly randomDrifters: boolean;
  private nightStartEmitted = false;

  // Exact integer tick timers
  private invulnTicks = 0;
  private dashActiveTicks = 0;
  private dashCooldownTicks = 0;
  private dashDirX = 0;
  private dashDirZ = 1;
  private pulseCooldownTicks = 0;
  private charmTicks = 0;
  private respawnTicks = 0;

  // Jump pad ballistic launch state (movement keys cannot override; dash cancels it)
  private padLaunchActive = false;
  private padVx = 0;
  private padVz = 0;

  // Wind gust state (Night 3)
  private windActiveTicksLeft = 0;
  private nextWindDirDeg = 0;

  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private nextDrifterSeq = 1;
  private nextCharmSeq = 1;
  private readonly usedMoteIds = new Set<string>();
  private readonly usedShadeIds = new Set<string>();
  private readonly usedDrifterIds = new Set<string>();
  private readonly usedCharmIds = new Set<string>();

  private prevInput: InputState = createDefaultInput();

  /** Visual/audio hooks (no effect on headless output) */
  lastPulseTick = -1000;
  lastPulsePos: Vec3 = [0, 0, 0];
  lastJumpTick = -1000;
  playerMoving = false;

  constructor(options: {
    seed: number;
    night?: 1 | 2 | 3;
    scenario?: ScenarioFile;
    tuning?: GameTuning;
  }) {
    this.seed = options.seed;
    const rawNight = options.night ?? 1;
    this.night = rawNight === 2 ? 2 : rawNight === 3 ? 3 : 1;
    this.map = NIGHT_MAPS[this.night];
    this.tuning = options.tuning ?? TUNING;
    this.rng = new SeededRng(this.seed);

    const sc = options.scenario;
    this.randomMotes = sc?.random_motes ?? (sc?.motes === undefined);
    this.randomShades = sc?.random_shades ?? (sc?.shades === undefined);
    this.randomDrifters =
      sc?.random_drifters ?? (this.map.driftersEnabled && sc?.drifters === undefined);

    const windEnabled = sc?.wind_enabled ?? this.map.windEnabled;
    this.wind = {
      enabled: windEnabled,
      warning: false,
      active: false,
      dirDeg: 0,
    };

    const defaultDuration =
      this.night === 1
        ? this.tuning.night1_duration_s
        : this.night === 2
          ? this.tuning.night2_duration_s
          : this.tuning.night3_duration_s;
    this.initialTimeLeftS = sc?.time_left_s ?? defaultDuration;
    this.timeLeftS = this.initialTimeLeftS;

    const startPos = sc?.player?.pos ?? this.map.startPos;
    const terrainAtStart = getTerrainHeight(this.night, startPos[0], startPos[2]);
    const grounded =
      terrainAtStart !== null && Math.abs(startPos[1] - terrainAtStart) <= 0.05;

    this.invulnTicks = sc?.player?.invuln_ticks ?? 0;
    this.dashCooldownTicks = sc?.player?.dash_cd_ticks ?? 0;
    this.pulseCooldownTicks = sc?.player?.pulse_cd_ticks ?? 0;
    this.charmTicks = sc?.player?.charm_ticks ?? 0;

    this.player = {
      x: startPos[0],
      y: startPos[1],
      z: startPos[2],
      vx: 0,
      vy: 0,
      vz: 0,
      grounded,
      facingYaw: 0, // facing +Z
      flames: sc?.player?.flames ?? this.tuning.flames,
      carried: sc?.player?.carried ?? 0,
      invulnTimer: this.invulnTicks / TICK_RATE,
      dashCooldown: this.dashCooldownTicks / TICK_RATE,
      pulseCooldown: this.pulseCooldownTicks / TICK_RATE,
      charmTimer: this.charmTicks / TICK_RATE,
      dashing: false,
      respawning: false,
    };

    // 1. Setup map lanterns (L1..Ln)
    for (const def of this.map.lanterns) {
      this.lanterns.push({
        id: def.id,
        x: def.pos[0],
        y: def.pos[1],
        z: def.pos[2],
        lit: false,
        deposited: 0,
      });
    }

    if (sc?.lanterns) {
      for (const override of sc.lanterns) {
        let lantern = this.lanterns.find((l) => l.id === override.id);
        if (!lantern) {
          lantern = { id: override.id, x: 0, y: 0, z: 0, lit: false, deposited: 0 };
          this.lanterns.push(lantern);
        }
        if (override.pos) {
          lantern.x = override.pos[0];
          lantern.y = override.pos[1];
          lantern.z = override.pos[2];
        }
        if (override.deposited !== undefined) {
          lantern.deposited = override.deposited;
        }
        if (override.lit !== undefined) {
          lantern.lit = override.lit;
          if (override.lit && override.deposited === undefined) {
            lantern.deposited = Math.max(lantern.deposited, this.tuning.lantern_cost);
          }
        } else if (
          override.deposited !== undefined &&
          override.deposited >= this.tuning.lantern_cost
        ) {
          lantern.lit = true;
        }
      }
    }

    // 2. Setup initial motes (20 distinct map spawn points when random_motes, or explicit scenario list)
    if (sc?.motes !== undefined) {
      for (const m of sc.motes) {
        const pos = Array.isArray(m) ? m : m.pos;
        const explicitId = Array.isArray(m) ? undefined : m.id;
        const kind = Array.isArray(m) ? 'random' : (m.kind ?? 'random');
        const ttlS = Array.isArray(m) ? null : (m.ttl_s ?? (kind === 'dropped' ? 8.0 : null));
        const id = this.allocateMoteId(explicitId);
        this.motes.push({
          id,
          x: pos[0],
          y: pos[1],
          z: pos[2],
          kind,
          ttlTicks: ttlS === null ? null : secondsToTicks(ttlS),
          pickupDelayTicks: 0,
        });
      }
    } else if (this.randomMotes) {
      const pool = [...this.map.moteSpawns];
      const count = Math.min(INITIAL_MOTE_COUNT, pool.length);
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(this.rng.next() * pool.length);
        const [pt] = pool.splice(idx, 1);
        this.motes.push({
          id: this.allocateMoteId(),
          x: pt[0],
          y: pt[1],
          z: pt[2],
          kind: 'random',
          ttlTicks: null,
          pickupDelayTicks: 0,
        });
      }
    }

    // 3. Setup initial shades (Ticket-02: 0 shades at tick 0 unless scenario provides them; 2 spawn at tick 300)
    if (sc?.shades !== undefined) {
      for (const s of sc.shades) {
        const id = this.allocateShadeId(s.id);
        const defaultState: ShadeState =
          distXZ(s.pos[0], s.pos[2], this.player.x, this.player.z) <= SHADE_DETECT_RADIUS
            ? 'chase'
            : 'wander';
        const state: ShadeState = s.state ?? defaultState;
        const stateTicksLeft =
          s.state_ticks_left ??
          (state === 'stunned'
            ? secondsToTicks(this.tuning.pulse_stun_s)
            : state === 'recoil'
              ? SHADE_RECOIL_TICKS
              : state === 'spawning'
                ? SHADE_SPAWN_ANIM_TICKS
                : 0);
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state,
          stateTicksLeft,
          pushTicksLeft: 0,
          pushDirX: 1,
          pushDirZ: 0,
          recoilDirX: 1,
          recoilDirZ: 0,
          safePushTicksLeft: 0,
          inSafeEjection: false,
          wanderAngle: this.rng.range(0, Math.PI * 2),
          wanderChangeTicks: 60,
        });
      }
    }

    // 4. Setup initial drifters (default empty at tick 0; spawns at ticks 1200, 2400, ... on Nights 2 & 3)
    if (sc?.drifters !== undefined) {
      for (const d of sc.drifters) {
        const id = this.allocateDrifterId(d.id);
        const state = d.state ?? 'idle';
        const stolen = d.stolen ?? 0;
        this.drifters.push({
          id,
          x: d.pos[0],
          y: d.pos[1],
          z: d.pos[2],
          state,
          stolen,
          hasStolen: stolen > 0 || state === 'flee',
          fleeTicksLeft: state === 'flee' ? DRIFTER_FLEE_TICKS : 0,
          idleAngle: this.rng.range(0, Math.PI * 2),
        });
      }
    }

    // 5. Setup charms (from map defaults or scenario override)
    if (sc?.charms !== undefined) {
      for (const c of sc.charms) {
        const id = this.allocateCharmId(c.id);
        const mapMatch = this.map.charms.find((mc) => mc.id === id);
        const pos = c.pos ?? mapMatch?.pos ?? [0, 0, 0];
        const available = c.available ?? true;
        const respawnTicks =
          c.respawn_ticks ??
          (c.respawn_s !== undefined
            ? secondsToTicks(c.respawn_s)
            : available
              ? 0
              : CHARM_RESPAWN_TICKS);
        this.charms.push({
          id,
          x: pos[0],
          y: pos[1],
          z: pos[2],
          available,
          respawnTicks,
        });
      }
    } else {
      for (const c of this.map.charms) {
        const id = this.allocateCharmId(c.id);
        this.charms.push({
          id,
          x: c.pos[0],
          y: c.pos[1],
          z: c.pos[2],
          available: true,
          respawnTicks: 0,
        });
      }
    }

    // Pre-roll first wind direction deterministically for Night 3
    this.nextWindDirDeg = round3(this.rng.range(0, 360));
  }

  private allocateMoteId(explicitId?: string): string {
    if (explicitId && !this.usedMoteIds.has(explicitId)) {
      this.usedMoteIds.add(explicitId);
      return explicitId;
    }
    while (this.usedMoteIds.has(`M${this.nextMoteSeq}`)) this.nextMoteSeq++;
    const id = `M${this.nextMoteSeq++}`;
    this.usedMoteIds.add(id);
    return id;
  }

  private allocateShadeId(explicitId?: string): string {
    if (explicitId && !this.usedShadeIds.has(explicitId)) {
      this.usedShadeIds.add(explicitId);
      return explicitId;
    }
    while (this.usedShadeIds.has(`S${this.nextShadeSeq}`)) this.nextShadeSeq++;
    const id = `S${this.nextShadeSeq++}`;
    this.usedShadeIds.add(id);
    return id;
  }

  private allocateDrifterId(explicitId?: string): string {
    if (explicitId && !this.usedDrifterIds.has(explicitId)) {
      this.usedDrifterIds.add(explicitId);
      return explicitId;
    }
    while (this.usedDrifterIds.has(`D${this.nextDrifterSeq}`)) this.nextDrifterSeq++;
    const id = `D${this.nextDrifterSeq++}`;
    this.usedDrifterIds.add(id);
    return id;
  }

  private allocateCharmId(explicitId?: string): string {
    if (explicitId && !this.usedCharmIds.has(explicitId)) {
      this.usedCharmIds.add(explicitId);
      return explicitId;
    }
    while (this.usedCharmIds.has(`C${this.nextCharmSeq}`)) this.nextCharmSeq++;
    const id = `C${this.nextCharmSeq++}`;
    this.usedCharmIds.add(id);
    return id;
  }

  private makeEvent(name: EventName, data: Record<string, unknown>): EventRecord {
    return {
      type: 'event',
      tick: this.totalTick,
      name,
      data,
    };
  }

  private spawnDroppedMotes(
    centerX: number,
    centerY: number,
    centerZ: number,
    count: number,
    ringMin: number,
    ringMax: number
  ): void {
    for (let i = 0; i < count; i++) {
      let mx = centerX;
      let my = Math.max(0, centerY);
      let mz = centerZ;

      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = this.rng.range(0, Math.PI * 2);
        const radius =
          ringMax > ringMin ? this.rng.range(ringMin, ringMax) : ringMin;
        const cx = centerX + Math.cos(angle) * radius;
        const cz = centerZ + Math.sin(angle) * radius;
        const h = getTerrainHeight(this.night, cx, cz);
        if (h !== null && !isHorizontallyBlocked(this.night, cx, h, cz)) {
          mx = cx;
          my = h;
          mz = cz;
          break;
        }
      }

      this.motes.push({
        id: this.allocateMoteId(),
        x: round3(mx),
        y: round3(my),
        z: round3(mz),
        kind: 'dropped',
        ttlTicks: DROPPED_MOTE_TTL_TICKS,
        pickupDelayTicks: 1, // pickable from NEXT tick
      });
    }
  }

  private spawnScheduledMote(): void {
    if (this.motes.length >= MAX_MOTE_COUNT) return;
    const freePoints = this.map.moteSpawns.filter((pt) =>
      this.motes.every(
        (m) => distXZ(m.x, m.z, pt[0], pt[2]) > 0.5 || Math.abs(m.y - pt[1]) > 0.5
      )
    );
    if (freePoints.length === 0) return;

    const pt = freePoints[Math.floor(this.rng.next() * freePoints.length)];
    this.motes.push({
      id: this.allocateMoteId(),
      x: pt[0],
      y: pt[1],
      z: pt[2],
      kind: 'random',
      ttlTicks: null,
      pickupDelayTicks: 0,
    });
  }

  private spawnScheduledShade(events: EventRecord[]): void {
    if (this.shades.length >= this.map.shadeMax) return;

    const validPoints = this.map.shadeSpawns.filter((pt) => {
      const farFromPlayer = distXZ(pt[0], pt[2], this.player.x, this.player.z) >= 15.0;
      const outsideSafe = this.lanterns.every(
        (l) => !l.lit || distXZ(pt[0], pt[2], l.x, l.z) > this.tuning.safe_radius
      );
      const notOccupied = this.shades.every((s) => distXZ(s.x, s.z, pt[0], pt[2]) > 1.0);
      return farFromPlayer && outsideSafe && notOccupied;
    });
    if (validPoints.length === 0) return;

    const pt = validPoints[Math.floor(this.rng.next() * validPoints.length)];
    const id = this.allocateShadeId();
    this.shades.push({
      id,
      x: pt[0],
      y: pt[1],
      z: pt[2],
      state: 'spawning',
      stateTicksLeft: SHADE_SPAWN_ANIM_TICKS,
      pushTicksLeft: 0,
      pushDirX: 1,
      pushDirZ: 0,
      recoilDirX: 1,
      recoilDirZ: 0,
      safePushTicksLeft: 0,
      inSafeEjection: false,
      wanderAngle: this.rng.range(0, Math.PI * 2),
      wanderChangeTicks: 60,
    });
    events.push(this.makeEvent('shade_spawned', { id }));
  }

  private spawnScheduledDrifter(): void {
    if (this.drifters.length >= DRIFTER_MAX_COUNT) return;
    if (this.map.shadeSpawns.length === 0) return;

    const pt = this.map.shadeSpawns[Math.floor(this.rng.next() * this.map.shadeSpawns.length)];
    const id = this.allocateDrifterId();
    this.drifters.push({
      id,
      x: pt[0],
      y: DRIFTER_DEFAULT_Y,
      z: pt[2],
      state: 'idle',
      stolen: 0,
      hasStolen: false,
      fleeTicksLeft: 0,
      idleAngle: this.rng.range(0, Math.PI * 2),
    });
  }

  private finishGame(
    result: 'won' | 'lost',
    reason: GameOverReason,
    events: EventRecord[]
  ): void {
    this.state = result;
    this.gameOverReason = reason;
    if (result === 'won') {
      const timeBonus = Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
      const flameBonus = this.player.flames * this.tuning.score.per_flame_left;
      this.score += timeBonus + flameBonus;
    }
    events.push(this.makeEvent('game_over', { result, reason }));
  }

  private syncPlayerTimers(): void {
    this.player.invulnTimer = this.invulnTicks / TICK_RATE;
    this.player.dashCooldown = this.dashCooldownTicks / TICK_RATE;
    this.player.pulseCooldown = this.pulseCooldownTicks / TICK_RATE;
    this.player.charmTimer = this.charmTicks / TICK_RATE;
    this.player.dashing = this.dashActiveTicks > 0;
    this.player.respawning = this.respawnTicks > 0;
  }

  /**
   * Executes one deterministic tick following Ticket-02's exact 12-step tick order.
   */
  step(input: InputState): EventRecord[] {
    if (this.state === 'won' || this.state === 'lost') {
      return [];
    }

    const events: EventRecord[] = [];
    this.totalTick += 1;

    // ─── STEP 1: Read input & handle pause FIRST ───
    const pausePressed = input.pause && !this.prevInput.pause;
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    const dashPressed = input.dash && !this.prevInput.dash;

    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
      pause: input.pause,
    };

    if (this.state === 'playing' && pausePressed) {
      this.state = 'paused';
      events.push(this.makeEvent('paused', {}));
      return events;
    }

    if (this.state === 'paused') {
      if (pausePressed) {
        this.state = 'playing';
        events.push(this.makeEvent('resumed', {}));
      } else {
        // Frozen while paused: sim_tick and all timers stay still
        return events;
      }
    }

    // ─── STEP 2: Decrement timers (time, cooldowns, invuln, stun, charm, dropped TTL, charm respawn) ───
    this.simTick += 1;
    const rawTime = this.initialTimeLeftS - this.simTick / TICK_RATE;
    this.timeLeftS = rawTime <= 1e-12 ? 0 : rawTime;

    if (!this.nightStartEmitted) {
      this.nightStartEmitted = true;
      events.push(this.makeEvent('night_start', { night: this.night }));
    }

    // Pre-terminal scenario guards (already dead or all lit before tick 1 actions)
    if (this.player.flames <= 0) {
      this.finishGame('lost', 'no_flames', events);
      return events;
    }
    if (this.lanterns.every((l) => l.lit)) {
      this.finishGame('won', 'all_lit', events);
      return events;
    }
    if (this.initialTimeLeftS <= 0) {
      this.finishGame('lost', 'dawn', events);
      return events;
    }

    const charmActiveThisTick = this.charmTicks > 0;
    if (this.invulnTicks > 0) this.invulnTicks -= 1;
    if (this.dashCooldownTicks > 0) this.dashCooldownTicks -= 1;
    if (this.pulseCooldownTicks > 0) this.pulseCooldownTicks -= 1;
    if (this.charmTicks > 0) this.charmTicks -= 1;

    // Fall respawn countdown
    if (this.respawnTicks > 0) {
      this.respawnTicks -= 1;
      if (this.respawnTicks === 0) {
        this.player.x = this.map.startPos[0];
        this.player.y = this.map.startPos[1];
        this.player.z = this.map.startPos[2];
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.vz = 0;
        this.player.grounded = true;
        this.padLaunchActive = false;
        this.dashActiveTicks = 0;
        this.invulnTicks = secondsToTicks(this.tuning.invuln_s); // 90 ticks
      }
    }

    // Shade timers (note: recoil decrements in Step 8 after moving so all 60 recoil steps = 2.0m complete)
    for (const shade of this.shades) {
      if (shade.state === 'recoil') continue;
      if (shade.stateTicksLeft > 0) {
        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft === 0) {
          if (shade.state === 'spawning' || shade.state === 'stunned') {
            shade.state =
              distXZ(shade.x, shade.z, this.player.x, this.player.z) <= SHADE_DETECT_RADIUS
                ? 'chase'
                : 'wander';
          }
        }
      }
    }

    // Dropped mote TTL & pickup delay
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      if (m.pickupDelayTicks > 0) m.pickupDelayTicks -= 1;
      if (m.ttlTicks !== null) {
        m.ttlTicks -= 1;
        if (m.ttlTicks <= 0) {
          this.motes.splice(i, 1);
        }
      }
    }

    // Charm respawn timers
    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks -= 1;
        if (charm.respawnTicks <= 0) {
          charm.available = true;
          charm.respawnTicks = 0;
        }
      }
    }

    // Wind cycle update (Night 3)
    this.updateWindState();

    // ─── STEP 3: Move Mây (jump, dash, jump pad, wind) then check fall off island ───
    if (this.respawnTicks === 0) {
      this.stepPlayerMovement(input, jumpPressed, dashPressed, charmActiveThisTick, events);
      this.checkPlayerFall(events);
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.vz = 0;
      this.playerMoving = false;
    }

    this.syncPlayerTimers();

    const playerAliveAndPresent = this.respawnTicks === 0 && this.player.flames > 0;

    // ─── STEP 4: Pickup motes and charms ───
    if (playerAliveAndPresent) {
      this.stepPickups(events);
    }

    // ─── STEP 5: Interact with nearest unlit lantern ───
    if (playerAliveAndPresent && interactPressed && this.player.carried > 0) {
      this.stepLanternInteract(events);
    }

    // ─── STEP 6: Update safe zones (eject shades trapped inside newly lit lanterns within <= 30t) ───
    this.stepSafeZones();

    // ─── STEP 7: Light Pulse (3D radius 5m from feet + 0.8m, cost 3, stun 120t, push 4m / 15t) ───
    if (
      playerAliveAndPresent &&
      pulsePressed &&
      this.player.carried >= this.tuning.pulse_cost &&
      this.pulseCooldownTicks <= 0
    ) {
      this.stepPulse(events);
    }

    // ─── STEP 8: Move Ink Shades and Drifters (Gió Lạc) ───
    this.stepShadesMovement();
    this.stepDriftersMovement();

    // ─── STEP 9: Collisions — Drifters steal FIRST, then Shades hit (ascending id) ───
    if (playerAliveAndPresent) {
      this.stepCollisions(events);
    }

    // ─── STEP 10: Scheduled spawns (new entities only interact from next tick) ───
    this.stepScheduledSpawns(events);

    this.syncPlayerTimers();

    // ─── STEP 11: Win / Loss check (exact priority: no_flames > all_lit > dawn) ───
    if (this.player.flames <= 0) {
      this.finishGame('lost', 'no_flames', events);
      return events;
    }
    if (this.lanterns.every((l) => l.lit)) {
      this.finishGame('won', 'all_lit', events);
      return events;
    }
    if (this.timeLeftS <= 0) {
      this.finishGame('lost', 'dawn', events);
      return events;
    }

    return events;
  }

  private updateWindState(): void {
    if (!this.wind.enabled) {
      this.wind.warning = false;
      this.wind.active = false;
      return;
    }

    if (this.windActiveTicksLeft > 0) {
      this.windActiveTicksLeft -= 1;
      if (this.windActiveTicksLeft === 0) {
        this.wind.active = false;
        this.nextWindDirDeg = round3(this.rng.range(0, 360));
      }
    }

    const cyclePos = this.simTick % WIND_CYCLE_TICKS;
    if (this.simTick > 0 && cyclePos === 0) {
      this.wind.active = true;
      this.wind.warning = false;
      this.wind.dirDeg = this.nextWindDirDeg;
      this.windActiveTicksLeft = WIND_DURATION_TICKS;
    } else if (!this.wind.active && cyclePos >= WIND_CYCLE_TICKS - WIND_WARNING_TICKS) {
      this.wind.warning = true;
      this.wind.dirDeg = this.nextWindDirDeg;
    } else if (!this.wind.active) {
      this.wind.warning = false;
    }
  }

  private stepPlayerMovement(
    input: InputState,
    jumpPressed: boolean,
    dashPressed: boolean,
    charmActive: boolean,
    events: EventRecord[]
  ): void {
    // Parse world move vector from move + cam_yaw_deg
    let mx = input.move[0];
    let mz = input.move[1];
    const moveLen = Math.hypot(mx, mz);
    if (moveLen > 1) {
      mx /= moveLen;
      mz /= moveLen;
    }
    const theta = (input.cam_yaw_deg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const wx = mx * cosT + mz * sinT;
    const wz = -mx * sinT + mz * cosT;
    const hasMove = Math.hypot(wx, wz) > 1e-6;

    // Trigger Dash (rising edge, ignored if already dashing; charm removes cooldown)
    const canDash =
      this.dashActiveTicks === 0 && (this.dashCooldownTicks <= 0 || charmActive);
    if (dashPressed && canDash) {
      const dashLen = hasMove ? Math.hypot(wx, wz) : 1;
      this.dashDirX = hasMove ? wx / dashLen : Math.sin(this.player.facingYaw);
      this.dashDirZ = hasMove ? wz / dashLen : Math.cos(this.player.facingYaw);
      this.player.facingYaw = Math.atan2(this.dashDirX, this.dashDirZ);
      this.dashActiveTicks = secondsToTicks(this.tuning.dash_duration_s); // 12 ticks
      this.dashCooldownTicks =
        charmActive ? 0 : secondsToTicks(this.tuning.dash_cooldown_s); // 90 ticks
      this.padLaunchActive = false; // Dash overrides jump pad velocity
      this.player.vy = 0; // Air dash holds altitude
      events.push(this.makeEvent('dash', {}));
    }

    // Determine horizontal velocity
    let vx = 0;
    let vz = 0;
    const isDashingNow = this.dashActiveTicks > 0;
    if (isDashingNow) {
      vx = this.dashDirX * this.tuning.dash_speed;
      vz = this.dashDirZ * this.tuning.dash_speed;
      this.dashActiveTicks -= 1;
      this.playerMoving = true;
    } else if (this.padLaunchActive) {
      vx = this.padVx;
      vz = this.padVz;
      this.playerMoving = true;
    } else if (hasMove) {
      const speed = charmActive ? CHARM_SPEED : this.tuning.player_speed;
      vx = wx * speed;
      vz = wz * speed;
      this.player.facingYaw = Math.atan2(wx, wz);
      this.playerMoving = true;
    } else {
      this.playerMoving = false;
    }

    // Night 3 Wind gust adds 2 m/s push along wind direction
    if (this.wind.active) {
      const wRad = (this.wind.dirDeg * Math.PI) / 180;
      vx += Math.cos(wRad) * WIND_PUSH_SPEED;
      vz += Math.sin(wRad) * WIND_PUSH_SPEED;
    }

    // Apply horizontal movement with cliff/bell-tower wall blocking (fall_enabled allows walking off island into void!)
    const prevX = this.player.x;
    const prevY = this.player.y;
    const prevZ = this.player.z;

    const moved = resolveHorizontalMove(
      this.night,
      prevX,
      prevY,
      prevZ,
      prevX + vx * DT,
      prevZ + vz * DT,
      this.tuning.fall_enabled
    );
    this.player.x = moved.x;
    this.player.z = moved.z;

    // Jump & vertical gravity (air dash holds altitude for all 12 dash ticks)
    if (jumpPressed && this.player.grounded && !isDashingNow) {
      this.player.vy = JUMP_VELOCITY;
      this.player.grounded = false;
      this.lastJumpTick = this.simTick;
    }

    const groundH = getTerrainHeight(this.night, this.player.x, this.player.z);

    if (isDashingNow) {
      // Hold altitude during dash; if grounded on a slope/ramp, follow ramp surface gently
      if (groundH !== null && this.player.y < groundH && groundH - this.player.y <= 0.45) {
        this.player.y = groundH;
      }
      this.player.vy = 0;
      this.player.grounded = groundH !== null && Math.abs(this.player.y - groundH) <= 0.05;
    } else if (this.player.grounded && this.player.vy <= 0) {
      if (groundH !== null && Math.abs(groundH - this.player.y) <= 0.45) {
        // Stay glued smoothly to flat ground or ramp slope
        this.player.y = groundH;
        this.player.vy = 0;
        this.player.grounded = true;
      } else {
        // Stepped off cliff edge or island rim -> begin falling!
        this.player.grounded = false;
        this.player.vy += GRAVITY * DT;
        this.player.y += this.player.vy * DT;
        if (groundH !== null && this.player.y <= groundH && prevY >= groundH - 0.1) {
          this.player.y = groundH;
          this.player.vy = 0;
          this.player.grounded = true;
        }
      }
    } else {
      // Airborne (jumping, pad launch, or falling)
      this.player.vy += GRAVITY * DT;
      const nextY = this.player.y + this.player.vy * DT;
      if (
        groundH !== null &&
        this.player.vy <= 0 &&
        prevY >= groundH - 0.3 &&
        nextY <= groundH
      ) {
        this.player.y = groundH;
        this.player.vy = 0;
        this.player.grounded = true;
        this.padLaunchActive = false;
      } else {
        this.player.y = nextY;
        this.player.grounded = false;
      }
    }

    // Check Jump Pad trigger (when Mây's feet touch pad)
    if (!this.padLaunchActive && this.map.jumpPads.length > 0) {
      for (const pad of this.map.jumpPads) {
        if (
          distXZ(this.player.x, this.player.z, pad.x, pad.z) <= pad.radius &&
          Math.abs(this.player.y - pad.y) <= 0.5
        ) {
          this.padLaunchActive = true;
          this.padVx = pad.vx;
          this.padVz = pad.vz;
          this.player.vy = pad.vy;
          this.player.grounded = false;
          this.dashActiveTicks = 0;
          this.lastJumpTick = this.simTick;
          break;
        }
      }
    }

    this.player.vx = (this.player.x - prevX) / DT;
    this.player.vz = (this.player.z - prevZ) / DT;
  }

  private checkPlayerFall(events: EventRecord[]): void {
    if (!this.tuning.fall_enabled) return;
    if (this.player.y < FALL_Y_THRESHOLD && this.respawnTicks === 0) {
      // Triggers once, ignores invulnerability
      this.player.flames = Math.max(0, this.player.flames - 1);
      const lost = this.player.carried;
      this.player.carried = 0;
      this.padLaunchActive = false;
      this.dashActiveTicks = 0;

      events.push(
        this.makeEvent('player_hit', {
          by: 'fall',
          flames: this.player.flames,
          dropped: 0,
          lost,
        })
      );

      if (this.player.flames > 0) {
        this.respawnTicks = FALL_RESPAWN_WAIT_TICKS; // 60 ticks wait before respawn
      }
    }
  }

  private stepPickups(events: EventRecord[]): void {
    // 1. Firefly motes (XZ <= 1.0 m AND |player.y - mote.y| <= 1.5 m)
    if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
      const remaining: MoteEntity[] = [];
      for (const mote of this.motes) {
        if (
          this.player.carried < this.tuning.carry_capacity &&
          mote.pickupDelayTicks === 0 &&
          distXZ(this.player.x, this.player.z, mote.x, mote.z) <= this.tuning.pickup_radius &&
          Math.abs(this.player.y - mote.y) <= PICKUP_MAX_DY
        ) {
          this.player.carried += 1;
          events.push(this.makeEvent('mote_picked', { carried: this.player.carried }));
        } else {
          remaining.push(mote);
        }
      }
      this.motes.length = 0;
      this.motes.push(...remaining);
    }

    // 2. Wind Charms (Bùa Gió: same pickup rule as motes)
    for (const charm of this.charms) {
      if (
        charm.available &&
        distXZ(this.player.x, this.player.z, charm.x, charm.z) <= this.tuning.pickup_radius &&
        Math.abs(this.player.y - charm.y) <= PICKUP_MAX_DY
      ) {
        charm.available = false;
        charm.respawnTicks = CHARM_RESPAWN_TICKS; // 2700 ticks
        this.charmTicks = CHARM_DURATION_TICKS; // 600 ticks (refreshes)
        this.dashCooldownTicks = 0; // Dash has no cooldown during charm
        events.push(
          this.makeEvent('charm_picked', {
            charm_id: charm.id,
            charm_ticks: CHARM_DURATION_TICKS,
          })
        );
      }
    }
  }

  private stepLanternInteract(events: EventRecord[]): void {
    let bestLantern: LanternEntity | null = null;
    let bestDist = Infinity;

    for (const lantern of this.lanterns) {
      if (lantern.lit || lantern.deposited >= this.tuning.lantern_cost) continue;
      const d = distXZ(this.player.x, this.player.z, lantern.x, lantern.z);
      if (d <= this.tuning.interact_radius && Math.abs(this.player.y - lantern.y) <= 2.5) {
        if (
          d < bestDist - 1e-9 ||
          (Math.abs(d - bestDist) <= 1e-9 && (!bestLantern || lantern.id < bestLantern.id))
        ) {
          bestDist = d;
          bestLantern = lantern;
        }
      }
    }

    if (!bestLantern) return;

    const needed = this.tuning.lantern_cost - bestLantern.deposited;
    const amount = Math.min(this.player.carried, needed);
    if (amount <= 0) return;

    this.player.carried -= amount;
    bestLantern.deposited += amount;
    // Ticket-02 standardized scoring: +10 per mote DEPOSITED
    this.score += amount * this.tuning.score.per_mote;
    events.push(
      this.makeEvent('deposit', {
        lantern_id: bestLantern.id,
        amount,
        deposited: bestLantern.deposited,
      })
    );

    if (bestLantern.deposited >= this.tuning.lantern_cost) {
      bestLantern.lit = true;
      this.score += this.tuning.score.per_lantern;
      events.push(this.makeEvent('lantern_lit', { lantern_id: bestLantern.id }));

      // Mark any shade currently inside the newly lit lantern's safe_radius for <= 30t ejection
      for (const shade of this.shades) {
        if (distXZ(shade.x, shade.z, bestLantern.x, bestLantern.z) <= this.tuning.safe_radius) {
          shade.safePushTicksLeft = SAFE_EJECT_MAX_TICKS;
          shade.inSafeEjection = true;
        }
      }
    }
  }

  private stepSafeZones(): void {
    const litLanterns = this.lanterns.filter((l) => l.lit);
    if (litLanterns.length === 0) {
      for (const shade of this.shades) shade.inSafeEjection = false;
      return;
    }

    const targetR = this.tuning.safe_radius + SAFE_MARGIN;
    for (const shade of this.shades) {
      let insideAny = false;
      let repelX = 0;
      let repelZ = 0;
      let maxPenetration = 0;

      for (const lantern of litLanterns) {
        const dx = shade.x - lantern.x;
        const dz = shade.z - lantern.z;
        const d = Math.hypot(dx, dz);
        if (d <= this.tuning.safe_radius + 1e-6) {
          insideAny = true;
          const pen = targetR - d;
          if (pen > maxPenetration) maxPenetration = pen;
          if (d > 1e-6) {
            repelX += dx / d;
            repelZ += dz / d;
          } else {
            repelX += 1;
          }
        }
      }

      if (insideAny) {
        shade.inSafeEjection = true;
        if (shade.safePushTicksLeft <= 0) {
          shade.safePushTicksLeft = SAFE_EJECT_MAX_TICKS;
        }
        const rLen = Math.hypot(repelX, repelZ);
        const baseAngle = Math.atan2(rLen > 1e-6 ? repelZ / rLen : 0, rLen > 1e-6 ? repelX / rLen : 1);
        const stepSize = Math.max(
          this.map.shadeSpeed * DT,
          maxPenetration / Math.max(1, shade.safePushTicksLeft)
        );
        const footY = Math.max(0, shade.y - SHADE_DEFAULT_Y);

        // Try direct outward first, then rotated angles to stay on walkable ground & avoid void/cliffs
        const offsets = [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57, 2.09, -2.09, 2.62, -2.62, Math.PI];
        for (const off of offsets) {
          const ang = baseAngle + off;
          const cx = shade.x + Math.cos(ang) * stepSize;
          const cz = shade.z + Math.sin(ang) * stepSize;
          const h = getTerrainHeight(this.night, cx, cz);
          if (h !== null && !isHorizontallyBlocked(this.night, cx, footY, cz)) {
            shade.x = cx;
            shade.z = cz;
            shade.y = h + SHADE_DEFAULT_Y;
            break;
          }
        }
        shade.safePushTicksLeft = Math.max(0, shade.safePushTicksLeft - 1);
      } else {
        shade.inSafeEjection = false;
        shade.safePushTicksLeft = 0;
      }
    }
  }

  private stepPulse(events: EventRecord[]): void {
    this.player.carried -= this.tuning.pulse_cost;
    this.pulseCooldownTicks = secondsToTicks(this.tuning.pulse_cooldown_s); // 180 ticks
    this.lastPulseTick = this.simTick;
    this.lastPulsePos = [this.player.x, this.player.y + PULSE_ORIGIN_Y_OFFSET, this.player.z];

    const originX = this.player.x;
    const originY = this.player.y + PULSE_ORIGIN_Y_OFFSET;
    const originZ = this.player.z;

    const stunTicks = secondsToTicks(this.tuning.pulse_stun_s); // 120 ticks
    const stunnedIds: string[] = [];

    // 1. Shades within 3D distance <= 5.0 m from (player.pos + 0.8m Y)
    for (const shade of this.shades) {
      if (shade.state === 'spawning') continue;
      const dist3D = Math.hypot(shade.x - originX, shade.y - originY, shade.z - originZ);
      if (dist3D <= this.tuning.pulse_radius) {
        const dx = shade.x - originX;
        const dz = shade.z - originZ;
        const dXZ = Math.hypot(dx, dz);
        shade.pushDirX = dXZ > 1e-6 ? dx / dXZ : 1;
        shade.pushDirZ = dXZ > 1e-6 ? dz / dXZ : 0;
        shade.pushTicksLeft = PULSE_PUSH_TICKS; // 15 ticks for total 4m push
        shade.state = 'stunned';
        shade.stateTicksLeft = stunTicks;
        stunnedIds.push(shade.id);
      }
    }
    stunnedIds.sort();
    this.score += stunnedIds.length * this.tuning.score.per_stun; // +5 per shade hit

    // 2. Drifters (Gió Lạc) within 3D distance <= 5.0 m
    for (const drifter of this.drifters) {
      const dist3D = Math.hypot(drifter.x - originX, drifter.y - originY, drifter.z - originZ);
      if (dist3D <= this.tuning.pulse_radius) {
        if (drifter.state === 'chase') {
          drifter.state = 'flee';
          drifter.fleeTicksLeft = DRIFTER_FLEE_TICKS;
        } else if (drifter.state === 'flee' && drifter.stolen > 0) {
          const dropAmount = drifter.stolen;
          const groundH = getTerrainHeight(this.night, drifter.x, drifter.z) ?? 0;
          this.spawnDroppedMotes(drifter.x, groundH, drifter.z, dropAmount, 0.2, 0.8);
          drifter.stolen = 0;
          drifter.fleeTicksLeft = DRIFTER_DROP_FLEE_TICKS; // vanishes after 120 ticks
          events.push(
            this.makeEvent('drifter_drop', {
              drifter_id: drifter.id,
              amount: dropAmount,
            })
          );
        }
      }
    }

    events.push(this.makeEvent('pulse', { stunned_ids: stunnedIds }));
  }

  private stepShadesMovement(): void {
    const litLanterns = this.lanterns.filter((l) => l.lit);
    const stepDist = this.map.shadeSpeed * DT;
    const safeLimit = this.tuning.safe_radius + SAFE_MARGIN;
    const pushStep = this.tuning.pulse_push_m / PULSE_PUSH_TICKS;
    const recoilStep = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;

    for (const shade of this.shades) {
      if (shade.state === 'spawning') continue;
      if (shade.inSafeEjection) continue;

      const footY = Math.max(0, shade.y - SHADE_DEFAULT_Y);

      if (shade.state === 'stunned') {
        if (shade.pushTicksLeft > 0) {
          const candX = shade.x + shade.pushDirX * pushStep;
          const candZ = shade.z + shade.pushDirZ * pushStep;
          const entersSafe = litLanterns.some(
            (l) => distXZ(candX, candZ, l.x, l.z) <= this.tuning.safe_radius
          );
          const groundH = getTerrainHeight(this.night, candX, candZ);
          const blocked =
            entersSafe ||
            groundH === null ||
            isHorizontallyBlocked(this.night, candX, footY, candZ);
          if (blocked) {
            shade.pushTicksLeft = 0;
          } else {
            shade.x = candX;
            shade.z = candZ;
            shade.y = groundH + SHADE_DEFAULT_Y;
            shade.pushTicksLeft -= 1;
          }
        }
        continue;
      }

      if (shade.state === 'recoil') {
        const candX = shade.x + shade.recoilDirX * recoilStep;
        const candZ = shade.z + shade.recoilDirZ * recoilStep;
        const entersSafe = litLanterns.some(
          (l) => distXZ(candX, candZ, l.x, l.z) <= this.tuning.safe_radius
        );
        const groundH = getTerrainHeight(this.night, candX, candZ);
        if (
          !entersSafe &&
          groundH !== null &&
          !isHorizontallyBlocked(this.night, candX, footY, candZ)
        ) {
          shade.x = candX;
          shade.z = candZ;
          shade.y = groundH + SHADE_DEFAULT_Y;
        }
        shade.stateTicksLeft = Math.max(0, shade.stateTicksLeft - 1);
        if (shade.stateTicksLeft === 0) {
          shade.state =
            distXZ(shade.x, shade.z, this.player.x, this.player.z) <= SHADE_DETECT_RADIUS
              ? 'chase'
              : 'wander';
        }
        continue;
      }

      // Detect / lose aggro hysteresis (12 m detect, 18 m lose)
      const dToPlayer = distXZ(shade.x, shade.z, this.player.x, this.player.z);
      const canTargetPlayer = this.respawnTicks === 0 && this.player.flames > 0;

      if (shade.state === 'wander') {
        if (canTargetPlayer && dToPlayer <= SHADE_DETECT_RADIUS) {
          shade.state = 'chase';
        }
      } else if (shade.state === 'chase') {
        if (!canTargetPlayer || dToPlayer > SHADE_LOSE_RADIUS) {
          shade.state = 'wander';
        }
      }

      let candX = shade.x;
      let candZ = shade.z;

      if (shade.state === 'chase') {
        const toPx = this.player.x - shade.x;
        const toPz = this.player.z - shade.z;
        if (dToPlayer > 1e-6) {
          const moveDist = Math.min(stepDist, dToPlayer);
          candX = shade.x + (toPx / dToPlayer) * moveDist;
          candZ = shade.z + (toPz / dToPlayer) * moveDist;
        }
      } else {
        // Gentle deterministic wander
        shade.wanderChangeTicks -= 1;
        if (shade.wanderChangeTicks <= 0) {
          shade.wanderAngle = this.rng.range(0, Math.PI * 2);
          shade.wanderChangeTicks = 90;
        }
        const wanderStep = stepDist * 0.45;
        candX = shade.x + Math.cos(shade.wanderAngle) * wanderStep;
        candZ = shade.z + Math.sin(shade.wanderAngle) * wanderStep;
        if (getTerrainHeight(this.night, candX, candZ) === null) {
          shade.wanderAngle += Math.PI;
          candX = shade.x;
          candZ = shade.z;
        }
      }

      // Project strictly outside all lit lanterns' safe_radius (6 m)
      for (let pass = 0; pass < 3; pass++) {
        for (const lantern of litLanterns) {
          const dx = candX - lantern.x;
          const dz = candZ - lantern.z;
          const d = Math.hypot(dx, dz);
          if (d < safeLimit) {
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            candX = lantern.x + nx * safeLimit;
            candZ = lantern.z + nz * safeLimit;
          }
        }
      }

      // Clamp displacement to shade speed
      const adx = candX - shade.x;
      const adz = candZ - shade.z;
      const aLen = Math.hypot(adx, adz);
      if (aLen > stepDist + 1e-9) {
        candX = shade.x + (adx / aLen) * stepDist;
        candZ = shade.z + (adz / aLen) * stepDist;
      }

      const violatesSafe = litLanterns.some(
        (l) => distXZ(candX, candZ, l.x, l.z) <= this.tuning.safe_radius
      );
      if (!violatesSafe) {
        const moved = resolveHorizontalMove(
          this.night,
          shade.x,
          footY,
          shade.z,
          candX,
          candZ,
          false
        );
        const stillSafe = litLanterns.every(
          (l) => distXZ(moved.x, moved.z, l.x, l.z) > this.tuning.safe_radius
        );
        const h = getTerrainHeight(this.night, moved.x, moved.z);
        if (stillSafe && h !== null) {
          shade.x = moved.x;
          shade.z = moved.z;
          shade.y = h + SHADE_DEFAULT_Y;
        }
      }
    }
  }

  private stepDriftersMovement(): void {
    const canChasePlayer = this.respawnTicks === 0 && this.player.flames > 0;

    for (let i = this.drifters.length - 1; i >= 0; i--) {
      const d = this.drifters[i];
      const distToP = distXZ(d.x, d.z, this.player.x, this.player.z);

      if (d.state === 'flee') {
        const dx = d.x - this.player.x;
        const dz = d.z - this.player.z;
        const len = Math.hypot(dx, dz);
        const nx = len > 1e-6 ? dx / len : 1;
        const nz = len > 1e-6 ? dz / len : 0;
        d.x += nx * DRIFTER_CHASE_SPEED * DT;
        d.z += nz * DRIFTER_CHASE_SPEED * DT;
        const terrainH = getTerrainHeight(this.night, d.x, d.z) ?? 0;
        d.y = Math.max(terrainH, this.player.y) + DRIFTER_DEFAULT_Y;
        d.fleeTicksLeft -= 1;
        if (d.fleeTicksLeft <= 0) {
          this.drifters.splice(i, 1);
        }
        continue;
      }

      // Check idle <-> chase condition every tick: carried >= 5 && dist <= 15 m
      if (
        !d.hasStolen &&
        canChasePlayer &&
        this.player.carried >= DRIFTER_MIN_CARRIED &&
        distToP <= DRIFTER_DETECT_RADIUS
      ) {
        d.state = 'chase';
      } else {
        d.state = 'idle';
      }

      if (d.state === 'chase') {
        if (distToP > 1e-6) {
          const step = Math.min(DRIFTER_CHASE_SPEED * DT, distToP);
          d.x += ((this.player.x - d.x) / distToP) * step;
          d.z += ((this.player.z - d.z) / distToP) * step;
        }
        const terrainH = getTerrainHeight(this.night, d.x, d.z) ?? 0;
        d.y = Math.max(terrainH, this.player.y) + DRIFTER_DEFAULT_Y;
      } else {
        // Gentle idle glide at 2 m/s
        d.idleAngle += 0.45 * DT;
        d.x += Math.cos(d.idleAngle) * DRIFTER_IDLE_SPEED * DT;
        d.z += Math.sin(d.idleAngle) * DRIFTER_IDLE_SPEED * DT;
        const terrainH = getTerrainHeight(this.night, d.x, d.z) ?? 0;
        d.y = terrainH + DRIFTER_DEFAULT_Y;
      }
    }
  }

  private stepCollisions(events: EventRecord[]): void {
    const cmpAscii = (a: { id: string }, b: { id: string }) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

    // 1. Drifters steal FIRST (sorted by id ascending; ignores invuln & safe zones; no flame loss)
    const sortedDrifters = [...this.drifters].sort(cmpAscii);
    for (const d of sortedDrifters) {
      if (d.state !== 'chase' || d.hasStolen) continue;
      if (
        this.player.carried > 0 &&
        distXZ(d.x, d.z, this.player.x, this.player.z) <= DRIFTER_STEAL_RADIUS
      ) {
        const amount = Math.min(DRIFTER_MAX_STEAL, this.player.carried);
        this.player.carried -= amount;
        d.stolen = amount;
        d.hasStolen = true;
        d.state = 'flee';
        d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
        events.push(
          this.makeEvent('drifter_steal', {
            drifter_id: d.id,
            amount,
            carried: this.player.carried,
          })
        );
      }
    }

    // 2. Shades hit SECOND (sorted by id ascending; max 1 flame lost per tick)
    if (this.invulnTicks > 0) return;

    const sortedShades = [...this.shades].sort(cmpAscii);
    for (const shade of sortedShades) {
      if (shade.state === 'spawning' || shade.state === 'stunned' || shade.state === 'recoil') {
        continue;
      }
      if (shade.inSafeEjection) continue;

      if (
        distXZ(shade.x, shade.z, this.player.x, this.player.z) <= this.tuning.shade_hit_radius &&
        Math.abs(this.player.y - shade.y) <= SHADE_HIT_MAX_DY
      ) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
        this.player.carried -= dropped;

        if (dropped > 0) {
          this.spawnDroppedMotes(
            this.player.x,
            this.player.y,
            this.player.z,
            dropped,
            DROPPED_MOTE_RING_MIN,
            DROPPED_MOTE_RING_MAX
          );
        }

        this.invulnTicks = secondsToTicks(this.tuning.invuln_s); // 90 ticks

        // Shade recoils 2m over 60 ticks away from Mây
        const dx = shade.x - this.player.x;
        const dz = shade.z - this.player.z;
        const len = Math.hypot(dx, dz);
        shade.recoilDirX = len > 1e-6 ? dx / len : 1;
        shade.recoilDirZ = len > 1e-6 ? dz / len : 0;
        shade.state = 'recoil';
        shade.stateTicksLeft = SHADE_RECOIL_TICKS;

        events.push(
          this.makeEvent('player_hit', {
            by: 'shade',
            flames: this.player.flames,
            dropped,
          })
        );
        break; // At most 1 flame lost per tick
      }
    }
  }

  private stepScheduledSpawns(events: EventRecord[]): void {
    // 1. Motes: at ticks 240, 480, 720, ...
    if (this.randomMotes && this.simTick > 0 && this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0) {
      this.spawnScheduledMote();
    }

    // 2. Shades: 2 at tick 300, then 1 every shadeIntervalTicks
    if (this.randomShades) {
      if (this.simTick === SHADE_SPAWN_FIRST_TICK) {
        this.spawnScheduledShade(events);
        this.spawnScheduledShade(events);
      } else if (
        this.simTick > SHADE_SPAWN_FIRST_TICK &&
        (this.simTick - SHADE_SPAWN_FIRST_TICK) % this.map.shadeIntervalTicks === 0
      ) {
        this.spawnScheduledShade(events);
      }
    }

    // 3. Drifters (Nights 2 & 3): at ticks 1200, 2400, ...
    if (
      this.randomDrifters &&
      this.simTick > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0
    ) {
      this.spawnScheduledDrifter();
    }
  }

  getSnapshot(tick = this.totalTick): SnapshotRecord {
    return {
      type: 'snapshot',
      tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.wind.active,
        dir_deg: round3(this.wind.dirDeg),
      },
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        vel: [round3(this.player.vx), round3(this.player.vy), round3(this.player.vz)],
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        invuln: this.invulnTicks > 0,
        dash_cd_s: round3(this.dashCooldownTicks / TICK_RATE),
        pulse_cd_s: round3(this.pulseCooldownTicks / TICK_RATE),
        charm_s: round3(this.charmTicks / TICK_RATE),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: [round3(l.x), round3(l.y), round3(l.z)],
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: [round3(s.x), round3(s.y), round3(s.z)],
        state: s.state,
      })),
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: [round3(m.x), round3(m.y), round3(m.z)],
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE),
      })),
      motes_active: this.motes.length,
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: [round3(d.x), round3(d.y), round3(d.z)],
        state: d.state,
        stolen: d.stolen,
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.totalTick,
      state: this.state,
      score: this.score,
    };
  }
}
