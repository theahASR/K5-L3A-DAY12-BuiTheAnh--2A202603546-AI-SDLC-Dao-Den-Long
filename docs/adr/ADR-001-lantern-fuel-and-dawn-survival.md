# ADR-001: Lantern Fuel State Machine & Dawn Survival Win Model (Ticket-03 · Contract v1.2)

- **Status:** Accepted & Implemented (`phase-3`, Contract `v1.2`)
- **Date:** 2026-11-20
- **Author:** Bùi Thế Anh (`2A202603546`)
- **Supersedes:** Binary lit-only lantern state and early `all_lit` win condition from Phase 1–2 (`Contract v1.0` / `v1.1`)

---

## 1. Context

Playtesting after Phase 2 revealed that skilled players could light all lanterns on an island in ~2 minutes and immediately end the Night via `all_lit`, removing late-night resource pressure and defensive decision-making. Ticket-03 ("Đèn cạn dầu") introduces a breaking change shifting core gameplay from *"light every lantern once"* to *"keep enough of the island lit until dawn"* while managing decaying lantern fuel and Ink Shades that actively siphon weak lanterns.

Two architectural areas inside `src/core/` required fundamental redesign without violating strict determinism, 60 Hz tick reproducibility, or core/render separation:

1. **Lantern state & Ink Shade AI coupling** (fuel decay, refueling, extinguishing, relighting, conditional safe zones, and shade draining).
2. **Win/Loss evaluation & tick ordering** (removing early victory, enforcing `no_flames` precedence even on the dawn tick, and progressive carry capacity).

---

## 2. Decisions

### Decision A: Integer Fixed-Point Fuel (`1/60` Units) & Extended Lantern Lifecycle

Instead of storing lantern fuel as a floating-point number decremented by `fuel -= 1/60` (which introduces IEEE-754 drift around boundary checks like `fuel === 30.0`, `fuel <= 0`, and `ceil((100 - fuel) / 10)`), each `LanternEntity` stores:

- `fuelSixtieths: number` — exact non-negative integer in `1/60` fuel units (`6000 = 100.0`, `1800 = 30.0`, `0 = 0.0`).
- `everLit: boolean` — latched `true` permanently once lit (or pre-lit in scenario); lowers subsequent lighting cost from `10` to `5` (`relight_cost`) and score from `+100` to `+40`.
- `relitCount: number` — increments on every successful relight (`everLit === true` prior to lighting).

**Lantern state transitions:**

```text
[Unlit, everLit=false] --(deposit 10)--> [Lit, fuel=6000, safeZone=ON]
                                              |      ^
                   (decay 1/t + drain 5/t/sh) |      | (refuel: +600/mote, +5 score/mote;
                                              v      |  crossing >=1800 ejects shades <=30t)
                                      [Lit, fuel<1800, safeZone=OFF]
                                              |
                                 (fuel <= 0 in Step 2)
                                              v
[Unlit, everLit=true, dep=0] <---(lantern_out)---+
      |
      +--(deposit 5, +40, relitCount++)--> [Lit, fuel=6000, safeZone=ON]
```

**Why integer `1/60` units instead of `number` floats?**
- Self-decay is `1` sixtieth/tick (`1.0/s`) and shade drain is `5` sixtieths/tick (`5.0/s`), so after 60 ticks of self-decay from `31.0`, `fuelSixtieths` is **exact `1800`** (`30.0` — safe zone still active), and on tick 61 it is **exact `1799`** (`< 30.0` — safe zone lost).
- Refueling computes `Math.ceil((fuelMax60 - fuelSixtieths) / fuelPerMote60)` using pure integer arithmetic, eliminating float artifacts such as `ceil((100 - 90.00000000000001) / 10) === 2`.
- Rounding (`round1(fuelSixtieths / 60)`) occurs strictly at the serialization boundary (`getSnapshot()` and event payloads `refuel`, `fuel_drain`). Dawn win bonus uses exact integer division `Math.floor(fuelSixtieths / 60)`.

**Conditional Safe Zones & Shade `drain` State:**
- Replaced all `lantern.lit` safe-zone predicates with `hasSafeZone(l) = l.lit && l.fuelSixtieths >= 1800`.
- Added 6th shade state `'drain'` with `targetLanternId` and `drainTicks`.
- Only `'wander'` shades seek targets: nearest weak lit lantern (`lit && fuel < 30`, tie-break smaller `id`), else nearest unlit lantern, else gentle wander. `'chase'` shades never switch targets.
- Entering `<= 2.0 m` XZ of a weak lit lantern enters `'drain'` (stands still; drains `5/60` per tick; stacks across multiple shades; emits `fuel_drain` every `60` drain ticks).
- Exits `'drain'` to `'chase'` if Mây comes within `6.0 m`, to `'stunned'` on Pulse (awarding `+15` total instead of `+5`), or to `'wander'` if the lantern goes out, is refueled `>= 30`, or distance `> 2.0 m`. Stun recovery always returns to `'wander'`.

### Decision B: Tick-End Dawn Survival Win Model & Strict `no_flames` Priority

- Removed the early `all_lit` win check from both Step 2 and Step 11 (`all_lit` is retired from `GameOverReason`).
- Updated Night durations to `240 / 270 / 300 s` (`14,400 / 16,200 / 18,000` ticks).
- **Exact Tick Order Integration (Step 2 & Step 11):**
  - Inside **Step 2**, after decrementing timers, subtract fuel (`decay + drain`) for all lit lanterns and **immediately** extinguish any lantern with `fuelSixtieths <= 0` (`lit = false`, `deposited = 0`, `everLit = true`, emit `lantern_out`, release draining shades to `'wander'`).
  - Steps 3–10 proceed normally (movement/fall, pickups up to dynamic `capacity`, interact/refuel/relight, safe zone ejection, pulse, AI movement, collisions, scheduled spawns).
  - **Step 11** executes **after all updates of the tick, including on the final dawn tick**:
    1. If `player.flames <= 0` → `lost` (`no_flames`) — **always takes priority**, even if enough lanterns are lit on the dawn tick.
    2. Else if `timeLeftS <= 0`:
       - Compute `threshold = ceil(0.6 * lanterns.length)` (`3/5` Night 1, `4/6` Night 2, `5/7` Night 3).
       - If `litCount >= threshold` → `won` (`dawn_survived`) with dawn bonus `Σ(50 + floor(fuel)) + 50 * flames` (time bonus removed).
       - Else → `lost` (`dawn`).

### Decision C: Progressive Capacity & Colorblind Accessibility Layer

- `player.capacity = min(capacity_max, carry_capacity + 2 * successfulLights)` (`10..20`), tracking actual in-night lights/relights (excluding scenario pre-lit lanterns, overridable via `scenario.player.successful_lights`).
- Colorblind mode (`"Bảng màu dễ phân biệt"`) is purely a presentation/settings concern (`src/game/settings.ts`, `renderer3d.ts`, `hud.ts`, `styles.css`), leaving `src/core/` and headless JSONL output 100% unaffected.

---

## 3. Consequences

- **Positive:** Zero floating-point drift across 18,000-tick runs; full byte-identical SHA-256 determinism; clear tension loop between expanding capacity, refueling weak lanterns before `< 30`, and intercepting draining shades for `+15` Pulse bonuses.
- **Breaking Changes (documented in `CHANGELOG.md`):**
  - Existing Phase 1–2 tests expecting early `all_lit` victory, `+10` per mote, `per_second_left` time bonus, or 300/330/360s night lengths were explicitly updated with written rationale in `tests/simulation.test.ts` and `tests/headless-cli.test.ts`.
  - Non-superseded Phase 1–2 mechanics (movement, jump, dash, fall/respawn, Night 2 jump pads/bridge, Night 3 tiers/ramps/bell tower/wind, Gió Lạc drifters, Bùa Gió charms, pause/resume, safe radius for fuel >= 30) continue passing unchanged.
