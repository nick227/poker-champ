# Tournament Bust-Out & Lifecycle UX — Design

**Date:** 2026-05-23  
**Status:** Proposed  
**Scope:** Freezeout/rebuy bust handling, winner resolution UX, lobby visibility, in-game rules sheet

---

## Problem

In a 2-player freezeout, when one player busts the other, **both players** can remain stuck on **"DEALING NEXT HAND…"** indefinitely. Neither gets a clear end-of-tournament experience:

- Busted player is not told they are eliminated (freezeout = no re-entry).
- Winner is not told they won; the table appears to be waiting for a hand that will never come.
- Lobby still shows the tournament to busted players with misleading join CTAs.
- Rebuy tournaments cannot work: reconciler eliminates on every bust regardless of format.
- No accessible rules/status reference exists in-game or in lobby.

---

## Root Cause (confirmed)

1. **Status strip stale state** — `useLiveTableStatusStripState` memoizes `rawInputs` but omits `tournamentStatus` from deps. After the tournament finishes (`table.tournament.status = "FINISHED"`), the strip keeps showing `DEALING_NEXT_HAND_COPY` because it still sees `RUNNING` or `null`.

2. **Tournament viewer gap** — `SnapshotService` only attaches `hero.tournamentViewer` when the hero is **not seated** (`!hero`). A busted player still seated at 0 chips (between removal and next snapshot) gets no elimination overlay. A **seated winner** also never receives `tournamentViewer`, relying entirely on `table.tournament.status === "FINISHED"` for the result banner.

3. **Rebuy not wired** — `TournamentTableReconciler` always assigns `finishPlace` and removes busted players. `canRebuyTournament()` exists but is never consulted at bust time. Client `useRebuySheet` hard-blocks tournament tables.

4. **Lobby filters** — `JOINED_VISIBLE_STATUSES` excludes `FINISHED`; busted players lose the tournament from "Your tournaments" immediately after completion. While `RUNNING`, eliminated players see generic CTAs ("Table ended") with no elimination context.

5. **API gap** — `TournamentSummary` omits `playFormat`, rebuy config, and per-player status (`ACTIVE` / `ELIMINATED` / `WINNER`).

---

## Design Decisions

### Winner resolution — immediate, no wait

**Recommendation:** When exactly one player with chips remains, the tournament **ends immediately** after the final hand resolves (current server behavior is correct).

| Question | Answer |
|----------|--------|
| Must the winner wait? | **No.** There is no second opponent to deal against. |
| When is the winner declared? | Same reconcile pass as the bust-out, after chip forfeiture and seat removal. |
| What does the winner see? | Winner-hold animation → board reset → **"Tournament complete"** (not "Dealing next hand…") → champion / ITM reveal overlay. |
| What does the busted player see? | Elimination overlay with finish place, freezeout/rebuy messaging, spectate note, lobby CTAs. |

This matches standard freezeout MTT behavior and is documented in the rules sheet (see below).

### Freezeout bust-out

When `playFormat === "FREEZEOUT"` (or rebuy no longer allowed):

1. Assign `finishPlace`, set `eliminatedAt`.
2. Forfeit table chips (`TOURNAMENT_BUST`).
3. Remove player from table (spectate mode on reconnect).
4. If one survivor remains → finish tournament, pay winner.

**Client copy (freezeout):**  
"You were eliminated. This is a freezeout — you cannot re-enter."

### Rebuy bust-out

When `playFormat === "REBUY"` and `canRebuyTournament()` is true at bust time:

1. **Do not** assign `finishPlace` yet.
2. Remove player from table (0-chip players cannot act).
3. Mark player as **rebuy pending** (new snapshot field or derived from registration + overlay).
4. Show rebuy prompt: entry fee, rebuys remaining, rebuy window countdown.
5. On successful `/buy-in` → re-seat with starting stack, increment prize pool.
6. When rebuy window closes or max rebuys exhausted → next bust (or director sweep) assigns `finishPlace`.

When rebuy is **not** allowed (window closed or max reached):

Same as freezeout elimination.

**Client copy (rebuy, eligible):**  
"You busted. Rebuy available — {remaining} rebuy(s) left, window closes in {countdown}."

**Client copy (rebuy, exhausted):**  
"You were eliminated. Rebuy period has ended."

### Snapshot contract additions

Extend `hero.tournamentViewer` (and optionally `table.tournament`):

```typescript
tournamentViewer?: {
  finishPlace?: number | null;
  payoutCents?: number;
  isEliminated: boolean;       // finishPlace > 1 OR busted with no rebuy
  isWinner?: boolean;          // finishPlace === 1 && tournament FINISHED
  rebuyPending?: boolean;      // busted, no finishPlace, rebuy still allowed
  rebuysRemaining?: number;
  rebuyWindowClosesAtTs?: number | null;
}
```

Server: populate for **both seated and unseated** heroes when tournament context applies.

### Status strip terminal states

Replace perpetual `betweenHands` + spinner when tournament is terminal:

| Condition | Message | Spinner |
|-----------|---------|---------|
| Tournament `FINISHED` / `ABANDONED` / `CANCELLED` | "Tournament complete" | No |
| Hero eliminated (freezeout) | "You were eliminated" | No |
| Hero rebuy pending | "Rebuy available" | Optional countdown |
| Normal between hands | "Dealing next hand…" | Yes |

Fix memo deps; also short-circuit status machine to a `tournamentTerminal` phase when overlay status or `tournamentViewer` indicates end.

### Lobby behavior

Extend `TournamentSummary`:

- `playFormat`, `maxRebuysPerPlayer`, `rebuyPeriodMinutes`
- `playerStatus`: `ACTIVE` | `ELIMINATED` | `REBUY_PENDING` | `WINNER` | `NOT_REGISTERED`

**Joined tournaments section:**

| Tournament status | Player status | CTA |
|-------------------|---------------|-----|
| RUNNING | ACTIVE | Join Table |
| RUNNING | ELIMINATED | Spectate (readonly) |
| RUNNING | REBUY_PENDING | Rebuy / Spectate |
| FINISHED | any registered | View Standings |
| FINISHED | WINNER | View Standings |

Include **recently finished** registered tournaments (status `FINISHED`) in joined section for 7 days or until dismissed.

**Browse lobby:** unchanged — no finished events in public list.

### Rules & status sheet

Accessible from:

- Tournament table banner (info icon)
- Lobby tournament detail page
- Joined tournament card (info link)

**Contents:**

- Format: Freezeout / Rebuys (max, window)
- Status timeline (existing)
- Late registration window
- Blind level + next level countdown
- Payout structure (existing)
- **Winner rule:** "Tournament ends when one player holds all chips. No further hands are dealt."
- Current player status (when registered)

Reuse `TournamentDetailBody` sections where possible; add compact modal variant for in-table use.

---

## Approaches Considered

### A. Client-only patch (status strip fix)

Fix memo deps + copy. **Rejected** — does not address rebuy, lobby, or seated-winner viewer gap.

### B. Server-first lifecycle + client UX (recommended)

Fix reconciler rebuy path, snapshot viewer, API fields, then client overlays, lobby, rules sheet. Phased delivery; Phase 1 unblocks the reported bug.

### C. Dedicated elimination WebSocket event

New `TOURNAMENT_ELIMINATED` message. **Deferred** — snapshot + overlay extensions are sufficient for MVP; avoids parallel event plumbing.

**Recommendation: Approach B**, phased.

---

## Testing Strategy

- Unit: status strip deps, `resolveTournamentCta` with `playerStatus`, rebuy eligibility in reconciler
- Integration: 2-player freezeout HU → FINISHED, both clients get correct terminal UI
- Integration: rebuy tournament — bust → rebuy → continue; bust after window → eliminate
- Client: `TournamentResultBanner` for winner (seated), busted (spectator), rebuy pending

---

## Out of Scope

- Multi-table MTT table balancing
- Deal-making / chop negotiations
- Push notifications for elimination
