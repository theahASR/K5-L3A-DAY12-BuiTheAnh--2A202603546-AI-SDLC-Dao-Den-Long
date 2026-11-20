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
| Phase 2 | Ticket-02 analysis, Contract v1.1 spec & change log, 3-Night map geometry (`maps.ts`), 12-step simulation v1.1, 3D islands/HUD/audio/settings, 7 feature scenarios + 21.6k-tick benchmark, independent Phase 2 audit & fixes | ~140k in / ~42k out (~$0.95 equiv.) | Reused Phase 1 core/render separation directly; verified polar angle convention mathematically from Ticket-02 coords upfront; ran build + audit in parallel; single batched fix pass for all 8 audit findings |

### 3. Real AI Mistakes Detected & Harness Improvements

#### Phase 1
| # | AI Mistake | How Detected | Fix Applied | Harness / Process Update |
|---|---|---|---|---|
| 1 | **`timer -= 1/60` IEEE-754 drift (+1 tick error)** on `invuln_s` (91t vs 90t), `pulse_cooldown_s` (121t vs 120t), `pulse_stun_s` (181t vs 180t), and spawners | Independent Contract Reviewer (`research` subagent) + Node arithmetic verification | Replaced float countdowns in `src/core/simulation.ts` with exact integer tick counters (`Math.round(s * 60)`). Added exact-tick regression test (`C2`). | Updated `AGENTS.md` Rule #3 to explicitly forbid `timer -= 1/60` and require integer tick counters. |
| 2 | **`pulse` pushed shades into lit lantern `safe_radius`** and left them frozen inside for 3s | Independent Contract Reviewer audit | Added `projectOutsideSafeZones()` after `pulse_push_m` and regression test (`C1`). | Covered in `tests/simulation.test.ts` & enforced by Stop hook (`scripts/gate-check.mjs`). |
| 3 | **`time_left_s` computed as `initial - simTick * DT`** missed exact `0` on fractional durations (e.g. `3.7s` at tick 222) | Independent Contract Reviewer audit | Changed to exact `initialTimeLeftS - simTick / TICK_RATE` with `<= 1e-12` snap and added regression test (`C3`). | Added exact `time_left_s` formula to `AGENTS.md` Rule #3. |
| 4 | **Implicit `random_motes`/`random_shades` remained `true`** when scenario passed explicit `motes`/`shades` arrays without boolean flags | Independent Contract Reviewer audit | Defaulted `randomMotes = sc?.random_motes ?? (sc?.motes === undefined)` (same for `shades`) + regression test (`C4`). | Documented in `tests/simulation.test.ts`. |
| 5 | **`islandBoundRadius` unconditionally added `+8m` to spawned shades** (`34 + 8 = 42m > 38m` visual island) | Inspecting real JSONL output from `full-random` run (`player.pos` reached `r = 41.57m`) | Changed bound expansion to trigger ONLY when a scenario entity is placed outside `ISLAND_RADIUS`. | Reinforced `AGENTS.md` rule: inspect actual JSONL outputs, not just green exit codes. |
| 6 | **Determinism test input stood still after tick 600**, dying before tick 2700 so `shade_spawned` didn't fire | Running real `npm test` (`tests/headless-cli.test.ts` failed line 107) | Updated `scenarios/phase1/full-random.inputs.json` to keep Mây moving in a loop past 45s so `S3` spawns deterministically. | Confirmed `npm run verify` catches weak/mismatched scenarios immediately. |

#### Phase 2
| # | AI Mistake | How Detected | Fix Applied | Harness / Process Update |
|---|---|---|---|---|
| 7 | **Air-dash altitude hold dropped on tick 12/12** (`dashActiveTicks` decremented to `0` before checking `isDashingNow`) | Real `npm test` failure in `tests/simulation.test.ts:307` + confirmed by Phase 2 Contract Auditor | Captured `const isDashingNow = this.dashActiveTicks > 0` before decrementing `dashActiveTicks`. | Unit test asserts exact altitude hold on every single dash tick (`1..12`). |
| 8 | **Night 3 Drifter stayed at `y = 1.2`**, allowing steals on Tier 2 (`Y=6`) while remaining outside 3D Pulse radius (`5.6m > 5.0m`) | Independent Phase 2 Contract Auditor (`research` subagent) | Updated `stepDriftersMovement()` to track `Math.max(terrainH, player.y) + 1.2` while chasing/fleeing + added Tier 2 Drifter Pulse regression test. | Added elevation-aware 3D interaction check to independent review checklist. |
| 9 | **Safe-zone ejection used `allowVoid = true`**, risking stranding shades in void around Night 3 rim lanterns (`L6`, `L7`) or pinning against cliffs | Independent Phase 2 Contract Auditor | Switched `stepSafeZones()` to search walkable rotated escape angles (`allowVoid = false`) and update `shade.y = h + 1.0`. | Verified via `reg-safe-radius` and Night 3 full 21,600-tick run. |
| 10 | **Off-by-1 tick ordering on `recoil` (59t instead of 60t) and Wind Charm (599t instead of 600t)** due to Step 2 decrementing before Step 3/Step 8 used them | Independent Phase 2 Contract Auditor | Captured `charmActiveThisTick` before Step 2 decrement and moved `recoil` tick decrement to end of Step 8 move so full `60t = 2.0m` & `600t` boost execute. | Strengthened `AGENTS.md` Rule #4 documenting exact 12-step tick order. |
| 11 | **`idle` Drifters could steal when `carried < 5`** and collision sorting used locale-dependent `localeCompare` | Independent Phase 2 Contract Auditor | Required `d.state === 'chase'` for steals and replaced `localeCompare` with deterministic ASCII comparator + regression test. | Verified byte-identical SHA-256 across OS locales. |
