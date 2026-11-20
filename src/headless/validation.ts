import type { InputFrame, InputsFile, ScenarioFile, Vec3 } from '../core/types';

export class ContractValidationError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
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
    if (typeof f.tick !== 'number' || !Number.isInteger(f.tick) || f.tick < 0) {
      throw new ContractValidationError(`frames[${i}].tick must be a non-negative integer`);
    }
    if (f.tick <= prevTick) {
      throw new ContractValidationError(
        `frames[${i}].tick (${f.tick}) must be strictly greater than previous tick (${prevTick})`
      );
    }
    prevTick = f.tick;

    const frame: InputFrame = { tick: f.tick };

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
        throw new ContractValidationError(
          `frames[${i}].move components must be within [-1, 1]`
        );
      }
      frame.move = [f.move[0], f.move[1]];
    }

    if (f.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(f.cam_yaw_deg)) {
        throw new ContractValidationError(`frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = f.cam_yaw_deg;
    }

    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
      if (
        typeof raw.player.carried !== 'number' ||
        !Number.isInteger(raw.player.carried) ||
        raw.player.carried < 0
      ) {
        throw new ContractValidationError('scenario.player.carried must be a non-negative integer');
      }
      scenario.player.carried = raw.player.carried;
    }
    if (raw.player.flames !== undefined) {
      if (
        typeof raw.player.flames !== 'number' ||
        !Number.isInteger(raw.player.flames) ||
        raw.player.flames < 0
      ) {
        throw new ContractValidationError('scenario.player.flames must be a non-negative integer');
      }
      scenario.player.flames = raw.player.flames;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ContractValidationError('scenario.random_motes must be a boolean');
    }
    scenario.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ContractValidationError('scenario.random_shades must be a boolean');
    }
    scenario.random_shades = raw.random_shades;
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
        return { id: item.id, pos };
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
      return { id: item.id, pos };
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
        if (
          typeof item.deposited !== 'number' ||
          !Number.isInteger(item.deposited) ||
          item.deposited < 0
        ) {
          throw new ContractValidationError(
            `scenario.lanterns[${idx}].deposited must be a non-negative integer`
          );
        }
        out.deposited = item.deposited;
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
