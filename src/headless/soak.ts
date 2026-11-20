import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TICK_RATE, round1 } from '../core/config';
import { SeededRng } from '../core/prng';
import { GameSimulation, createDefaultInput } from '../core/simulation';
import type { InputState } from '../core/types';

interface SoakArgs {
  seed: number;
  nights: number;
  outPath: string;
}

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid integer value for ${flag}: ${raw ?? '(missing)'}`);
  }
  return Number.parseInt(raw, 10);
}

function parseArgs(argv: string[]): SoakArgs {
  let seed = 7;
  let nights = 10;
  let outPath = 'soak.json';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntStrict(argv[++i], '--seed');
        break;
      case '--nights':
        nights = parseIntStrict(argv[++i], '--nights');
        break;
      case '--out':
        outPath = argv[++i];
        if (!outPath) throw new Error('Missing value for --out');
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (nights <= 0) throw new Error('--nights must be a positive integer');
  return { seed, nights, outPath };
}

function getRssMb(): number {
  return round1(process.memoryUsage().rss / (1024 * 1024));
}

export function runSoak(argv: string[]): number {
  try {
    const args = parseArgs(argv);
    // Brief disposable warmup so V8 TurboFan JIT code-cache allocation settles before Night 1 loads
    {
      let warmSim: GameSimulation | null = new GameSimulation({ seed: 0, night: 3 });
      const warmInput = createDefaultInput();
      warmInput.move = [1, 0];
      for (let w = 0; w < 320; w++) {
        warmInput.jump = w % 20 === 0;
        warmInput.dash = w % 35 === 0;
        warmInput.interact = w % 10 === 0;
        warmSim.step(warmInput);
      }
      warmSim = null;
    }

    const startMs = performance.now();
    const results: Array<'won' | 'lost'> = [];
    let crashes = 0;
    let memStartMb = 0;

    for (let i = 0; i < args.nights; i++) {
      const night = ((i % 3) + 1) as 1 | 2 | 3;
      const nightSeed = args.seed + i;

      try {
        let sim: GameSimulation | null = new GameSimulation({ seed: nightSeed, night });
        if (i === 0) {
          memStartMb = getRssMb();
        }

        const maxTicks = Math.round(sim.initialTimeLeftS * TICK_RATE) + 5;
        const inputRng = new SeededRng((nightSeed ^ 0x9e3779b9) >>> 0);
        const input: InputState = createDefaultInput();

        for (let t = 0; t < maxTicks && sim.state !== 'won' && sim.state !== 'lost'; t++) {
          if (t % 30 === 0) {
            const angle = inputRng.range(0, Math.PI * 2);
            input.move = [Math.cos(angle), Math.sin(angle)];
          }
          input.jump = inputRng.next() < 0.05;
          input.dash = inputRng.next() < 0.03;
          input.pulse = inputRng.next() < 0.02;
          input.interact = inputRng.next() < 0.10;
          input.pause = false;

          sim.step(input);
        }

        results.push(sim.state === 'won' ? 'won' : 'lost');
        // Explicitly release simulation instance after night finishes
        sim = null;
      } catch (err) {
        crashes += 1;
        results.push('lost');
        console.error(`[soak-crash] Night index ${i} (night=${night}, seed=${nightSeed}):`, err);
      }
    }

    const memEndMb = getRssMb();
    const durationS = round1((performance.now() - startMs) / 1000);

    const report = {
      nights: args.nights,
      crashes,
      results,
      mem_start_mb: memStartMb,
      mem_end_mb: memEndMb,
      duration_s: durationS,
    };

    const outDir = dirname(args.outPath);
    if (outDir && outDir !== '.') {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(args.outPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    console.log(
      `[soak] Completed ${args.nights} nights in ${durationS}s | crashes=${crashes} | mem=${memStartMb} -> ${memEndMb} MB`
    );

    return crashes === 0 ? 0 : 1;
  } catch (err) {
    console.error(`[soak-error] ${(err as Error).message}`);
    return 1;
  }
}

const code = runSoak(process.argv.slice(2));
process.exit(code);
