# Changelog

All notable changes and breaking contract revisions for **Đảo Đèn Lồng** are documented in this file.

---

## [Phase 3 / Contract v1.2] — 2026-11-20 (`TICKET-03 — "Đèn cạn dầu"`)

### ⚠️ BREAKING CHANGES (Contract `v1.1` → `v1.2`)

1. **Lantern Fuel & Decay (Replaces permanent lit lanterns)**
   - **Before (`v1.1`):** Once lit, a lantern stayed lit permanently and refused further interaction.
   - **Now (`v1.2`):** Lit lanterns start at `fuel = 100` and decay continuously at `1.0 unit/s` (`1/60` per tick, tracked in exact integer `1/60` units). At `fuel <= 0`, the lantern turns off (`deposited = 0`, `ever_lit = true`) and emits `lantern_out { lantern_id }`.
   - **Refueling:** Interacting with a lit lantern below `100` fuel consumes `used = min(carried, ceil((100 - fuel) / 10))` motes, sets `fuel = min(100, fuel + 10 * used)`, awards `+5 * used` score, and emits `refuel { lantern_id, amount, fuel }`. Full lanterns (`used = 0`) are ignored on interact (no event, no score).
   - **Relighting:** An extinguished lantern (`ever_lit: true`) requires only `5` motes (`relight_cost`) instead of `10` (`lantern_cost`), increments `relit_count`, and emits `lantern_lit { lantern_id, relight: true }`.

2. **Conditional Safe Zone & Ink Shade `drain` State (Replaces permanent 6 m safe zone)**
   - **Before (`v1.1`):** Every lit lantern projected a permanent `6 m` safe zone; shades only had states `spawning | wander | chase | recoil | stunned`.
   - **Now (`v1.2`):** Lanterns with `fuel < 30` (`low_fuel_threshold`) **lose their safe zone** (exact `fuel === 30` retains it).
   - Added 6th shade state: **`drain`**. Wandering shades prioritize the nearest weak lit lantern (`lit && fuel < 30`, tie-break smaller `id`), entering `drain` at `<= 2 m` XZ and siphoning `5 fuel/s` (`5/60` per tick, stacking across multiple shades, emitting `fuel_drain { lantern_id, shade_id, fuel }` every 60 ticks).
   - Refueling a weak lantern back to `>= 30` restores its safe zone and ejects any shade within `6 m` in `<= 30` ticks without dealing damage.
   - Stunned shades always recover to `wander`.

3. **Dawn Survival Win Condition & Night Durations (Replaces early `all_lit` victory)**
   - **Before (`v1.1`):** Lighting all lanterns ended the Night immediately with `game_over { result: "won", reason: "all_lit" }`. Night durations were `300 / 330 / 360 s`.
   - **Now (`v1.2`):** Early victory is **removed** (`all_lit` is no longer emitted). Night durations are shortened to **`240 / 270 / 300 s`** (`14,400 / 16,200 / 18,000` ticks).
   - Players win at dawn (`time_left_s <= 0`) if alive (`flames > 0`) with at least `ceil(0.6 * total_lanterns)` lit lanterns (`3/5` Night 1, `4/6` Night 2, `5/7` Night 3), emitting `game_over { result: "won", reason: "dawn_survived" }`. Otherwise, `game_over { result: "lost", reason: "dawn" }`.
   - Step 11 runs after all tick updates (including Step 2 fuel decay/extinguish and Step 9 collisions); losing the last flame on the dawn tick always loses with `no_flames` first.

4. **Scoring Formula Overhaul (Replaces all `v1.1` scoring rules)**
   - Per mote deposited or refueled: `+10` → **`+5`** (`score.per_mote`).
   - First lantern light: **`+100`** (`score.per_lantern`).
   - Relight (`ever_lit: true`): **`+40`** (`score.per_relight`).
   - Pulse hit on Shade: **`+5`** total (`score.per_stun`), or **`+15`** total (`score.per_drain_stun`) if the shade was in `drain` immediately before Pulse.
   - Win bonus (`dawn_survived`): **`+50 + floor(fuel)`** per lit lantern (`score.per_lit_lantern_dawn`) + **`+50`** per remaining flame (`score.per_flame_left`).
   - **Removed:** Time bonus (`per_second_left`).

5. **Test Contract `v1.2` Schema Changes (`game.contract.json`, Snapshot, Scenario, Events)**
   - `contract_version`: `"1.1"` → `"1.2"`.
   - `tuning` added: `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`; `night1/2/3_duration_s` changed to `240/270/300`.
   - Snapshot `lanterns[]` added: `fuel` (1 decimal float; `0` when unlit), `ever_lit`, `relit_count`.
   - Snapshot `player` added: `capacity` (`10 + 2 * successful_lights`, capped at `20`).
   - Scenario `lanterns[]` added: `fuel`, `ever_lit` (lit lanterns without `fuel` default to `100`).
   - Scenario `player` added: `successful_lights`.
   - Scenario `shades[]` added: `state: "drain"` and `target_lantern_id`.
   - Events added: `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit` added `relight: boolean`; `game_over.reason` added `dawn_survived` and removed `all_lit`.

### ✨ Added
- **Progressive Carry Capacity:** `10 + 2 * successful_lights` (max `20`), counting both first lights and relights, reset each Night, displayed dynamically on HUD (`carried / capacity`) and 3D orbiting orbs.
- **Colorblind / High-Contrast Mode (`"Bảng màu dễ phân biệt"`):** Saved in `localStorage`; switches Ink Shade rim & eyes `#7A3CFF` → `#00B3FF`, UI warning color `#FF5A5F` → `#FFFFFF` paired with `⚠` icon.
- **Color-Independent Lantern Readability:** Unlit lanterns deflate 20% vertically with visible paper tear marks; lit lanterns display an overhead 3D fuel bar that blinks slowly at 1 Hz (alongside the lantern light) when `fuel < 30`.
- **ADR & Phase 3 Verification Suite:** Added [ADR-001](docs/adr/ADR-001-lantern-fuel-and-dawn-survival.md), `tests/phase3.test.ts`, 6 scenarios in `scenarios/phase3/`, and `scripts/verify-phase3.mjs`.

### 🧪 Updated Tests (With Explicit Rationale — Zero Silent Skips)
- `tests/simulation.test.ts` (`deposits motes ...`): Updated from expecting early `all_lit` win + `+10/mote` + time bonus to verifying v1.2 `+5/mote`, `+100` first light, `relight: false`, `capacity: 12`, `fuel: 100`, and continuing in `'playing'` state.
- `tests/headless-cli.test.ts` (`Phase 1 regression: win-flow ...`): Updated from asserting `end.state === 'won'` at tick 87 (`all_lit`) to verifying L1 lights with `relight: false`, no early `game_over`, `score: 125`, `capacity: 12`, and full v1.2 snapshot fields. Full Night 3 perf test updated for v1.2 `300 s` (`18,000` ticks) duration.

---

## [Phase 2 / Contract v1.1] — `phase-2` (`TICKET-02 — "Ba hòn đảo"`)
- Standardized tuning & 3-Night campaign (`Đảo Bến`, `Đảo Cau`, `Đảo Chuông`), 12-step tick order, Dash, Void Fall & Respawn, Jump Pads, 3D Ramps & Bell Tower, Night 3 Wind Gusts, Gió Lạc (Drifters), Bùa Gió (Wind Charms), Pause/Resume, Full HUD, Audio, Settings, and 21,600-tick benchmark (`< 1 s`).

## [Phase 1 / Contract v1.0] — `phase-1` (`PRD-0 — Đêm 1`)
- Initial 60 Hz deterministic core simulation, Three.js Night 1 (`Đảo Bến`) 3D playable game, headless JSONL CLI, unit tests, and verification harness.
