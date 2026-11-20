# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

Short, authoritative operating manual for AI coding agents working on this repo.

## Commands
- Install deps: `npm ci` (or `npm install`)
- Build (typecheck + 3D web bundle + headless CLI): `npm run build`
- Run 3D web game: `npm run dev` (or `npm run preview` after build)
- Run headless simulation: `node dist-headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`
- Run tests: `npm test`
- Full verification gate (build + tests + headless scenarios + determinism + proof): `npm run verify`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST have zero DOM, Three.js, browser, or Node fs dependencies. Both the 3D frontend (`src/game/`) and the headless CLI (`src/headless/`) drive the exact same `GameSimulation` class at 60 Hz (`DT = 1/60`).
2. **Single source of truth for tuning:** `game.contract.json` is the authoritative tuning table. `src/core/config.ts` imports `game.contract.json` directly so tuning numbers can NEVER drift from the Test Contract.
3. **Determinism & Exact Tick Math:** Never use `Math.random()` or `Date.now()` inside `src/core/`. Always use the seeded `Mulberry32` PRNG from `src/core/prng.ts`. Track all cooldown/stun/invuln/spawn timers as **integer tick counts** (`Math.round(seconds * 60)`), never repeated `timer -= 1/60` (which suffers IEEE-754 +1 tick drift). Compute `time_left_s = initial_time_left_s - sim_tick / 60` directly (not `sim_tick * (1/60)`).
4. **Test Contract v1.0 invariants:**
   - Horizontal XZ distance only (`distXZ <= r`), ground at `Y = 0`, player starts `(0, 0, 0)`.
   - Tick 0 snapshot is post-scenario setup, pre-input. Setup emits NO events and awards NO score.
   - Step `k` (`0..N-1`) reads input at tick `k` and produces state/events at `tick = k + 1`.
   - `time_left_s = initial_time_left_s - sim_tick / 60`.
   - Malformed `--inputs` or `--scenario` JSON MUST exit with code `2` and print to stderr.
   - Round coordinates and `time_left_s` to 3 decimal places (`round3`, no `-0`).

## Workflow & Prohibitions
- Never claim a requirement passes without running `npm run verify` and inspecting real output.
- Never write tautological tests or hand-edit proof outputs.
- Keep commits small, scoped, and descriptive. Never force-push or delete harness files.
- Before tagging any phase, run an independent review pass (different agent/reviewer) against the phase spec and Test Contract.
