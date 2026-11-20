---
name: verify-phase
description: Run full build, unit tests, headless contract scenarios, determinism checks, and write genuine proof artifacts for the current phase. Use before committing or tagging any phase.
---

# Verify Phase Skill

Use this skill whenever completing a feature milestone or preparing to tag a phase (`phase-1` .. `phase-4`).

## Steps
1. **Build & Typecheck:** Run `npm run build` and verify both `dist/` (3D web app) and `dist-headless/cli.js` (headless CLI) compile with zero errors.
2. **Automated Tests:** Run `npm test` (Vitest unit + headless CLI contract tests). All tests must pass.
3. **Headless Scenarios & Determinism Gate:** Run `npm run verify` (`scripts/verify-phase1.mjs`). Confirm:
   - Every scenario exits with the expected exit code (`0` for valid runs, `2` for malformed input/scenario tests).
   - Determinism check compares two independent runs with identical `--seed`, `--scenario`, and `--inputs` byte-for-byte (SHA-256 identical).
   - Genuine JSONL outputs and logs are written to `docs/proof/phase-1/`.
4. **Contract Sync Check:** Confirm `game.contract.json` tuning values match `src/core/config.ts` (imported directly) and `README.md` scoring documentation.
5. **Honest Reporting:** Update the traceability table in `docs/proof/phase-1/REPORT.md`. Mark any unverified or incomplete item honestly as `Chưa đạt` with reason. Never hand-edit output files.
