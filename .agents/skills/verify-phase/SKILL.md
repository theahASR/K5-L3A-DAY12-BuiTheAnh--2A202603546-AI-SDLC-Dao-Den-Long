---
name: verify-phase
description: Run full build, unit tests, Phase 1–2 regression, Phase 3 contract v1.2 scenarios, determinism, and full-night Night 3 performance benchmark, writing genuine proof artifacts. Use before committing or tagging any phase.
---

# Verify Phase Skill

Use this skill whenever completing a milestone or preparing to tag a phase (`phase-1` .. `phase-4`).

## Steps
1. **Build & Typecheck:** Run `npm run build` and verify both `dist/` (3D web app) and `dist-headless/cli.js` compile with zero errors.
2. **Automated Tests (Unit + CLI + Regression):** Run `npm test` (Vitest). Confirm all non-superseded Phase 1–2 regression tests (and explicitly documented v1.2 updates) plus all Phase 3 tests pass with 0 skipped tests.
3. **Headless Scenarios, Determinism & Perf Gate:** Run `npm run verify`:
   - Non-superseded Phase 1–2 regression scenarios pass under Contract v1.2.
   - Phase 3 scenarios cover fuel decay & `lantern_out`, relight (5 motes / `+40`), refuel & safe-zone restoration ejection, stacked shade `drain` & `fuel_drain`, Pulse `+15` drain bonus, `dawn_survived` win + exact bonus, and last-tick `no_flames` priority.
   - Determinism check compares two full Night 3 runs (`18,000` ticks) byte-for-byte (SHA-256 identical).
   - Full-night performance check completes in `<= 30 s`.
   - Malformed inputs/scenario files exit with code `2` and stderr output.
4. **Independent Review:** Run a read-only `research` subagent to audit implementation against the current Ticket and Test Contract before tagging.
5. **Honest Proof Reporting:** Save verbatim outputs to `docs/proof/phase-N/` and update `docs/proof/phase-N/REPORT.md` + `docs/notes/ai-log.md`. Never hand-edit outputs.
