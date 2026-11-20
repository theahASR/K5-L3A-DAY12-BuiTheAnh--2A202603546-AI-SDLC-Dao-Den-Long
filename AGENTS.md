# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

Short, authoritative operating manual for AI coding agents working on this repo.

## Commands
- Install deps: `npm ci` (or `npm install`)
- Build (typecheck + 3D web bundle + headless/soak/bench CLIs): `npm run build`
- Run 3D web game (with disk leaderboard server): `npm start` (or `node scripts/run-game.mjs`)
- Export leaderboard: `node scripts/run-game.mjs --export-leaderboard out.json`
- Run headless simulation: `node dist-headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`
- Run 10-night soak test: `node dist-headless/soak.js --seed 7 --nights 10 --out soak.json`
- Run 3D WebGL benchmark (1280×720): `node dist-headless/bench.js --seed 42 --duration 30 --out bench.json`
- Run tests: `npm test`
- Full verification gate (build + unit/CLI/Phase 1–4 tests + regression + soak + leaderboard export + proof): `npm run verify`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST have zero DOM, Three.js, browser, or Node fs dependencies. Both 3D frontend (`src/game/`) and headless/soak/bench CLIs (`src/headless/`) share `GameSimulation` at 60 Hz (`DT = 1/60`). Visual extras MUST NOT affect headless output and MUST be disabled during benchmark & soak runs.
2. **Single source of truth for tuning:** `game.contract.json` (Contract `v1.3`) is authoritative and imported directly by `src/core/config.ts`.
3. **Determinism & Exact Integer Math:** Never use `Math.random()` or `Date.now()` inside `src/core/`. Always use `SeededRng` (`Mulberry32`). Track all timers as integer ticks (`Math.round(s * 60)`) and lantern fuel as integer `1/60` units (`6000 = 100.0`). Compute `time_left_s = initial_time_left_s - sim_tick / 60`.
4. **GPU Performance & Stability (Phase 4):**
   - Use GPU-instanced `THREE.InstancedMesh` for Shades (up to 256) and Motes (up to 150) so the 200-shade / 100-mote benchmark scene stays under 40 draw calls (`avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`).
   - Soak runs MUST release per-night state cleanly (`crashes === 0`, `mem_end_mb <= 1.2 * mem_start_mb`).
5. **Test Contract v1.0–v1.3 Invariants:**
   - All v1.2 mechanics (fuel decay/drain, dawn survival `ceil(0.6 * total)`, dynamic capacity `10..20`, integer math, exact 12-step tick order, exit code `2` on malformed JSON) remain strictly intact.
   - Leaderboard persists on local disk (`~/.dao-den-long/leaderboard.json`), enforces 3–12 char names, sorts top 10 (`score` desc, `achieved_at` asc), and exports via `<run_cmd> --export-leaderboard <out.json>`.
   - Accessibility: 9-action key rebinding with conflict detection + reset, visual captions & shade-spawn edge arrow, reduce-motion mode, and UI text `>= 18px` at 1280×720 with `1.25×` large-text toggle.

## Workflow & Prohibitions
- Never claim a requirement passes without running `npm run verify` (and real `bench.js` / `soak.js`) and inspecting genuine outputs.
- Never hand-edit `bench.json`, `soak.json`, or proof outputs; never force-push or delete harness files.
- Before tagging any phase, run an independent review pass (different agent/reviewer) against the phase ticket and Test Contract.
