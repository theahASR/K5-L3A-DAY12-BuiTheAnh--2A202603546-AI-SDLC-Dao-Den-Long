# Phase 1 Specification, Assumptions & Verification Plan (PRD-0)

> **Phase:** 1 (`PRD-0` + `Test Contract v1.0`)
> **Target tag:** `phase-1`

## 1. Mandatory Requirements (from PRD-0 & Test Contract v1.0)
- **R1 (Level & Setting):** Night 1 – Đảo Bến, a circular 3D island floating in a sea of clouds with 5 Great Lanterns (`L1`..`L5`), warm night fairy-tale mood, island brightens as lanterns light up, warm golden-orange = good, dark purple = danger, Mây wears a conical hat (*nón lá*) with a small hanging lantern, non-violent.
- **R2 (Player Movement & 3D Camera):** Walk in 3D relative to camera yaw, jump (`Y >= 0`, ground `Y = 0`), third-person 3D camera, start at `(0, 0, 0)`.
- **R3 (Firefly Motes):** Scattered fireflies on the island, auto-pickup within `pickup_radius` (XZ) up to `carry_capacity`, emitting `mote_picked`.
- **R4 (Lantern Charging & Lighting):** Press `interact` (rising edge `false -> true`) within `interact_radius` (XZ) of an unlit lantern to deposit carried motes (`deposit` event). Reaching `lantern_cost` lights the lantern (`lantern_lit` event) and awards `score.per_lantern`.
- **R5 (Ink Shades & Safe Radius):** Ink Shades pursue Mây at `shade_speed` (XZ). Touching Mây within `shade_hit_radius` deals 1 flame damage (`player_hit`), triggers invulnerability `invuln_s`, and drops `floor(carried * hit_drop_ratio)`. Shades cannot enter `safe_radius` around **lit** lanterns.
- **R6 (Light Pulse):** Press `pulse` (rising edge) with `carried >= pulse_cost` and cooldown ready: costs `pulse_cost` motes, stuns shades within `pulse_radius` for `pulse_stun_s` (`state: "stunned"`), pushes them away by `pulse_push_m`, awards `score.per_stun` per stunned shade, emits `pulse`.
- **R7 (Win / Lose / Score / HUD / Replay):**
  - Win (`all_lit`) when all 5 lanterns are lit; lose (`no_flames`) when `flames == 0`; lose (`dawn`) when `time_left_s <= 0`.
  - Score calculation clearly defined and displayed in HUD along with lanterns lit, carried motes, flames, timer, pulse status.
  - Replay button resets Đêm 1 cleanly after win or loss.
- **R8 (Test Contract v1.0 Headless Mode):**
  - `game.contract.json` at repo root with exact tuning numbers.
  - Fixed 60 ticks/sec headless CLI (`--seed`, `--night`, `--scenario`, `--inputs`, `--ticks`, `--out`, `--snapshot-every`).
  - Exit `0` on completion/game-over, exit `2` on malformed inputs/scenario JSON, non-zero on other errors.
  - Strict tick model, coordinate rounding to 3 decimals, no setup events/score, full determinism across repeated runs.

## 2. Explicit Assumptions for Ambiguous PRD-0 Details
| Ambiguous area | Assumption chosen | Rationale |
|---|---|---|
| Island size & falling off | Circular island radius `38 m`; soft shore barrier (`fall_enabled: false`). Dynamic bound expands if a scenario places entities beyond `38 m`. | `island_radius` is not in `game.contract.json`; `fall_enabled: false` matches contract default and avoids unspecifiable cliff falls during automated tests. |
| Default lantern positions | `L1`..`L5` evenly spaced on a ring of radius `20 m` around `(0, 0, 0)` at `Y = 0`. | Balanced navigation around circular island Đảo Bến; easily overridden per `scenario.lanterns`. |
| Mote spawning (`random_motes: true`) | 20 initial motes placed deterministically at radius `5..32 m`; respawns 1 mote every `4 s` when active count `< 12` (up to `20`). | Keeps Night 1 smoothly winnable (`5 * 5 = 25` motes needed + pulse allowance) without flooding. |
| Shade spawning (`random_shades: true`) | 2 initial shades (`S1`, `S2`) at tick 0 placed at radius `24..30 m`; spawns 1 new shade every `45 s` up to max `5` shades (emitting `shade_spawned`). | Gives immediate tension without unfair spawn-camping at `(0, 0, 0)`. |
| Safe radius applies to which lanterns? | Only **lit** lanterns (`lit === true`) create `safe_radius = 6.0 m`. | Matches lore ("Bóng Mực sợ những chiếc đèn" — darkened lanterns must be relit first). Shades inside a newly lit lantern's safe zone immediately flee outward (`state: "flee"`). |
| Dropped motes on hit | `dropped = Math.floor(carried * hit_drop_ratio)` (`hit_drop_ratio = 0.5`); dropped motes dissipate into fog (`carried -= dropped`, not respawned as ground entities). | Predictable `motes_active` count in headless scenario tests. |
| Pulse on empty area or already-stunned shade | Allowed whenever `carried >= pulse_cost` and `cooldown <= 0`. Emits `pulse` with `stunned_ids: []` if no shade in range. Refreshes stun & pushes if shade already stunned. | Matches player expectation (light is spent on cast) and keeps event emission consistent. |
| Score formula | `+10` per mote picked, `+100` per lantern lit, `+25` per shade stunned by pulse. On **win** only: `+floor(time_left_s) * 2` + `flames * 50`. | All weights declared directly in `game.contract.json` (`tuning.score.*`). |
| Platform portability | TypeScript + Three.js (WebGL browser app via Vite) + pure Node.js headless CLI (`dist-headless/cli.js`). | Runs identically on macOS, Linux, and Windows with only Node.js >= 18; no OS-specific native binary dependencies. |

## 3. Verification Plan (Defined Before Coding)
| Req | Verification Method | Evidence Artifact |
|---|---|---|
| R1, R2 (Visual/3D/HUD/Replay) | Build production web bundle (`vite build`), run dev server & verify rendering/HUD/replay | Build output + browser verification screenshot (`docs/proof/phase-1/`) |
| R2 (Movement, yaw math, jump) | Vitest unit tests (`tests/simulation.test.ts`) checking `cam_yaw_deg` 0°/90°/180°, vector normalization, jump arc | Vitest test report (`docs/proof/phase-1/test-results.txt`) |
| R3, R4, R7 (Pickup, deposit, win, score) | Headless scenario `scenarios/phase1/win-flow.json` + unit tests | `docs/proof/phase-1/win-flow.jsonl` |
| R5 (Shade chase, safe radius, hit, loss) | Headless scenarios `scenarios/phase1/safe-radius.json` & `scenarios/phase1/shade-loss.json` | `docs/proof/phase-1/safe-radius.jsonl`, `docs/proof/phase-1/shade-loss.jsonl` |
| R6 (Pulse stun, push, cost, cooldown) | Headless scenario `scenarios/phase1/pulse-stun.json` + unit tests | `docs/proof/phase-1/pulse-stun.jsonl` |
| R7 (Dawn timeout loss) | Headless scenario `scenarios/phase1/dawn-loss.json` | `docs/proof/phase-1/dawn-loss.jsonl` |
| R8 (Contract exit codes & determinism) | CLI tests for exit code `2` on invalid JSON/non-monotonic ticks + SHA-256 dual-run comparison | `docs/proof/phase-1/determinism.txt` + Vitest CLI suite |
