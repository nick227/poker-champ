# DealerAnnounceBar `handResultMessage` Deep Dive

## Scope
This analysis traces how `handResultMessage` is produced and rendered today, then evaluates what is needed to evolve the Dealer Announce Bar into an action-by-action feed for both humans and bots.

## Current Output Today

### DealerAnnounceBar message rules
Source: `apps/client/src/components/domain/table/DealerAnnounceBar.tsx`

The bar currently renders exactly one of these:

1. If `handResultMessage` exists:
`{winnerName} wins {amount}` and optionally ` - {winningHandDescr}`

2. Else if `hand` exists:
`{street} - Pot {pot}`

3. Else:
`Waiting for hand` or `Waiting for hand - {tableStatus}`

So today it is a hand-state banner, not an action feed.

### How `handResultMessage` is built
Source: `apps/client/app/table/[id].tsx`

`handResultMessage` is local UI state derived from `snapshot.lastHandResult`:

- Trigger: when `snapshot.lastHandResult.handId` changes and has not been shown yet.
- Winner selection:
  - Uses `lastHandResult.winnerId` if present.
  - Otherwise falls back to first key in `payoutsByUserId`.
  - If no winner id, label becomes `"Split pot"`.
- Amount selection:
  - If single winner id is resolved, uses `payoutsByUserId[winnerId]` (fallback `potCents`).
  - Else uses `potCents`.
- Visibility:
  - Local timer clears message after 3000ms.
  - Also cleared when a new active hand id differs from last result hand id.

### Engine source of `lastHandResult`
Source: `src/engine/dealer/services/HandLifecycleService.ts`

`lastHandResult` is only set at hand finish:

- `finishHandByLastStanding()`:
  - reason: `LAST_PLAYER`
  - includes winner id + full pot payout.
- `finishHandShowdownWithSidePots()`:
  - reason: `SHOWDOWN`
  - includes `payoutsByUserId`, optional `winnerId` (only single winner), optional `winningHandDescr`.

It is reset to `undefined` when next hand starts (`startHand()`).

### Snapshot transport
Sources:
- `packages/realtime-contract/src/table.ts`
- `src/engine/dealer/services/SnapshotService.ts`

`lastHandResult` is in every table snapshot payload while available. Snapshot reasons include `ACTION_ACCEPTED`, `BOT_ACTION`, `RUNOUT_STAGE`, `HAND_END`, etc., but no explicit `lastAction` object is sent.

## What We Can Output Right Now (No Server Changes)

### Option A: Client-side inferred action messages from snapshot diffs
Use previous snapshot vs current snapshot to infer likely action text:

- Fold: seat status changed `ACTIVE -> FOLDED`.
- Call/Bet/Raise/All-in: player `roundBetCents` increased and/or stack dropped.
- Check: very hard to infer reliably (no chip movement; mostly `toActSeat` moved).

Pros:
- No contract/backend changes.

Cons:
- Ambiguous in multiple paths (especially check, reconnect, forced fold, auto actions).
- Prone to wrong narration.
- Requires a client-side event synthesizer and edge-case handling.

### Option B: Use `snapshot.reason` only
Show coarse text like:
- `ACTION_ACCEPTED`: "Action accepted"
- `BOT_ACTION`: "Bot acted"

Pros:
- Easy.

Cons:
- Not player-specific and not useful for "show every action".

## What We Should Add For Reliable "Show Every Action"

### Recommended contract addition
Add `lastAction` to `TableSnapshotPayload` (or a rolling `recentActions` list), e.g.:

- `handId`
- `actionId`
- `sequence`
- `street`
- `actorUserId`
- `actorName` (optional convenience)
- `actorKind` (`HUMAN`/`BOT`)
- `action` (`FOLD|CHECK|CALL|BET|RAISE|ALL_IN`)
- `amountCents`
- `raiseToCents` (for raise clarity)
- `isAuto` (disconnected auto-check/fold)
- `potAfterCents`
- `createdAtTs`

Then the client can render deterministic narration:
- "Alice folds"
- "Bot_2 calls $40"
- "Nick raises to $220"
- "Sam is all-in for $1,180"

This is much safer than inference and aligns with the "server authoritative" architecture already used elsewhere.

## Data already available in backend
Even today, server persistence tracks per-action rows:

- `SettlementService.recordAcceptedAction(...)`
- `HandHistoryService.recordAction(...)`
- Prisma `HandAction` model (`actionIndex`, `street`, `action`, `amountCents`, `potBeforeCents`, `potAfterCents`, `metaJson`)

So backend already has canonical action data; it just is not exposed in realtime snapshots yet.

## Notable Current Gaps / Edge Cases

1. Split-pot messaging is lossy:
- For multi-winner showdowns, UI can show `"Split pot wins $pot"` style output (single label/amount), which hides per-winner payouts.

2. Timer mismatch:
- Server result hold is `HAND_RESULT_HOLD_MS = 2500`, while UI clears `handResultMessage` at 3000ms.
- This can overlap with early countdown display.

3. No direct action event in snapshot:
- `reason` indicates category, not actor/action semantics.

4. `hand.actionCount` is not a full action counter:
- It increments on chip debits, not all accepted actions (e.g., check/fold).

## Suggested rollout path

1. Add contract field (`lastAction` or `recentActions`) and emit from dealer after each accepted action.
2. In table screen, maintain short action queue (e.g., last 3-8 actions) keyed by action sequence.
3. Update `DealerAnnounceBar` to prefer latest action text during active hands.
4. Keep `handResultMessage` for `HAND_END` windows, then fall back to action feed for next hand.
5. Optional: expose persisted hand actions via API for replay/history screen.

## Bottom Line
Current `handResultMessage` is strictly end-of-hand winner text.  
To "show every action a player or bot takes" with high correctness, we should add server-authored action events to realtime snapshots rather than infer actions from state diffs on the client.
