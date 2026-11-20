# AI Usage Log, Error Analysis & Token Tracking

## Phase 1 (CP0 + PRD-0 + Test Contract v1.0)

### 1. Workflow & Token-Saving Practices
- Read all lab documentation (`README`, `RUBRIC`, `RULES`, `GUIDE`, `CHECKPOINTS`, `SUBMISSION`) and full `PRD-0` + `Test Contract v1.0` before designing or writing code.
- Wrote explicit assumptions and verification criteria (`docs/notes/phase-1-spec.md`) **before** implementation, eliminating rework.
- Kept `AGENTS.md` short (~35 lines) so recurring prompt context stayed lean.
- Imported `game.contract.json` directly into `src/core/config.ts` so tuning numbers can never diverge from the contract.
- Batched independent file writes in parallel and ran an independent read-only `research` subagent to audit the code against Test Contract v1.0 before tagging.

### 2. Estimated Token / Cost Log
| Phase | Activities | Est. Input / Output Tokens | Token-Saving Actions |
|---|---|---|---|
| Phase 1 | Lab docs & PRD-0 analysis, CP0 harness setup, core sim + headless CLI, Three.js 3D game, test suite, independent contract audit & fixes, proof generation | ~95k in / ~28k out (~$0.65 equiv.) | Concise `AGENTS.md`, plan-before-code spec, parallel writes, single-pass targeted fixes from independent audit |

### 3. Real AI Mistakes Detected & Harness Improvements

| # | AI Mistake | How Detected | Fix Applied | Harness / Process Update |
|---|---|---|---|---|
| 1 | **`timer -= 1/60` IEEE-754 drift (+1 tick error)** on `invuln_s` (91t vs 90t), `pulse_cooldown_s` (121t vs 120t), `pulse_stun_s` (181t vs 180t), and spawners | Independent Contract Reviewer (`research` subagent) + Node arithmetic verification | Replaced float countdowns in `src/core/simulation.ts` with exact integer tick counters (`Math.round(s * 60)`). Added exact-tick regression test (`C2`). | Updated `AGENTS.md` Rule #3 to explicitly forbid `timer -= 1/60` and require integer tick counters. |
| 2 | **`pulse` pushed shades into lit lantern `safe_radius`** and left them frozen inside for 3s | Independent Contract Reviewer audit | Added `projectOutsideSafeZones()` after `pulse_push_m` and regression test (`C1`). | Covered in `tests/simulation.test.ts` & enforced by Stop hook (`scripts/gate-check.mjs`). |
| 3 | **`time_left_s` computed as `initial - simTick * DT`** missed exact `0` on fractional durations (e.g. `3.7s` at tick 222) | Independent Contract Reviewer audit | Changed to exact `initialTimeLeftS - simTick / TICK_RATE` with `<= 1e-12` snap and added regression test (`C3`). | Added exact `time_left_s` formula to `AGENTS.md` Rule #3. |
| 4 | **Implicit `random_motes`/`random_shades` remained `true`** when scenario passed explicit `motes`/`shades` arrays without boolean flags | Independent Contract Reviewer audit | Defaulted `randomMotes = sc?.random_motes ?? (sc?.motes === undefined)` (same for `shades`) + regression test (`C4`). | Documented in `tests/simulation.test.ts`. |
| 5 | **`islandBoundRadius` unconditionally added `+8m` to spawned shades** (`34 + 8 = 42m > 38m` visual island) | Inspecting real JSONL output from `full-random` run (`player.pos` reached `r = 41.57m`) | Changed bound expansion to trigger ONLY when a scenario entity is placed outside `ISLAND_RADIUS`. | Reinforced `AGENTS.md` rule: inspect actual JSONL outputs, not just green exit codes. |
| 6 | **Determinism test input stood still after tick 600**, dying before tick 2700 so `shade_spawned` didn't fire | Running real `npm test` (`tests/headless-cli.test.ts` failed line 107) | Updated `scenarios/phase1/full-random.inputs.json` to keep Mây moving in a loop past 45s so `S3` spawns deterministically. | Confirmed `npm run verify` catches weak/mismatched scenarios immediately. |
