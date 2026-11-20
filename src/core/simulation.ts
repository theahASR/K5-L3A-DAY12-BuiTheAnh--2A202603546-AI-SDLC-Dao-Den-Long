import {
  DT,
  GRAVITY,
  INITIAL_MOTE_COUNT,
  INITIAL_SHADE_COUNT,
  ISLAND_RADIUS,
  JUMP_VELOCITY,
  LANTERN_RING_RADIUS,
  MAX_SHADE_COUNT,
  MIN_MOTE_THRESHOLD,
  MOTE_RESPAWN_INTERVAL_S,
  SHADE_DEFAULT_Y,
  SHADE_SPAWN_INTERVAL_S,
  TICK_RATE,
  TUNING,
  round3,
} from './config';
import { SeededRng } from './prng';
import type {
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
  SnapshotRecord,
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
  };
}

function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

export class GameSimulation {
  readonly tuning: GameTuning;
  readonly seed: number;
  readonly night: number;
  private readonly rng: SeededRng;

  state: GameState = 'playing';
  gameOverReason: GameOverReason | null = null;
  simTick = 0;
  readonly initialTimeLeftS: number;
  timeLeftS: number;
  score = 0;

  readonly player: PlayerEntity;
  readonly lanterns: LanternEntity[] = [];
  readonly shades: ShadeEntity[] = [];
  readonly motes: MoteEntity[] = [];

  readonly islandBoundRadius: number;

  private readonly randomMotes: boolean;
  private readonly randomShades: boolean;

  // Integer tick timers (prevents IEEE-754 drift on repeated 1/60 decrements)
  private invulnTicks = 0;
  private pulseCooldownTicks = 0;
  private moteRespawnTicks = secondsToTicks(MOTE_RESPAWN_INTERVAL_S);
  private shadeSpawnTicks = secondsToTicks(SHADE_SPAWN_INTERVAL_S);
  private readonly shadeStunTicks = new Map<string, number>();

  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private readonly usedMoteIds = new Set<string>();
  private readonly usedShadeIds = new Set<string>();

  private prevInput: InputState = createDefaultInput();

  /** Visual-only hook info for 3D renderer */
  lastPulseTick = -1000;
  lastPulsePos: [number, number, number] = [0, 0, 0];
  playerMoving = false;

  constructor(options: {
    seed: number;
    night?: number;
    scenario?: ScenarioFile;
    tuning?: GameTuning;
  }) {
    this.seed = options.seed;
    this.night = options.night ?? 1;
    this.tuning = options.tuning ?? TUNING;
    this.rng = new SeededRng(this.seed);

    const sc = options.scenario;
    // If explicit motes/shades lists are provided without explicit random_* flag, disable random spawns
    this.randomMotes = sc?.random_motes ?? (sc?.motes === undefined);
    this.randomShades = sc?.random_shades ?? (sc?.shades === undefined);

    this.initialTimeLeftS = sc?.time_left_s ?? this.tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;

    const startPos = sc?.player?.pos ?? [0, 0, 0];
    this.player = {
      x: startPos[0],
      y: Math.max(0, startPos[1]),
      z: startPos[2],
      vy: 0,
      facingYaw: 0,
      flames: sc?.player?.flames ?? this.tuning.flames,
      carried: sc?.player?.carried ?? 0,
      invulnTimer: 0,
      pulseCooldown: 0,
    };

    // 1. Setup Night 1 lanterns (L1..L5) evenly on circular island
    for (let i = 0; i < this.tuning.lantern_count_night1; i++) {
      const angle = (i * 2 * Math.PI) / this.tuning.lantern_count_night1;
      this.lanterns.push({
        id: `L${i + 1}`,
        x: round3(Math.sin(angle) * LANTERN_RING_RADIUS),
        y: 0,
        z: round3(Math.cos(angle) * LANTERN_RING_RADIUS),
        lit: false,
        deposited: 0,
      });
    }

    if (sc?.lanterns) {
      for (const override of sc.lanterns) {
        let lantern = this.lanterns.find((l) => l.id === override.id);
        if (!lantern) {
          lantern = {
            id: override.id,
            x: 0,
            y: 0,
            z: 0,
            lit: false,
            deposited: 0,
          };
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

    // 2. Setup motes (no events emitted during setup)
    if (sc?.motes !== undefined) {
      for (const m of sc.motes) {
        const pos = Array.isArray(m) ? m : m.pos;
        const explicitId = Array.isArray(m) ? undefined : m.id;
        const id = this.allocateMoteId(explicitId);
        this.motes.push({ id, x: pos[0], y: pos[1], z: pos[2] });
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_MOTE_COUNT; i++) {
        this.spawnRandomMote();
      }
    }

    // 3. Setup shades (no events emitted during setup)
    if (sc?.shades !== undefined) {
      for (const s of sc.shades) {
        const id = this.allocateShadeId(s.id);
        this.shades.push({
          id,
          x: s.pos[0],
          y: s.pos[1],
          z: s.pos[2],
          state: 'chase',
          stunTimer: 0,
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_SHADE_COUNT; i++) {
        this.spawnRandomShade(false);
      }
    }

    // Only expand movement bound beyond ISLAND_RADIUS if a scenario explicitly places entities outside it
    let maxDist = ISLAND_RADIUS;
    const consider = (x: number, z: number) => {
      const d = Math.hypot(x, z);
      if (d > ISLAND_RADIUS && d + 4.0 > maxDist) {
        maxDist = d + 4.0;
      }
    };
    consider(this.player.x, this.player.z);
    for (const l of this.lanterns) consider(l.x, l.z);
    for (const m of this.motes) consider(m.x, m.z);
    for (const s of this.shades) consider(s.x, s.z);
    this.islandBoundRadius = maxDist;
  }

  private allocateMoteId(explicitId?: string): string {
    if (explicitId && !this.usedMoteIds.has(explicitId)) {
      this.usedMoteIds.add(explicitId);
      return explicitId;
    }
    while (this.usedMoteIds.has(`M${this.nextMoteSeq}`)) {
      this.nextMoteSeq++;
    }
    const id = `M${this.nextMoteSeq++}`;
    this.usedMoteIds.add(id);
    return id;
  }

  private allocateShadeId(explicitId?: string): string {
    if (explicitId && !this.usedShadeIds.has(explicitId)) {
      this.usedShadeIds.add(explicitId);
      return explicitId;
    }
    while (this.usedShadeIds.has(`S${this.nextShadeSeq}`)) {
      this.nextShadeSeq++;
    }
    const id = `S${this.nextShadeSeq++}`;
    this.usedShadeIds.add(id);
    return id;
  }

  private spawnRandomMote(): MoteEntity {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 25; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(this.rng.next()) * (ISLAND_RADIUS - 6.0);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      const farFromPlayer =
        distXZ(x, z, this.player.x, this.player.z) > this.tuning.pickup_radius + 3.0;
      const farFromLanterns = this.lanterns.every((l) => distXZ(x, z, l.x, l.z) > 2.2);
      if (farFromPlayer && farFromLanterns) break;
    }
    const mote: MoteEntity = {
      id: this.allocateMoteId(),
      x: round3(x),
      y: 0,
      z: round3(z),
    };
    this.motes.push(mote);
    return mote;
  }

  private spawnRandomShade(emitEvent: boolean, events?: EventRecord[]): ShadeEntity {
    let x = 25;
    let z = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(24.0, ISLAND_RADIUS - 4.0);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      const farFromPlayer = distXZ(x, z, this.player.x, this.player.z) > 14.0;
      const outsideSafe = this.lanterns.every(
        (l) => !l.lit || distXZ(x, z, l.x, l.z) > this.tuning.safe_radius + 1.0
      );
      if (farFromPlayer && outsideSafe) break;
    }
    const shade: ShadeEntity = {
      id: this.allocateShadeId(),
      x: round3(x),
      y: SHADE_DEFAULT_Y,
      z: round3(z),
      state: 'chase',
      stunTimer: 0,
    };
    this.shades.push(shade);
    if (emitEvent && events) {
      events.push(this.makeEvent('shade_spawned', { id: shade.id }));
    }
    return shade;
  }

  private makeEvent(name: EventName, data: Record<string, unknown>): EventRecord {
    return {
      type: 'event',
      tick: this.simTick,
      name,
      data,
    };
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

  private projectOutsideSafeZones(
    candX: number,
    candZ: number,
    fallbackX: number,
    fallbackZ: number
  ): [number, number] {
    const litLanterns = this.lanterns.filter((l) => l.lit);
    if (litLanterns.length === 0) return [candX, candZ];

    const safeLimit = this.tuning.safe_radius + SAFE_MARGIN;
    let x = candX;
    let z = candZ;

    for (let pass = 0; pass < 4; pass++) {
      for (const lantern of litLanterns) {
        const dx = x - lantern.x;
        const dz = z - lantern.z;
        const d = Math.hypot(dx, dz);
        if (d < safeLimit) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          x = lantern.x + nx * safeLimit;
          z = lantern.z + nz * safeLimit;
        }
      }
    }

    const violates = litLanterns.some(
      (l) => distXZ(x, z, l.x, l.z) <= this.tuning.safe_radius
    );
    if (violates) {
      return [fallbackX, fallbackZ];
    }
    return [x, z];
  }

  /**
   * Executes one deterministic fixed-timestep simulation tick (dt = 1/60 s).
   * Step k reads input for tick k and advances state to tick k+1.
   */
  step(input: InputState): EventRecord[] {
    if (this.state !== 'playing') {
      return [];
    }

    const events: EventRecord[] = [];
    this.simTick += 1;
    const rawTime = this.initialTimeLeftS - this.simTick / TICK_RATE;
    this.timeLeftS = rawTime <= 1e-12 ? 0 : rawTime;

    // Handle pre-terminal scenario states cleanly before gameplay interactions
    if (this.lanterns.every((l) => l.lit)) {
      this.finishGame('won', 'all_lit', events);
      return events;
    }
    if (this.player.flames <= 0) {
      this.finishGame('lost', 'no_flames', events);
      return events;
    }
    if (this.initialTimeLeftS <= 0) {
      this.finishGame('lost', 'dawn', events);
      return events;
    }

    // Rising-edge button detection (false -> true)
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
    };

    // 1. Update exact integer tick timers
    if (this.invulnTicks > 0) {
      this.invulnTicks -= 1;
    }
    this.player.invulnTimer = this.invulnTicks / TICK_RATE;

    if (this.pulseCooldownTicks > 0) {
      this.pulseCooldownTicks -= 1;
    }
    this.player.pulseCooldown = this.pulseCooldownTicks / TICK_RATE;

    for (const shade of this.shades) {
      if (shade.state === 'stunned') {
        const rem = (this.shadeStunTicks.get(shade.id) ?? 0) - 1;
        if (rem <= 0) {
          this.shadeStunTicks.delete(shade.id);
          shade.stunTimer = 0;
          shade.state = 'chase';
        } else {
          this.shadeStunTicks.set(shade.id, rem);
          shade.stunTimer = rem / TICK_RATE;
        }
      }
    }

    // 2. Player movement (Test Contract Section C exact yaw transform)
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

    if (Math.hypot(wx, wz) > 1e-6) {
      this.playerMoving = true;
      this.player.x += wx * this.tuning.player_speed * DT;
      this.player.z += wz * this.tuning.player_speed * DT;
      this.player.facingYaw = Math.atan2(wx, wz);

      // Soft shore barrier (fall_enabled: false)
      const radialDist = Math.hypot(this.player.x, this.player.z);
      if (!this.tuning.fall_enabled && radialDist > this.islandBoundRadius) {
        const scale = this.islandBoundRadius / radialDist;
        this.player.x *= scale;
        this.player.z *= scale;
      }
    } else {
      this.playerMoving = false;
    }

    // Jump & vertical gravity (ground Y = 0)
    if (jumpPressed && this.player.y <= 0 && this.player.vy <= 0) {
      this.player.vy = JUMP_VELOCITY;
    }
    if (this.player.y > 0 || this.player.vy > 0) {
      this.player.vy += GRAVITY * DT;
      this.player.y += this.player.vy * DT;
      if (this.player.y <= 0) {
        this.player.y = 0;
        this.player.vy = 0;
      }
    }

    // 3. Firefly mote pickup (horizontal XZ distance <= pickup_radius)
    if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
      const remainingMotes: MoteEntity[] = [];
      for (const mote of this.motes) {
        if (
          this.player.carried < this.tuning.carry_capacity &&
          distXZ(this.player.x, this.player.z, mote.x, mote.z) <= this.tuning.pickup_radius
        ) {
          this.player.carried += 1;
          this.score += this.tuning.score.per_mote;
          events.push(this.makeEvent('mote_picked', { carried: this.player.carried }));
        } else {
          remainingMotes.push(mote);
        }
      }
      this.motes.length = 0;
      this.motes.push(...remainingMotes);
    }

    // 4. Interact: deposit carried motes into nearest unlit lantern within interact_radius
    if (interactPressed && this.player.carried > 0) {
      let bestLantern: LanternEntity | null = null;
      let bestDist = Infinity;

      for (const lantern of this.lanterns) {
        if (lantern.lit || lantern.deposited >= this.tuning.lantern_cost) continue;
        const d = distXZ(this.player.x, this.player.z, lantern.x, lantern.z);
        if (d <= this.tuning.interact_radius) {
          if (
            d < bestDist - 1e-9 ||
            (Math.abs(d - bestDist) <= 1e-9 && (!bestLantern || lantern.id < bestLantern.id))
          ) {
            bestDist = d;
            bestLantern = lantern;
          }
        }
      }

      if (bestLantern) {
        const needed = this.tuning.lantern_cost - bestLantern.deposited;
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
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

            if (this.lanterns.every((l) => l.lit)) {
              this.finishGame('won', 'all_lit', events);
              return events;
            }
          }
        }
      }
    }

    // 5. Pulse: expend light to stun and push shades within pulse_radius
    if (
      pulsePressed &&
      this.player.carried >= this.tuning.pulse_cost &&
      this.pulseCooldownTicks <= 0
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.pulseCooldownTicks = secondsToTicks(this.tuning.pulse_cooldown_s);
      this.player.pulseCooldown = this.pulseCooldownTicks / TICK_RATE;
      this.lastPulseTick = this.simTick;
      this.lastPulsePos = [this.player.x, this.player.y, this.player.z];

      const stunTicks = secondsToTicks(this.tuning.pulse_stun_s);
      const stunnedIds: string[] = [];
      for (const shade of this.shades) {
        const dx = shade.x - this.player.x;
        const dz = shade.z - this.player.z;
        const d = Math.hypot(dx, dz);
        if (d <= this.tuning.pulse_radius) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          const rawX = shade.x + nx * this.tuning.pulse_push_m;
          const rawZ = shade.z + nz * this.tuning.pulse_push_m;
          // Ensure pulse push never parks a stunned shade inside a lit lantern's safe_radius
          const [safeX, safeZ] = this.projectOutsideSafeZones(rawX, rawZ, shade.x, shade.z);
          shade.x = safeX;
          shade.z = safeZ;
          shade.state = 'stunned';
          shade.stunTimer = stunTicks / TICK_RATE;
          this.shadeStunTicks.set(shade.id, stunTicks);
          stunnedIds.push(shade.id);
        }
      }
      stunnedIds.sort();
      this.score += stunnedIds.length * this.tuning.score.per_stun;
      events.push(this.makeEvent('pulse', { stunned_ids: stunnedIds }));
    }

    // 6. Shade AI movement (chase player, strictly avoid lit lanterns' safe_radius)
    this.updateShades();

    // 7. Shade collision with player (fleeing or stunned shades do not attack)
    if (this.player.flames > 0 && this.invulnTicks <= 0) {
      for (const shade of this.shades) {
        if (shade.state === 'stunned' || shade.state === 'flee') continue;
        if (distXZ(shade.x, shade.z, this.player.x, this.player.z) <= this.tuning.shade_hit_radius) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
          this.player.carried -= dropped;
          this.invulnTicks = secondsToTicks(this.tuning.invuln_s);
          this.player.invulnTimer = this.invulnTicks / TICK_RATE;

          events.push(
            this.makeEvent('player_hit', {
              by: 'shade',
              flames: this.player.flames,
              dropped,
            })
          );

          if (this.player.flames <= 0) {
            this.finishGame('lost', 'no_flames', events);
            return events;
          }
          break;
        }
      }
    }

    // 8. Dynamic spawners (only when enabled)
    if (this.randomMotes) {
      if (this.motes.length < MIN_MOTE_THRESHOLD) {
        this.moteRespawnTicks -= 1;
        if (this.moteRespawnTicks <= 0) {
          this.spawnRandomMote();
          this.moteRespawnTicks = secondsToTicks(MOTE_RESPAWN_INTERVAL_S);
        }
      } else {
        this.moteRespawnTicks = secondsToTicks(MOTE_RESPAWN_INTERVAL_S);
      }
    }

    if (this.randomShades && this.shades.length < MAX_SHADE_COUNT) {
      this.shadeSpawnTicks -= 1;
      if (this.shadeSpawnTicks <= 0) {
        this.spawnRandomShade(true, events);
        this.shadeSpawnTicks = secondsToTicks(SHADE_SPAWN_INTERVAL_S);
      }
    }

    // 9. Check dawn timeout
    if (this.timeLeftS <= 0) {
      this.finishGame('lost', 'dawn', events);
      return events;
    }

    return events;
  }

  private updateShades(): void {
    const litLanterns = this.lanterns.filter((l) => l.lit);
    const stepDist = this.tuning.shade_speed * DT;
    const safeLimit = this.tuning.safe_radius + SAFE_MARGIN;

    for (const shade of this.shades) {
      if (shade.state === 'stunned') continue;

      // Check if shade is currently inside any lit lantern's safe zone -> flee outward
      let repelX = 0;
      let repelZ = 0;
      let insideSafe = false;

      for (const lantern of litLanterns) {
        const dx = shade.x - lantern.x;
        const dz = shade.z - lantern.z;
        const d = Math.hypot(dx, dz);
        if (d <= this.tuning.safe_radius + 1e-6) {
          insideSafe = true;
          if (d > 1e-6) {
            repelX += dx / d;
            repelZ += dz / d;
          } else {
            repelX += 1;
          }
        }
      }

      if (insideSafe) {
        const rLen = Math.hypot(repelX, repelZ);
        const nx = rLen > 1e-6 ? repelX / rLen : 1;
        const nz = rLen > 1e-6 ? repelZ / rLen : 0;
        shade.x += nx * stepDist;
        shade.z += nz * stepDist;
        shade.state = 'flee';
        continue;
      }

      // Normal chase toward player
      const toPx = this.player.x - shade.x;
      const toPz = this.player.z - shade.z;
      const distToPlayer = Math.hypot(toPx, toPz);
      shade.state = 'chase';

      if (distToPlayer < 1e-6) continue;

      const moveDist = Math.min(stepDist, distToPlayer);
      let candX = shade.x + (toPx / distToPlayer) * moveDist;
      let candZ = shade.z + (toPz / distToPlayer) * moveDist;

      // Project candidate position strictly outside every lit lantern's safe_radius
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

      // Clamp displacement so projection never teleports shade faster than shade_speed
      const actualDx = candX - shade.x;
      const actualDz = candZ - shade.z;
      const actualLen = Math.hypot(actualDx, actualDz);
      if (actualLen > stepDist + 1e-9) {
        candX = shade.x + (actualDx / actualLen) * stepDist;
        candZ = shade.z + (actualDz / actualLen) * stepDist;
      }

      // Final hard guarantee: never accept a move that enters any lit lantern's safe_radius
      const violatesSafe = litLanterns.some(
        (l) => distXZ(candX, candZ, l.x, l.z) <= this.tuning.safe_radius
      );
      if (!violatesSafe) {
        shade.x = candX;
        shade.z = candZ;
      }
    }
  }

  getSnapshot(tick = this.simTick): SnapshotRecord {
    return {
      type: 'snapshot',
      tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: [round3(this.player.x), round3(this.player.y), round3(this.player.z)],
        flames: this.player.flames,
        carried: this.player.carried,
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
      })),
      motes_active: this.motes.length,
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.simTick,
      state: this.state,
      score: this.score,
    };
  }
}
