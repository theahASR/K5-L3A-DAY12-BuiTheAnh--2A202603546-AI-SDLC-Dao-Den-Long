# Phase 1 Verification Report & Evaluation (`PRD-0` · `Test Contract v1.0`)

- **Tag:** `phase-1`
- **Verification Command:** `npm run verify` (runs `tsc --noEmit`, `vite build`, `esbuild` headless bundle, `vitest run`, and `node scripts/verify-phase1.mjs`)
- **Platform:** Node.js `v22.21.0`, npm `10.9.4`, Windows 11 (pure TypeScript/WebGL + Node ESM headless bundle; portable to macOS & Linux)

## 1. Requirements Traceability Matrix

| Req | Requirement Summary (PRD-0 / Contract v1.0) | Verification Method | Genuine Evidence | Status |
|---|---|---|---|---|
| R1 | Đêm 1 – Đảo Bến: circular 3D island, 5 Great Lanterns (`L1..L5`), warm night fairy-tale style, progressive brightening, Mây wears *nón lá* with hanging lantern, non-violent | Production Vite build (`dist/index.html`, CSS, JS) + code audit (`src/game/renderer3d.ts`) | `vite build` clean (3.08s; `dist/index.html` 2.79 kB, JS 525.41 kB), [renderer3d.ts](../../../src/game/renderer3d.ts) | **Đạt (build & code verified)** — *Ghi nhận trung thực: chưa chụp screenshot chạy WebGL thực tế trong sandbox; cần mở `npm run preview` trên trình duyệt local để kiểm tra trực quan* |
| R2 | Walk, jump (`Y >= 0`, ground `Y = 0`), start `(0,0,0)`, 3D camera, exact yaw transform & vector normalization | Unit tests in `tests/simulation.test.ts` (yaw `0°`/`90°`, diagonal `[1,1]` norm, jump arc & rising edge) + independent reviewer vector math audit | [test-results.txt](test-results.txt) (13/13 unit tests passed) | **Đạt** |
| R3 | Firefly motes scattered, auto-pickup within XZ `pickup_radius = 1.8m` up to `carry_capacity = 5`, emits `mote_picked` | Unit test + headless scenario `win-flow` | [win-flow.jsonl](win-flow.jsonl) (`5` `mote_picked` events), [test-results.txt](test-results.txt) | **Đạt** |
| R4 | `interact` rising edge within `interact_radius = 2.5m` deposits motes (`deposit`) and lights lantern at `lantern_cost = 5` (`lantern_lit`) | Unit test + headless scenario `win-flow` | [win-flow.jsonl](win-flow.jsonl) (`deposit` + `lantern_lit` for `L1` at tick 87) | **Đạt** |
| R5 | Ink Shades chase player (`shade_speed = 3.8`), hit within `shade_hit_radius = 1.2m`, drop `floor(carried * 0.5)`, `invuln_s = 1.5s`, avoid lit lanterns' `safe_radius = 6.0m` | Unit tests + headless scenarios `safe-radius` & `shade-loss` | [safe-radius.jsonl](safe-radius.jsonl) (`min_shade_dist = 6.050m > 6.0m`, 0 hits), [shade-loss.jsonl](shade-loss.jsonl) (2 hits, `first_drop = 2`, `lost/no_flames` at tick 119) | **Đạt** |
| R6 | Light Pulse (`pulse` rising edge, cost `1`, radius `6.0m`, stun `3.0s = 180t`, push `4.0m`, cooldown `2.0s = 120t`) | Unit tests (incl. exact 120t/180t tick tests & C1 safe-radius push guard) + headless scenario `pulse-stun` | [pulse-stun.jsonl](pulse-stun.jsonl) (`pulse_events = 1`, `S1` stunned at `x = 8`, recovered at tick 210) | **Đạt** |
| R7 | Win (`all_lit`), Lose (`no_flames`, `dawn`), score formula, HUD & Replay button | Unit tests + scenarios `win-flow`, `shade-loss`, `dawn-loss` + `src/game/hud.ts` / `src/main.ts` | [win-flow.jsonl](win-flow.jsonl) (`won/all_lit`, score `896`), [dawn-loss.jsonl](dawn-loss.jsonl) (`lost/dawn` at tick `120`) | **Đạt** |
| R8 | `game.contract.json`, headless CLI flags, exit codes (`0` / `2` / non-zero), tick model, 3-decimal rounding, no setup events, byte-identical determinism | Vitest CLI suite (`tests/headless-cli.test.ts`, 6/6 passed) + 3000-tick dual-run SHA-256 comparison | [determinism.txt](determinism.txt) (`SHA-256: 6ae126d17da557f77957e095d92b1ba195b987ada81f4253f9702c9778fe8994`), [determinism-run1.jsonl](determinism-run1.jsonl), [determinism-run2.jsonl](determinism-run2.jsonl) | **Đạt** |

## 2. Phase 1 Evaluation
- **What passed:** All 19 automated tests (13 simulation unit tests + 6 headless CLI contract tests) and all 6 headless scenarios + 3000-tick SHA-256 determinism verification pass via one command (`npm run verify`).
- **Independent Review Impact:** Running a separate read-only `research` subagent against `PRD-0` and `Test Contract v1.0` uncovered 4 real critical bugs before tagging (pulse push into safe zone, IEEE-754 +1 tick timer drift, `simTick * DT` fractional dawn drift, implicit random spawns on explicit scenario lists). All 4 were fixed and covered by permanent regression tests.
- **Honest Gaps / Next Adjustments:**
  - Interactive browser WebGL visual inspection (live playtest screenshot/video) has not been captured inside the sandbox; recommended to open `npm run preview` locally to verify visual polish and prepare for Phase 4 demo video.
  - Vite bundle emits a chunk size notice (`525 kB` due to Three.js); acceptable for Phase 1, can code-split in Phase 4 if needed for performance tuning.
