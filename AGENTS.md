# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

Short, authoritative operating manual for AI coding agents working on this repo.

## Commands
- Install deps: `npm ci` (or `npm install`)
- Build (typecheck + 3D web bundle + headless CLI): `npm run build`
- Run 3D web game: `npm run dev` (or `npm run preview` after build)
- Run headless simulation: `node dist-headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`
- Run tests: `npm test`
- Full verification gate (build + tests + Phase 1–2 regression + Phase 3 scenarios + Night 3 perf + determinism + proof): `npm run verify`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST have zero DOM, Three.js, browser, or Node fs dependencies. Both the 3D frontend (`src/game/`) and headless CLI (`src/headless/`) drive the exact same `GameSimulation` class at 60 Hz (`DT = 1/60`). Any creative extras or colorblind visuals in 3D rendering MUST NOT affect headless output.
2. **Single source of truth for tuning:** `game.contract.json` (Contract `v1.2`) is authoritative. `src/core/config.ts` imports `game.contract.json` directly so tuning numbers can NEVER drift.
3. **Determinism & Exact Integer Math:** Never use `Math.random()` or `Date.now()` inside `src/core/`. Always use `SeededRng` (`Mulberry32`) from `src/core/prng.ts`. Track all cooldown/stun/invuln/charm/TTL/spawn timers as **integer tick counts** (`Math.round(seconds * 60)`), and lantern fuel as **integer `1/60` units** (`6000 = 100.0`), rounding only on output (`round1`). Compute `time_left_s = initial_time_left_s - sim_tick / 60`.
4. **Test Contract v1.2 Invariants (Ticket-03):**
   - Nights 1/2/3 durations: `240 / 270 / 300 s` (`14,400 / 16,200 / 18,000` ticks); win threshold `ceil(0.6 * total)` (`3/5`, `4/6`, `5/7`). No early `all_lit` victory.
   - Exact tick order: Step 1 pause/input → Step 2 timers + fuel subtraction (`1/60` decay + `5/60` per draining shade) + immediate `lantern_out` (`fuel <= 0`, `deposited=0`, `ever_lit=true`) → Step 3 move/dash/pad/wind/fall → Step 4 pickup motes (up to dynamic `capacity = min(20, 10 + 2*successful_lights)`) & charms → Step 5 lantern interact (nearest eligible unlit or lit `<100` fuel; tie-break smaller id; refuel `>=30` ejects shades `<=30t`) → Step 6 safe zones (`lit && fuel >= 30`) → Step 7 pulse (`+15` total on `drain` shade, `+5` normal) → Step 8 shade (`spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`) & drifter move → Step 9 collisions (drifters before shades, ascending id) → Step 10 scheduled spawns → Step 11 win/loss AFTER all updates (`no_flames` ALWAYS > `dawn_survived` / `dawn`) → Step 12 snapshot.
   - Scoring: `+5` per mote deposited/refueled, `+100` first light, `+40` relight, `+5`/`+15` pulse, dawn win only `+(50 + floor(fuel))` per lit lantern + `+50 * flames` (no time bonus).
   - While paused: `tick` increments, `sim_tick` and all timers freeze, snapshot `state: "paused"`.
   - Full-night Night 3 headless run (`18,000` ticks) MUST complete in `<= 30 s` and be byte-identical (SHA-256).
   - Malformed `--inputs` or `--scenario` JSON MUST exit with code `2` and print to stderr.

## Workflow & Prohibitions
- Never claim a requirement passes without running `npm run verify` and inspecting real output.
- When requirements replace earlier rules, update affected tests WITH explicit written rationale (plus ADR & `CHANGELOG.md`) — never silently skip tests.
- Never hand-edit proof outputs, force-push, or delete harness files.
- Before tagging any phase, run an independent review pass (different agent/reviewer) against the phase ticket and Test Contract.
