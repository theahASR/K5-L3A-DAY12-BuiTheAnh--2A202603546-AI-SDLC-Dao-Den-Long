---
name: verify-phase
description: Run full build, unit/CLI tests, Phase 1–3 regression, Phase 4 soak/leaderboard/accessibility checks, real 3D benchmark, and determinism verification, writing genuine proof artifacts. Use before committing or tagging any phase.
---

# Verify Phase Skill (v1.3 — Release Gate)

Use this skill whenever completing a milestone or preparing to tag `phase-4` / Release `v1.0.0`.

## Steps
1. **Build & Typecheck:** Run `npm run build` and verify `dist/` (3D web bundle) and `dist-headless/{cli,soak,bench}.js` compile with zero TypeScript or bundler errors.
2. **Automated Tests (Phase 1–4 Regression & New Features):** Run `npm test` (Vitest). All unit, CLI contract, Phase 3 v1.2, and Phase 4 tests (bench scene, soak, leaderboard, accessibility settings) MUST pass.
3. **Full Verification Gate (`npm run verify`):**
   - Runs Phase 1–3 regression scenarios (`verify-phase3.mjs` parity) + full Night 3 18,000-tick determinism & speed check (`<= 30 s`).
   - Runs 10-night soak test (`node dist-headless/soak.js --seed 7 --nights 10 --out soak.json`) and asserts `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb`.
   - Verifies `<run_cmd> --export-leaderboard` outputs valid sorted `{"entries": [...]}` JSON and exits `0`.
4. **3D Benchmark (`bench.json`):** Run `node dist-headless/bench.js --seed 42 --duration 30 --out bench.json` against a real 1280×720 Chromium/Chrome window and confirm valid Contract v1.3 schema (`avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`).
5. **Independent Review:** Run a read-only `research` subagent to audit Ticket-04 & Contract v1.3 compliance before tagging `phase-4`.
6. **Honest Proof Reporting:** Commit genuine `bench.json`, `soak.json`, `docs/proof/phase-4/REPORT.md`, `docs/notes/retro.md`, `CHANGELOG.md`, and `README.md`. Never hand-edit proof outputs.
