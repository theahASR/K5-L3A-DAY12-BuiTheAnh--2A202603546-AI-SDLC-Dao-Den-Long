# Phase 2 Specification, Change Log & Verification Plan (Ticket-02 — "Ba hòn đảo")

> **Phase:** 2 (`Ticket-02` · `Test Contract v1.1`)
> **Target tag:** `phase-2`

## 1. Requirement Changes From Phase 1 → Phase 2 (Why Design & Tests Change)

Ticket-02 standardizes core tuning across all submissions and expands the game from 1 island to 3 Nights. Every change below intentionally supersedes a Phase 1 assumption:

| Area | Phase 1 Assumption | Phase 2 Standard (Ticket-02) | Impact on Phase 1 Tests |
|---|---|---|---|
| Carry capacity & lantern cost | `5` / `5` | `10` / `10` | Update test fixtures expecting 5 motes to use 10 motes (with note). |
| Pickup / interact / shade hit radius | `1.8` / `2.5` / `1.2` m | `1.0` / `2.0` / `1.0` m (+ vertical height diff `<= 1.5 m` for pickup & shade hit) | Update positions in Phase 1 scenarios/tests to match new radii. |
| Jump velocity | `7.5 m/s` | `7.0 m/s` (gravity `-20 m/s²`) | Jump arc test still passes (`peakY > 1.0`). |
| Pulse tuning & hit shape | Cost `1`, radius `6 m`, stun `3 s`, cooldown `2 s`, instant XZ push | Cost `3`, 3D radius `5 m` from `feet + 0.8 m`, stun `120 t` (`2 s`), push `4 m` over first `15 t`, cooldown `180 t` (`3 s`) | Update pulse unit tests & `pulse-stun` scenario to use cost 3, 120t stun, 15t push, 180t cooldown. |
| Scoring | `+10` per mote picked, `+25` per stun | `+10` per mote **deposited**, `+100` per lantern lit, **`+5`** per shade hit by pulse, win bonus `+floor(s)*2 + 50*flames` | Update score assertions in `simulation.test.ts` & `win-flow`. |
| Falling off island | `fall_enabled: false` (barrier at 38 m) | `fall_enabled: true` (`Y < -10`: `-1` flame, lose all carried motes, wait 60t, respawn `(0,0,0)` with 90t invuln; instant loss if 0 flames) | Replace barrier assumption with real void fall & respawn tests. |
| Dropped motes on shade hit | Dissipated into fog | Spawned on `1.5–2.5 m` ring as `kind: "dropped"` with `480 t` TTL, pickable from next tick | Add dropped-mote ring & TTL tests. |
| Shade states & schedule | `chase`/`flee`/`stunned`, 2 at tick 0, speed `3.8` | Exact names: `spawning`, `wander`, `chase`, `recoil`, `stunned`; detect `12 m`/drop `18 m`; `4.0 m/s` (Night 3 `4.5 m/s`); 2 at tick `300`, then every `8s`/`7s`/`6s` | Update shade state assertions & `safe-radius` / `shade-loss` scenarios. |
| Night 1 Map | Radius `38 m`, lanterns on `r = 20 m` | Radius `40 m`, exact lantern coords `L1..L5` on `r = 25 m`, 24 mote spawns, 12 shade spawns on `r = 37 m` | Update map layout in `src/core/maps.ts`. |

## 2. Acceptance Criteria for Phần 3 Features (Verifiable)

| ID | Feature | Verifiable Acceptance Criteria | Verification Method |
|---|---|---|---|
| AC-P2-1 | **Lướt (Dash)** | Pressing `dash` (rising edge) dashes at `14 m/s` for `12 t` (`0.2 s`), `90 t` (`1.5 s`) cooldown from dash start, keeps altitude in air, uses move dir or facing dir if idle, emits `dash {}`, not invulnerable. | Unit test + `scenarios/phase2/dash-flow` |
| AC-P2-2 | **Rơi khỏi đảo (Fall & Respawn)** | Walking past island boundary drops Y below `-10`: triggers once ignoring invuln, `-1` flame, loses all carried motes, emits `player_hit {by:"fall", flames, dropped:0, lost}`, waits `60 t` (no pickup/hit), respawns `(0,0,0)` with `vel:[0,0,0]` and `90 t` invuln; if 0 flames -> instant `game_over (no_flames)`. | Unit test + `scenarios/phase2/fall-respawn` |
| AC-P2-3 | **Đêm 2 — Đảo Cau (2 Islands, Bridge, Jump Pads)** | 2 circular islands (`r=28 m` at `(0,0)` and `(70,0)`), bamboo bridge `x∈[26,44], z∈[-2,2]`, 6 lanterns `L1..L6`, 2 jump pads at `(20,0,18)` & `(50,0,-18)` launching `vy=14, vh=24` toward opposite island center without move override (dash allowed), landing safely on target island. | Unit test + `scenarios/phase2/night2-island-hop` |
| AC-P2-4 | **Đêm 3 — Đảo Chuông (3 Tiers, Ramps, Jump Pad, Bell Tower, Wind)** | Circular island `r=45 m` with Tier 0 (`Y=0`), Tier 1 (`Y=3`, `r∈[12,24], z>0`), Tier 2 (`Y=6`, `r≤8`), vertical cliffs, 2 ramps at `30°`/`150°` (`r=30→24`, width `3 m`), jump pad `(0,3,13)` landing on Tier 2, impassable bell tower `r=2 m`, 7 lanterns `L1..L7`, wind gust every `30 s` lasting `5 s` pushing `2 m/s` after `2 s` warning. | Unit test + `scenarios/phase2/night3-tiers-wind` |
| AC-P2-5 | **Gió Lạc (Drifters — Nights 2 & 3)** | Max 2, spawns at ticks `1200, 2400, ...` (`D1, D2...`), `idle` (2 m/s) → `chase` (7 m/s) when `carried >= 5 && dist <= 15 m`, reverts if condition lost; steals `min(3, carried)` within XZ `1.2 m` (ignoring invuln/safe zone, before shade hit), emits `drifter_steal`, flees `240 t`; Pulse during `chase` → `flee` no steal; Pulse during `flee` with loot → drops motes, emits `drifter_drop`, vanishes in `120 t`. | Unit test + `scenarios/phase2/drifter-steal-drop` |
| AC-P2-6 | **Bùa Gió (Wind Charms — Nights 2 & 3)** | `C1` at `(35,0,0)` (Night 2), `C1/C2` at `(±30,0,25)` (Night 3); pickup grants `600 t` of `7.2 m/s` speed & 0 dash cooldown (still needs rising edge, ignored mid-dash), refreshes on re-pick, emits `charm_picked`, respawns after `2700 t`. | Unit test + `scenarios/phase2/charm-boost` |
| AC-P2-7 | **Tạm dừng (Pause/Resume)** | `pause` input rising edge pauses on that tick (`paused {}`), freezing `sim_tick`, timer, cooldowns, spawns, TTL while `tick` increments and snapshot reports `state: "paused"`. Next rising edge emits `resumed {}` and resumes cleanly. UI Pause menu (`Esc`/`P`) offers Continue / Replay / Settings / Main Menu. | Unit test + `scenarios/phase2/pause-resume` |
| AC-P2-8 | **Chuỗi 3 Đêm & Cài đặt (3-Night Campaign & Persisted Settings)** | Main Menu → Night Intro (island name + Ông Đăng's lines) → Play → Result → Next Night → Dawn Victory screen after Night 3 with cumulative score; Defeat replays current Night. Volume & mouse sensitivity saved in `localStorage`. | Code audit + unit test (`settings.ts`) + build verification |
| AC-P2-9 | **Âm thanh (Audio)** | Procedural Web Audio night background music + all required SFX (pickup, deposit/lantern lit, pulse, hit, jump, dash, win, lose, shade spawn, last-10s countdown, wind warning). | Code audit (`src/game/audio.ts`) + build verification |
| AC-P2-10 | **HUD đầy đủ & Bảng màu chuẩn** | Exact HUD layout (flames top-left, timer top-center turning `#FF5A5F` & blinking `<=30s`, lanterns+score top-right, 10-slot mote bar bottom-center, dash+pulse cooldown icons bottom-right, `"E — Nạp ánh sáng (x/10)"` prompt, off-screen arrow to nearest unlit lantern). Exact hex palette (`<=10%` RGB tolerance) and ambient intensity `0.15 + 0.55*(lit/total)`. | Code audit (`src/game/hud.ts`, `src/game/renderer3d.ts`, `src/styles.css`) + color-palette verification test |
| AC-P2-11 | **Contract v1.1 Schema, Determinism & Performance** | Exact snapshot/event/scenario fields, exact shade state names, byte-identical determinism on Night 3, and full 21,600-tick Night 3 headless run finishes in `<= 30 s`. | `tests/headless-cli.test.ts` + `scripts/verify-phase2.mjs` (`perf-night3.txt`) |
