# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

Short, authoritative operating manual for AI coding agents working on this repo.

## Commands
- Install deps: `npm ci` (or `npm install`)
- Build (typecheck + 3D web bundle + headless CLI): `npm run build`
- Run 3D web game: `npm run dev` (or `npm run preview` after build)
- Run headless simulation: `node dist-headless/cli.js --seed 42 --night 1 --ticks 600 --out out.jsonl`
- Run tests: `npm test`
- Full verification gate (build + tests + Phase 1 regression + Phase 2 scenarios + 21,600-tick perf + determinism + proof): `npm run verify`

## Architecture Rules
1. **Strict core/render separation:** `src/core/` MUST have zero DOM, Three.js, browser, or Node fs dependencies. Both the 3D frontend (`src/game/`) and headless CLI (`src/headless/`) drive the exact same `GameSimulation` class at 60 Hz (`DT = 1/60`). Any creative extras in 3D rendering MUST NOT affect headless output.
2. **Single source of truth for tuning:** `game.contract.json` (Contract `v1.1`) is authoritative. `src/core/config.ts` imports `game.contract.json` directly so tuning numbers can NEVER drift.
3. **Determinism & Exact Tick Math:** Never use `Math.random()` or `Date.now()` inside `src/core/`. Always use `SeededRng` (`Mulberry32`) from `src/core/prng.ts`. Track all cooldown/stun/invuln/charm/TTL/spawn timers as **integer tick counts** (`Math.round(seconds * 60)`), never repeated `timer -= 1/60`. Compute `time_left_s = initial_time_left_s - sim_tick / 60`.
4. **Test Contract v1.1 Invariants (Ticket-02):**
   - Supports `--night 1`, `2`, `3` with exact standardized maps (`src/core/maps.ts`) and angle convention `(x = r*cos θ, z = r*sin θ)` CCW from `+X`.
   - Exact 12-step tick order: input/pause → decrement timers → player move/dash/pad/wind/fall → pickup motes/charms → lantern interact → safe zone update → pulse → shade/drifter move → collisions (drifters before shades, ascending id) → scheduled spawns → win/loss (`no_flames` > `all_lit` > `dawn`) → snapshot.
   - Scoring: `+10` per mote **deposited**, `+100` per lantern lit, `+5` per shade hit by pulse, win bonus `+floor(time_left_s)*2 + 50*flames`.
   - Shade states MUST use exact names: `spawning`, `wander`, `chase`, `recoil`, `stunned`.
   - While paused: `tick` increments, `sim_tick` and all timers freeze, snapshot `state: "paused"`.
   - Full-night headless run (21,600 ticks) MUST complete in `<= 30 s`.
   - Malformed `--inputs` or `--scenario` JSON MUST exit with code `2` and print to stderr.

## Workflow & Prohibitions
- Never claim a requirement passes without running `npm run verify` and inspecting real output.
- When requirements replace earlier rules, update affected tests WITH explicit written rationale — never silently skip tests.
- Never hand-edit proof outputs, force-push, or delete harness files.
- Before tagging any phase, run an independent review pass (different agent/reviewer) against the phase ticket and Test Contract.
