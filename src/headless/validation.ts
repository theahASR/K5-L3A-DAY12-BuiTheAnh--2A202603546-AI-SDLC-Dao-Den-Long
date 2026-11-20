import type {
  DrifterState,
  InputFrame,
  InputsFile,
  MoteKind,
  ScenarioFile,
  ShadeState,
  Vec3,
} from '../core/types';

export class ContractValidationError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
]);
const VALID_DRIFTER_STATES = new Set<DrifterState>(['idle', 'chase', 'flee']);
const VALID_MOTE_KINDS = new Set<MoteKind>(['random', 'dropped']);

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function assertNonNegInt(val: unknown, label: string): number {
  if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
    throw new ContractValidationError(`${label} must be a non-negative integer`);
  }
  return val;
}

function assertVec3(val: unknown, label: string): Vec3 {
  if (!Array.isArray(val) || val.length !== 3 || !val.every(isFiniteNumber)) {
    throw new ContractValidationError(`${label} must be an array of 3 finite numbers`);
  }
  return [val[0], val[1], val[2]];
}

export function validateInputsFile(raw: unknown): InputsFile {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError('Inputs file must be a JSON object');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractValidationError('Inputs file must contain a "frames" array');
  }

  const frames: InputFrame[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i++) {
    const f = raw.frames[i];
    if (!isPlainObject(f)) {
      throw new ContractValidationError(`frames[${i}] must be an object`);
    }
    const tick = assertNonNegInt(f.tick, `frames[${i}].tick`);
    if (tick <= prevTick) {
      throw new ContractValidationError(
        `frames[${i}].tick (${tick}) must be strictly greater than previous tick (${prevTick})`
      );
    }
    prevTick = tick;

    const frame: InputFrame = { tick };

    if (f.move !== undefined) {
      if (
        !Array.isArray(f.move) ||
        f.move.length !== 2 ||
        !isFiniteNumber(f.move[0]) ||
        !isFiniteNumber(f.move[1])
      ) {
        throw new ContractValidationError(`frames[${i}].move must be [x, z] of 2 finite numbers`);
      }
      if (f.move[0] < -1 || f.move[0] > 1 || f.move[1] < -1 || f.move[1] > 1) {
        throw new ContractValidationError(`frames[${i}].move components must be within [-1, 1]`);
      }
      frame.move = [f.move[0], f.move[1]];
    }

    if (f.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(f.cam_yaw_deg)) {
        throw new ContractValidationError(`frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = f.cam_yaw_deg;
    }

    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (f[key] !== undefined) {
        if (typeof f[key] !== 'boolean') {
          throw new ContractValidationError(`frames[${i}].${key} must be a boolean`);
        }
        frame[key] = f[key];
      }
    }

    frames.push(frame);
  }

  return { frames };
}

export function validateScenarioFile(raw: unknown): ScenarioFile {
  if (!isPlainObject(raw)) {
    throw new ContractValidationError('Scenario file must be a JSON object');
  }

  const scenario: ScenarioFile = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ContractValidationError('scenario.player must be an object');
    }
    scenario.player = {};
    if (raw.player.pos !== undefined) {
      scenario.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    }
    if (raw.player.carried !== undefined) {
      scenario.player.carried = assertNonNegInt(raw.player.carried, 'scenario.player.carried');
    }
    if (raw.player.flames !== undefined) {
      scenario.player.flames = assertNonNegInt(raw.player.flames, 'scenario.player.flames');
    }
    if (raw.player.invuln_ticks !== undefined) {
      scenario.player.invuln_ticks = assertNonNegInt(
        raw.player.invuln_ticks,
        'scenario.player.invuln_ticks'
      );
    }
    if (raw.player.dash_cd_ticks !== undefined) {
      scenario.player.dash_cd_ticks = assertNonNegInt(
        raw.player.dash_cd_ticks,
        'scenario.player.dash_cd_ticks'
      );
    }
    if (raw.player.pulse_cd_ticks !== undefined) {
      scenario.player.pulse_cd_ticks = assertNonNegInt(
        raw.player.pulse_cd_ticks,
        'scenario.player.pulse_cd_ticks'
      );
    }
    if (raw.player.charm_ticks !== undefined) {
      scenario.player.charm_ticks = assertNonNegInt(
        raw.player.charm_ticks,
        'scenario.player.charm_ticks'
      );
    }
  }

  for (const flag of [
    'random_motes',
    'random_shades',
    'random_drifters',
    'wind_enabled',
  ] as const) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== 'boolean') {
        throw new ContractValidationError(`scenario.${flag} must be a boolean`);
      }
      scenario[flag] = raw[flag];
    }
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractValidationError('scenario.motes must be an array');
    }
    scenario.motes = raw.motes.map((item, idx) => {
      if (Array.isArray(item)) {
        return assertVec3(item, `scenario.motes[${idx}]`);
      }
      if (isPlainObject(item)) {
        const pos = assertVec3(item.pos, `scenario.motes[${idx}].pos`);
        if (item.id !== undefined && typeof item.id !== 'string') {
          throw new ContractValidationError(`scenario.motes[${idx}].id must be a string`);
        }
        let kind: MoteKind | undefined;
        if (item.kind !== undefined) {
          if (typeof item.kind !== 'string' || !VALID_MOTE_KINDS.has(item.kind as MoteKind)) {
            throw new ContractValidationError(
              `scenario.motes[${idx}].kind must be "random" or "dropped"`
            );
          }
          kind = item.kind as MoteKind;
        }
        let ttl_s: number | null | undefined;
        if (item.ttl_s !== undefined) {
          if (item.ttl_s !== null && (!isFiniteNumber(item.ttl_s) || item.ttl_s < 0)) {
            throw new ContractValidationError(
              `scenario.motes[${idx}].ttl_s must be null or a non-negative number`
            );
          }
          ttl_s = item.ttl_s;
        }
        return { id: item.id, pos, kind, ttl_s };
      }
      throw new ContractValidationError(`scenario.motes[${idx}] must be [x,y,z] or {pos}`);
    });
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractValidationError('scenario.shades must be an array');
    }
    scenario.shades = raw.shades.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.shades[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.shades[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.shades[${idx}].id must be a string`);
      }
      let state: ShadeState | undefined;
      if (item.state !== undefined) {
        if (typeof item.state !== 'string' || !VALID_SHADE_STATES.has(item.state as ShadeState)) {
          throw new ContractValidationError(
            `scenario.shades[${idx}].state must be one of spawning, wander, chase, recoil, stunned`
          );
        }
        state = item.state as ShadeState;
      }
      let state_ticks_left: number | undefined;
      if (item.state_ticks_left !== undefined) {
        state_ticks_left = assertNonNegInt(
          item.state_ticks_left,
          `scenario.shades[${idx}].state_ticks_left`
        );
      }
      return { id: item.id, pos, state, state_ticks_left };
    });
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractValidationError('scenario.drifters must be an array');
    }
    scenario.drifters = raw.drifters.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.drifters[${idx}] must be an object`);
      }
      const pos = assertVec3(item.pos, `scenario.drifters[${idx}].pos`);
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.drifters[${idx}].id must be a string`);
      }
      let state: DrifterState | undefined;
      if (item.state !== undefined) {
        if (
          typeof item.state !== 'string' ||
          !VALID_DRIFTER_STATES.has(item.state as DrifterState)
        ) {
          throw new ContractValidationError(
            `scenario.drifters[${idx}].state must be idle, chase, or flee`
          );
        }
        state = item.state as DrifterState;
      }
      const stolen =
        item.stolen !== undefined
          ? assertNonNegInt(item.stolen, `scenario.drifters[${idx}].stolen`)
          : undefined;
      return { id: item.id, pos, state, stolen };
    });
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractValidationError('scenario.charms must be an array');
    }
    scenario.charms = raw.charms.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.charms[${idx}] must be an object`);
      }
      if (item.id !== undefined && typeof item.id !== 'string') {
        throw new ContractValidationError(`scenario.charms[${idx}].id must be a string`);
      }
      const pos =
        item.pos !== undefined ? assertVec3(item.pos, `scenario.charms[${idx}].pos`) : undefined;
      if (item.available !== undefined && typeof item.available !== 'boolean') {
        throw new ContractValidationError(`scenario.charms[${idx}].available must be a boolean`);
      }
      const respawn_ticks =
        item.respawn_ticks !== undefined
          ? assertNonNegInt(item.respawn_ticks, `scenario.charms[${idx}].respawn_ticks`)
          : undefined;
      let respawn_s: number | undefined;
      if (item.respawn_s !== undefined) {
        if (!isFiniteNumber(item.respawn_s) || item.respawn_s < 0) {
          throw new ContractValidationError(
            `scenario.charms[${idx}].respawn_s must be a non-negative number`
          );
        }
        respawn_s = item.respawn_s;
      }
      return {
        id: item.id,
        pos,
        available: item.available as boolean | undefined,
        respawn_ticks,
        respawn_s,
      };
    });
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractValidationError('scenario.lanterns must be an array');
    }
    scenario.lanterns = raw.lanterns.map((item, idx) => {
      if (!isPlainObject(item)) {
        throw new ContractValidationError(`scenario.lanterns[${idx}] must be an object`);
      }
      if (typeof item.id !== 'string' || item.id.length === 0) {
        throw new ContractValidationError(`scenario.lanterns[${idx}].id must be a non-empty string`);
      }
      const out: { id: string; pos?: Vec3; lit?: boolean; deposited?: number } = { id: item.id };
      if (item.pos !== undefined) {
        out.pos = assertVec3(item.pos, `scenario.lanterns[${idx}].pos`);
      }
      if (item.lit !== undefined) {
        if (typeof item.lit !== 'boolean') {
          throw new ContractValidationError(`scenario.lanterns[${idx}].lit must be a boolean`);
        }
        out.lit = item.lit;
      }
      if (item.deposited !== undefined) {
        out.deposited = assertNonNegInt(item.deposited, `scenario.lanterns[${idx}].deposited`);
      }
      return out;
    });
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ContractValidationError('scenario.time_left_s must be a non-negative finite number');
    }
    scenario.time_left_s = raw.time_left_s;
  }

  return scenario;
}
