# Changelog

All notable changes and contract revisions for **Đảo Đèn Lồng** across all 4 phases are documented in this file.

---

## [1.0.0 — Phase 4 / Contract v1.3] — 2026-11-20 (`TICKET-04 — "Bình minh: phát hành v1.0.0"`)

### ✨ Added
- **3D Benchmark Mode (`bench_cmd`: `node dist-headless/bench.js`):** Launches a 1280×720 non-fullscreen Chromium/Chrome window with `--disable-gpu-vsync --disable-frame-rate-limit`, renders Night 1 with full lighting, 200 wandering Ink Shades (`seed 42`), 100 firefly motes, L1–L3 lit (`fuel = 100`), static Mây at `(0,0,0)`, CCW orbital camera (`r = 30 m`, `Y = 15 m`, `15 s/rev` from `(30, 15, 0)`), 3 s warmup + `--duration` s measurement, outputting Contract v1.3 `bench.json` and auto-exiting `0`.
- **10-Night Soak Test (`soak_cmd`: `node dist-headless/soak.js`):** Runs 10 consecutive headless Nights cycling `1 → 2 → 3` in one Node process (`seed 7 + i`) with exact seeded random inputs (`30 t` move direction; `5%` jump, `3%` dash, `2%` pulse, `10%` interact), verifying `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb` → `soak.json`.
- **Local Disk Leaderboard & Export CLI (`scripts/run-game.mjs`):**
  - Save score after Dawn victory (Night 3) or any Night defeat with 3–12 char validation (`[A-Za-z0-9_]` + Vietnamese letters).
  - Persists top 10 (`score` desc, tie-break earlier `achieved_at` ISO 8601 w/ timezone) to `~/.dao-den-long/leaderboard.json` across restarts.
  - Main-menu Top-10 Leaderboard screen + `<run_cmd> --export-leaderboard out.json` CLI.
- **Accessibility Suite:**
  - Full 9-action key rebinding (4 moves, jump, dash, interact, pulse, pause) with duplicate-conflict warning, "Khôi phục mặc định" reset, and `localStorage` persistence.
  - Visual captions for Ink Shade spawn (plus screen-edge directional arrow), wind warning/active, last 10 s countdown, and low-fuel `< 30` lanterns.
  - Reduce Motion mode disabling camera shake and flash/blink animations.
  - Minimum `18px` base UI font size at 1280×720 + Large Text (`×1.25`) toggle.
- **Packaging & Release Documentation:** `Dockerfile`, `tests/phase4.test.ts`, `scripts/verify-phase4.mjs`, `docs/notes/retro.md`, committed `bench.json` & `soak.json`.

### ⚡ Performance
- Refactored Shades (up to 256) and Motes (up to 160) in `src/game/renderer3d.ts` to GPU-instanced `THREE.InstancedMesh`, reducing benchmark draw calls from ~1,400 to `< 40`.

### 🔄 Contract & Test Updates
- `game.contract.json` upgraded `"1.2"` → `"1.3"`, adding `bench_cmd`, `soak_cmd`, and updating `run_cmd` to `"node scripts/run-game.mjs"`. All v1.0–v1.2 gameplay mechanics and tuning remain strictly unchanged.
- Updated `tests/phase3.test.ts` lines 8 and 401 with explicit rationale comments for `contract_version: "1.3"` and expanded `GameSettings` fields.

---

## [Phase 3 / Contract v1.2] — 2026-11-20 (`TICKET-03 — "Đèn cạn dầu"`)

### ⚠️ BREAKING CHANGES (Contract `v1.1` → `v1.2`)
1. **Lantern Fuel & Decay:** Lit lanterns start at `fuel = 100`, decay at `1.0/s` (exact integer `1/60` units), extinguish at `0` (`lantern_out`), refuel `+10/mote` (`refuel`), and relight at `5` motes (`relight_cost`, `+40` score, `lantern_lit { relight: true }`).
2. **Conditional Safe Zone & Ink Shade `drain` State:** Safe zone drops below `fuel < 30`; wandering shades target weak lanterns and drain `5 fuel/s` (stacking, `fuel_drain` every 60 ticks).
3. **Dawn Survival Win Condition & Durations:** Removed early `all_lit` victory; Night durations `240 / 270 / 300 s`; win at dawn with `>= ceil(0.6 * total)` lit lanterns (`dawn_survived`).
4. **Scoring & Progressive Capacity:** `+5/mote` deposit/refuel, `+100` light, `+40` relight, `+5` pulse / `+15` draining-shade pulse, dawn bonus `+50 + floor(fuel)` per lit lantern + `+50` per flame. Carry capacity grows `10 + 2 * successful_lights` (max `20`).
5. **Colorblind Mode & Visual Readability:** `"Bảng màu dễ phân biệt"` (`#00B3FF` shades, `#FFFFFF` + `⚠` warnings), 20% deflated torn unlit lanterns, overhead 3D fuel bar blinking at 1 Hz when `< 30`.

---

## [Phase 2 / Contract v1.1] — `phase-2` (`TICKET-02 — "Ba hòn đảo"`)
- Standardized tuning & 3-Night campaign (`Đảo Bến`, `Đảo Cau`, `Đảo Chuông`), exact 12-step tick order, Dash, Void Fall & Respawn, Jump Pads, 3D Ramps & Bell Tower, Night 3 Wind Gusts, Gió Lạc (Drifters), Bùa Gió (Wind Charms), Pause/Resume, Full HUD with off-screen arrow, Audio, Persisted Settings, and 21,600-tick benchmark (`< 1 s`).

---

## [Phase 1 / Contract v1.0] — `phase-1` (`PRD-0 — Đêm 1`)
- Initial 60 Hz deterministic core simulation (`Mulberry32` PRNG + exact integer tick counters), Three.js Night 1 (`Đảo Bến`) 3D playable game, headless JSONL CLI (`exit 2` validation), unit/CLI tests, CI workflow, and AI harness (`AGENTS.md`, `verify-phase`, `gate-check`).
