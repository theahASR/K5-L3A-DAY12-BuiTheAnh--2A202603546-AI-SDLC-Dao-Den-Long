---
name: verify-phase
description: Run full build, unit tests, Phase 1 regression, Phase 2 contract v1.1 scenarios, determinism, and 21,600-tick performance benchmark, writing genuine proof artifacts. Use before committing or tagging any phase.
---

# Verify Phase Skill

Use this skill whenever completing a milestone or preparing to tag a phase (`phase-1` .. `phase-4`).

## Steps
1. **Build & Typecheck:** Run `npm run build` and verify both `dist/` (3D web app) and `dist-headless/cli.js` compile with zero errors.
2. **Automated Tests (Unit + CLI + Regression):** Run `npm test` (Vitest). Confirm Phase 1 regression scenarios (adapted to Contract v1.1 standardized numbers with documented reasons) and all Phase 2 tests pass.
3. **Headless Scenarios, Determinism & Perf Gate:** Run `npm run verify`:
   - Phase 1 regression scenarios pass under Contract v1.1 tuning.
   - Phase 2 scenarios cover every new feature: dash, fall & respawn, Night 2 jump pad & bamboo bridge, Night 3 ramps/tier-2/bell-tower/wind, Gió Lạc (drifter steal & pulse drop), Bùa Gió (wind charm), pause/resume.
   - Determinism check compares two full Night 3 runs byte-for-byte (SHA-256 identical).
   - Full-night performance check: 21,600 ticks (Night 3) completes in `<= 30 s`.
   - Malformed inputs/scenario files exit with code `2` and stderr output.
4. **Independent Review:** Run a read-only `research` subagent to audit implementation against the current Ticket and Test Contract before tagging.
5. **Honest Proof Reporting:** Save verbatim outputs to `docs/proof/phase-N/` and update `docs/proof/phase-N/REPORT.md` + `docs/notes/ai-log.md`. Never hand-edit outputs.
