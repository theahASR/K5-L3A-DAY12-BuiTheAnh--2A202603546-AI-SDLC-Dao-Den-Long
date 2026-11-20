# Phase 4 Specification & Verification Plan (Ticket-04 — "Bình minh: phát hành v1.0.0")

> **Phase:** 4 (`Ticket-04` · `Test Contract v1.3`)
> **Target tag:** `phase-4` + GitHub Release `v1.0.0`

## 1. Scope & Non-Breaking Guarantee
- All **Test Contract v1.0–v1.2** gameplay rules, tuning values, tick order, events, snapshots, and CLI exit codes remain **100% unchanged**.
- Phase 4 upgrades `contract_version` to `"1.3"`, adds `bench_cmd` and `soak_cmd`, optimizes 3D rendering for 200 shades + 100 motes via GPU instancing (`THREE.InstancedMesh`), and delivers local disk leaderboard, accessibility, packaging, retrospective, and release readiness.

## 2. Verifiable Acceptance Criteria

| ID | Section | Acceptance Criteria | Verification Method |
|---|---|---|---|
| AC-P4-1 | **Benchmark Mode** | `<bench_cmd> --seed 42 --duration 30 --out bench.json` opens 1280×720 non-fullscreen window (attempting vsync off via `--disable-gpu-vsync --disable-frame-rate-limit`), loads Night 1 with full lighting, 200 wandering shades (`seed 42`), 100 motes, L1–L3 lit (`fuel=100`), disables spawns/damage/pickup/fuel-decay/end, Mây static `(0,0,0)`, camera orbits radius `30 m` at `Y=15 m` CCW from `(30,15,0)` at `15 s/rev`, 3 s warmup + `--duration` s measure, writes Contract v1.3 `bench.json` and exits `0`. | Unit test (`BenchSimulation`) + real `node dist-headless/bench.js --seed 42 --duration 30 --out bench.json` |
| AC-P4-2 | **Soak Test** | `<soak_cmd> --seed 7 --nights 10 --out soak.json` runs 10 consecutive Nights cycling 1→2→3 in one process (`seed 7 + i`), seeded random inputs (`30t` move dir; per-tick 5% jump, 3% dash, 2% pulse, 10% interact), measures `mem_start_mb` & `mem_end_mb` RSS, outputs `soak.json` with `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb`. | Unit/CLI test + real `node dist-headless/soak.js --seed 7 --nights 10 --out soak.json` |
| AC-P4-3 | **Local Leaderboard** | Name input after Dawn (Night 3 win) or any Defeat; validates 3–12 chars (`[A-Za-z0-9_]` + Vietnamese letters); stores `name, score, nights_won (0–3), achieved_at (ISO 8601 w/ TZ), seed`; keeps top 10 sorted by `score` desc, tie-break earlier `achieved_at`; persists on disk across restarts; Main Menu Leaderboard screen; `<run_cmd> --export-leaderboard out.json` writes `{"entries": [...]}` and exits `0`. | Unit tests (`leaderboard.ts`) + CLI export integration test (`scripts/run-game.mjs --export-leaderboard`) |
| AC-P4-4 | **Accessibility** | (a) Rebind all 9 actions (4 moves, jump, dash, interact, pulse, pause) with duplicate-key detection alert, Reset Defaults button, persisted in `localStorage`; (b) Visual captions for shade spawn (+ edge directional arrow), wind warning/active, last 10 s countdown, low-fuel `< 30` lantern; (c) Reduce Motion toggle disables camera shake & flash/blink animations; (d) Base UI font size `>= 18px` at 1280×720 + Large Text (`×1.25`) toggle. | Unit tests (`settings.ts` keybinding conflicts & defaults) + CSS/DOM audit + build check |
| AC-P4-5 | **Packaging & Docs** | Clean clone runs in `<= 3` commands; `README.md` includes description, preview screenshot, system requirements, install, controls, test/headless/bench/soak/export commands, and demo link; `CHANGELOG.md` covers all 4 phases; `CREDITS.md` + `LICENSE` complete; `Dockerfile` + static release build ready for Release `v1.0.0`. | Clean verification + file checklist |
| AC-P4-6 | **Contract v1.3 & Regression** | `game.contract.json` is `"1.3"` with `bench_cmd` & `soak_cmd`; ALL Phase 1–3 tests and headless scenarios remain green. | `npm run verify` |
| AC-P4-7 | **Retro & Demo** | 1–2 page retrospective (`docs/notes/retro.md`) covering all 4 phases' evaluations, AI errors, harness effectiveness, token usage/savings, lessons; demo video guide/asset for `< 5 min` `.mp4` attached to Release `v1.0.0` (honestly noting any manual recording step). | Manual inspection + checklist |
