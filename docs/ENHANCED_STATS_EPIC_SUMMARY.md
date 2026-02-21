# Enhanced Stats Epic — Implementation Summary

Session-scoped VPIP and PFR on the calculations bar, delivered via the table snapshot with no DB reads during play.

**Status: Final review complete. Epic closed.**

---

## What Was Delivered

- **Contract:** `hero.playerStats` (optional) with `hands`, `vpipPct`, `pfrPct` in the realtime table snapshot.
- **Server:** In-memory `SessionPlayerStatsTracker`; Dealer maintains preflop flags and flushes to the tracker before emitting HAND_END.
- **Client:** CalculationsStrip shows VPIP and PFR pills (with optional hand count); data comes from the same snapshot as equity/odds/outs.

---

## Files Changed / Added

| Area | File | Change |
|------|------|--------|
| Contract | `packages/realtime-contract/src/table.ts` | Added `HeroPlayerStatsSchema` (partial), `hero.playerStats`, exported `HeroPlayerStats`. |
| Server | `src/engine/dealer/services/SessionPlayerStatsTracker.ts` | **New.** In-memory counters; `recordHandForUser`, `get(userId)`, `pct()` for stable rounding; `resetAll()` / `resetUser(userId)`. |
| Server | `src/engine/Dealer.ts` | Tracker + `preflopFlagsByUserId`; **init at HAND_START** (not first action); update flags on preflop action only; **flush before HAND_END** (comment at call site); `resetSessionStats()` for room dispose. |
| Server | `src/rooms/PokerRoom.ts` | `onDispose()` calls `dealer.resetSessionStats()`. |
| Server | `src/engine/dealer/services/SnapshotService.ts` | Optional `getHeroSessionStats` dep; `hero.playerStats` set in snapshot. |
| Client | `apps/client/src/components/domain/table/hooks/useTableSceneModel.ts` | Expose `heroPlayerStats` from snapshot. |
| Client | `apps/client/src/components/domain/table/TableLayout.tsx` | Pass `heroPlayerStats` into HeroZone. |
| Client | `apps/client/src/components/domain/table/HeroZone.tsx` | `playerStats` prop; pass to CalculationsStrip. |
| Client | `apps/client/src/components/domain/table/CalculationsStrip.tsx` | Optional `vpipPct`, `pfrPct`, `statsHands`; pill list includes VPIP/PFR (array-driven). |
| Tests | `src/engine/dealer/services/__tests__/SessionPlayerStatsTracker.test.ts` | **New.** Unit tests for tracker. |
| Tests | `src/tests/table-snapshot.contract.test.ts` | Hand-end snapshot has `hero.playerStats`; **table-driven behavioral test**: blind fold → 0/0, limp → VPIP only, open raise → VPIP+PFR. |
| Docs | `docs/ENHANCED_POKER_STATS_PROPOSAL.md` | MVP edge-case decisions added. |

---

## Behaviour Summary

- **VPIP:** Counted when the player has any preflop voluntary money action (CALL, BET, RAISE, or ALL_IN that puts chips in). Blinds (SB/BB) are not voluntary; they are applied outside `handleAction`.
- **PFR:** Counted when the player has any preflop raise (RAISE, or ALL_IN that increases the current bet).
- **Scope:** Session-only; in-memory. No DB read on snapshot or on action. Stats are flushed into the tracker **before** the HAND_END snapshot is emitted so the payload includes updated `hero.playerStats`.
- **Dealer flow:** Preflop flags are **initialised at HAND_START** for all dealt-in players (walked hands and edge cases covered). Action handlers only mutate flags. **IMPORTANT: flush stats BEFORE emitting HAND_END snapshot** (comment at call site). ALL_IN classification: apply-time only (`isRaise = nextBetTo > currentBetTo`); no snapshot-time inference. On room dispose, `dealer.resetSessionStats()` clears the tracker.

---

## MVP Edge Cases (Decided)

- Walked hand / no preflop action → hand counted, VPIP/PFR false.
- Posted blind then folded → hand counted, VPIP/PFR false.
- Straddle → not in scope.
- All-in → PFR only if it increases the current bet; otherwise VPIP only if voluntary.
- Sitting out → not dealt in; hands not incremented.
- Flush runs before emitting HAND_END so the snapshot has up-to-date stats.

---

## Client / Tracker Details

- **Tracker:** `get()` uses `pct(n, d) = d === 0 ? 0 : Math.round((n/d)*1000)/10` for one decimal, no NaN, stable UI.
- **CalculationsStrip:** Only render pill when value `!== undefined` (0 is valid; do not use `if (vpipPct)`).

## How to Extend

- **More stats (e.g. AF, 3bet):** Add counters in the tracker, set flags in the Dealer at action-time, add field to contract and pill list. No architectural change.
- **Persistence across sessions:** Out of scope; could add a single read on join or background sync later.
