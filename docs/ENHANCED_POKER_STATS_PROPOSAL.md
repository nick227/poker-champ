# Enhanced Poker Stats (VPIP / PFR) — MVP Proposal

## Current state: CalculationsStrip and where equity/odds/outs come from

**CalculationsStrip** (`apps/client/src/components/domain/table/CalculationsStrip.tsx`) receives three props: `equity`, `potOdds`, `outs`. It does not call any HTTP routes.

- **Source:** Table snapshot over realtime (no REST API). Values are in `snapshot.hero.calculations`:
  - `equityPct` → Equity
  - `potOddsPct` → Pot Odds  
  - `outs` → Outs

- **Server-side flow:**
  1. **HandCalculationsCoordinator** (`src/engine/odds/HandCalculationsCoordinator.ts`) computes equity (OddsCoordinator), outs (OutsService), and pot odds (OddsService) during the normal snapshot refresh.
  2. **SnapshotService** (`src/engine/dealer/services/SnapshotService.ts`) merges `handCalculations.getForUser(userId)` with `potOddsPct` into `hero.calculations`.
  3. Snapshot is pushed to the client via the table realtime channel (`TABLE_SNAPSHOT`).

So **equity, pot odds, and outs are computed on the server as part of the existing snapshot pipeline** and delivered in the same payload. There are no dedicated “routes” for them—they are **single-read items** in the sense that the client reads them once per snapshot from the same message that carries the rest of the table state.

---

## Goal

- Add **VPIP** and **PFR** to the calculations bar and persist them there for the session.
- **VPIP:** % of hands where the player voluntarily put money in preflop (excluding forced blinds).
- **PFR:** % of hands where the player raised preflop.
- Keep the game fast: no extra DB reads during play; prefer single-read, session-scoped stats.
- Design so more stats (e.g. AF, 3bet) can be added later without reworking the pipeline.

---

## Constraints

- MVP prototype: simple and reliable, no over-engineering.
- Do not slow the game; avoid tying to leaderboard hourly aggregation for inactive users.
- Stats must be **modular and easy to extend** for future “enhanced poker stats”.

---

## Recommended design: session-scoped in-memory stats

### 1. Single-read, no game impact

- **No HTTP route for stats during play.** Like equity/odds/outs, stats are **delivered in the table snapshot** so the client still does a single read (the snapshot) for both hand calculations and hero stats.
- **No DB read on snapshot or on action.** Stats are **session-scoped and in-memory**:
  - When a hand ends, the server updates per-player counters (hands dealt, VPIP count, PFR count) from **in-memory hand data** (e.g. preflop actions already in room/dealer state or a thin hand summary).
  - Snapshot builder reads these counters and sends `hero.playerStats` (or extended `hero.calculations`) with `vpipPct`, `pfrPct`, and optionally `hands` for context.

So: **one logical “read” for the client (the snapshot)** and **zero DB reads for stats during play**.

### 2. Where to hold session stats

- **Owner:** Room (e.g. `PokerRoom`) or a small service used by the room/dealer, e.g. `SessionPlayerStatsService` or `EnhancedPokerStatsTracker`.
- **Storage:** In-memory `Map<userId, SessionStats>` where `SessionStats = { handsDealt, vpipHands, pfrHands }`. Optional: cap at last N hands (e.g. 50) with a circular buffer so stats stay “recent session” and don’t grow forever.
- **Update only on hand end:** In the existing hand-end path (e.g. after settlement, before or after `finalizePersistedHand`), for each player who was dealt in the hand:
  - Determine “voluntarily put $ in preflop” (any preflop CALL/BET/RAISE/ALL_IN that is not a forced blind).
  - Determine “raised preflop” (any preflop RAISE or ALL_IN).
  - Increment `handsDealt`; conditionally increment `vpipHands` and `pfrHands`.
- **Read only when building snapshot:** Snapshot service asks the room/stats module for `getHeroStats(userId)` and attaches the result to `hero.playerStats` (or similar). No DB, no extra I/O.

This keeps stats **single-read** (client gets them in the snapshot) and **lightweight** (in-memory, O(1) per hand end).

### 3. Contract and UI

- **Realtime contract:** Extend table snapshot payload, e.g.:
  - Add optional `hero.playerStats?: { vpipPct?: number; pfrPct?: number; hands?: number }` (or nest under `hero.calculations` if you prefer a single “stats” object). Using a separate `playerStats` keeps “hand calculations” (equity/odds/outs) vs “session stats” (VPIP/PFR) clearly separated and easier to extend.
- **Client:**  
  - `useTableSceneModel` (or equivalent) already exposes snapshot; add `heroPlayerStats` from `snapshot.hero.playerStats`.  
  - **CalculationsStrip** stays modular: accept optional `vpipPct`, `pfrPct` (and optionally `statsHands`) as props alongside `equity`, `potOdds`, `outs`. Render two extra pills (e.g. “VPIP”, “PFR”).  
  - TableLayout/HeroZone pass the new props through from the snapshot. No new routes or hooks beyond the existing snapshot flow.

### 4. Modularity for future stats

- **Stats module interface:** One small abstraction, e.g. `getSessionStats(userId): SessionStats | undefined` where `SessionStats` is a type that can grow (e.g. `{ vpipPct?, pfrPct?, af?, threeBetPct?, hands? }`). Implementations only fill what they support; client shows only what’s present.
- **Extending:** To add AF or 3bet:
  - In the same hand-end path, update the same in-memory structure with the new counters.
  - Add fields to the contract and to CalculationsStrip (or a second row / “more stats” panel). No new routes or new “read” patterns—still one snapshot read.

### 5. Persistence and scope

- **MVP:** Session-only. When the user leaves the room or the room is destroyed, stats are dropped. No DB persistence for the bar. This avoids:
  - Tying to leaderboard hourly jobs.
  - Extra DB reads for inactive users.
  - Complexity of “global” vs “table” vs “session” scope in the first version.
- **Later (out of scope for MVP):** If you want stats to persist across sessions, options include:
  - A single optional GET on table join (e.g. “last 50 hands at this table” or “session stats from DB”) and merge with in-memory session delta, or
  - Background sync of in-memory session stats to a lightweight “session_stats” or “player_stats” store. Not required for the bar MVP.

### 6. Implementation outline

| Layer | Change |
|-------|--------|
| **Realtime contract** | Add `hero.playerStats?: { vpipPct?, pfrPct?, hands? }` to table snapshot payload schema. |
| **Server: stats tracker** | New small module (e.g. `SessionPlayerStatsTracker`) with `Map<userId, { handsDealt, vpipHands, pfrHands }>`, `recordHandEnd(handSummary)`, `getStats(userId)`. |
| **Server: hand end** | In hand-end flow, build a minimal “hand summary” (who was dealt in, who had voluntary preflop action, who raised preflop) from in-memory state and call `recordHandEnd`. No DB read. |
| **Server: snapshot** | SnapshotService calls `getStats(heroUserId)`, attaches result to `hero.playerStats`. |
| **Client: scene model** | Expose `heroPlayerStats` from snapshot. |
| **Client: CalculationsStrip** | Optional props `vpipPct`, `pfrPct`, `statsHands`; render VPIP/PFR pills; keep list of “stat pills” easy to extend (e.g. array of `{ label, value }`). |
| **Client: TableLayout/HeroZone** | Pass `heroPlayerStats` through to CalculationsStrip. |

### 7. Summary

- **Equity, odds, outs:** Already “single read” via table snapshot; no routes; computed in `HandCalculationsCoordinator` and sent in `hero.calculations`.
- **VPIP/PFR:** Add session-scoped in-memory stats, updated only at hand end from in-memory data, and delivered in the **same** table snapshot as `hero.playerStats`. Client still does a single read (the snapshot); game speed is unaffected; design is modular for more stats later.

This keeps the calculations bar simple, reliable, and extensible without over-engineering or touching the leaderboard pipeline.

---

## MVP edge cases (decided)

- **Walked hand / no preflop action:** If player was dealt in, `handsDealt++`; VPIP and PFR stay false.
- **Posted blind then folded:** Counts as a hand dealt; VPIP/PFR false (blinds are forced, fold is not voluntary money in).
- **Straddle:** Not supported in MVP; ignore.
- **All-in:** PFR only if all-in increases the current bet (compare `player.roundBetCents` after action to `roundCurrentBetCents` before); otherwise VPIP-only if voluntary.
- **Sitting out:** Not dealt in ⇒ do not increment hands (only players in `holeCardsByPlayerId` at hand end are flushed).
- **Flush timing:** Stats are flushed **before** emitting the HAND_END snapshot so the payload includes updated `hero.playerStats`.
