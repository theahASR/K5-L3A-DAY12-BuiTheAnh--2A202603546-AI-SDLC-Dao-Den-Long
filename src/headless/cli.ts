import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSimulation, createDefaultInput } from '../core/simulation';
import type { InputState, InputsFile, JsonlRecord, ScenarioFile } from '../core/types';
import { ContractValidationError, validateInputsFile, validateScenarioFile } from './validation';

interface CliArgs {
  seed: number;
  night: 1 | 2 | 3;
  scenarioPath?: string;
  inputsPath?: string;
  ticks: number;
  outPath: string;
  snapshotEvery: number;
}

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer value for ${flag}: ${raw ?? '(missing)'}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let night: number | undefined;
  let scenarioPath: string | undefined;
  let inputsPath: string | undefined;
  let ticks: number | undefined;
  let outPath: string | undefined;
  let snapshotEvery = 10;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntStrict(argv[++i], '--seed');
        break;
      case '--night':
        night = parseIntStrict(argv[++i], '--night');
        break;
      case '--scenario':
        scenarioPath = argv[++i];
        if (!scenarioPath) throw new Error('Missing value for --scenario');
        break;
      case '--inputs':
        inputsPath = argv[++i];
        if (!inputsPath) throw new Error('Missing value for --inputs');
        break;
      case '--ticks':
        ticks = parseIntStrict(argv[++i], '--ticks');
        break;
      case '--out':
        outPath = argv[++i];
        if (!outPath) throw new Error('Missing value for --out');
        break;
      case '--snapshot-every':
        snapshotEvery = parseIntStrict(argv[++i], '--snapshot-every');
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (seed === undefined) throw new Error('Missing required flag: --seed <int>');
  if (night === undefined) throw new Error('Missing required flag: --night <1|2|3>');
  if (night !== 1 && night !== 2 && night !== 3) {
    throw new Error(`Unsupported --night ${night}; Contract v1.2 supports --night 1, 2, or 3`);
  }
  if (ticks === undefined || ticks < 0) {
    throw new Error('Missing or invalid required flag: --ticks <non-negative int>');
  }
  if (!outPath) throw new Error('Missing required flag: --out <file.jsonl>');
  if (snapshotEvery <= 0) {
    throw new Error('--snapshot-every must be a positive integer');
  }

  return {
    seed,
    night,
    scenarioPath,
    inputsPath,
    ticks,
    outPath,
    snapshotEvery,
  };
}

function readJsonOrThrowFormatError(filePath: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${filePath}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ContractValidationError(
      `Invalid JSON syntax in ${label} file "${filePath}": ${(err as Error).message}`
    );
  }
}

export function runHeadless(argv: string[]): number {
  try {
    const args = parseArgs(argv);

    let scenario: ScenarioFile | undefined;
    if (args.scenarioPath) {
      const raw = readJsonOrThrowFormatError(args.scenarioPath, 'scenario');
      scenario = validateScenarioFile(raw);
    }

    let inputs: InputsFile | undefined;
    if (args.inputsPath) {
      const raw = readJsonOrThrowFormatError(args.inputsPath, 'inputs');
      inputs = validateInputsFile(raw);
    }

    const sim = new GameSimulation({
      seed: args.seed,
      night: args.night,
      scenario,
    });

    const lines: string[] = [];
    // Snapshot tick 0: post-scenario setup, pre-input
    lines.push(JSON.stringify(sim.getSnapshot(0)));

    const frames = inputs?.frames ?? [];
    let frameIdx = 0;
    const currentInput: InputState = createDefaultInput();

    for (let k = 0; k < args.ticks && sim.state !== 'won' && sim.state !== 'lost'; k++) {
      if (frameIdx < frames.length && frames[frameIdx].tick === k) {
        const f = frames[frameIdx++];
        if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
        if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
        if (f.jump !== undefined) currentInput.jump = f.jump;
        if (f.interact !== undefined) currentInput.interact = f.interact;
        if (f.pulse !== undefined) currentInput.pulse = f.pulse;
        if (f.dash !== undefined) currentInput.dash = f.dash;
        if (f.pause !== undefined) currentInput.pause = f.pause;
      }

      const events = sim.step(currentInput);
      for (const ev of events) {
        lines.push(JSON.stringify(ev));
      }

      const nextTick = k + 1;
      if (nextTick % args.snapshotEvery === 0) {
        lines.push(JSON.stringify(sim.getSnapshot(nextTick)));
      }
    }

    const endRec: JsonlRecord = sim.getEndRecord();
    lines.push(JSON.stringify(endRec));

    const outDir = dirname(args.outPath);
    if (outDir && outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(args.outPath, lines.join('\n') + '\n', 'utf-8');
    return 0;
  } catch (err) {
    if (err instanceof ContractValidationError) {
      console.error(`[contract-error] ${err.message}`);
      return err.exitCode;
    }
    console.error(`[headless-error] ${(err as Error).message}`);
    return 1;
  }
}

const exitCode = runHeadless(process.argv.slice(2));
process.exit(exitCode);
