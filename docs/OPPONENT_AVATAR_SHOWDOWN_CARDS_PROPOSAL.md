# Opponent Avatar Showdown Cards Proposal

## Goal
Add opponent hole-card visuals near each opponent avatar:
- During an active hand: show two face-down cards.
- After showdown: flip face-up only for relevant revealed hands.

## Feasibility Check (Current Payload)

### What we have now
- `hero.holeCards` is sent only for the connected user (`packages/realtime-contract/src/table.ts:155`, `packages/realtime-contract/src/table.ts:159`, `src/engine/dealer/services/SnapshotService.ts:212`).
- `lastHandResult` includes only one optional `winnerHoleCards` pair (`packages/realtime-contract/src/table.ts:167`, `packages/realtime-contract/src/table.ts:175`).
- Showdown result generation sets only `winnerHoleCards` from the primary payout entry (`src/engine/dealer/services/HandLifecycleService.ts:365`, `src/engine/dealer/services/HandLifecycleService.ts:372`).

### What this means
- We can show face-down placeholders for opponents today (no extra payload required).
- We cannot reliably show all relevant showdown hands today.
- We can only show one winner's cards at most, and even that is not mapped into opponent UI currently.

## Recommended Contract/Engine Change

### Add showdown reveal map
Extend `lastHandResult` with a per-player reveal list, for example:

```ts
showdownHoleCardsByUserId?: Record<string, [string, string]>;
```

Optional richer shape:

```ts
showdownReveals?: Array<{
  userId: string;
  holeCards: [string, string];
  handDescr?: string;
  revealed: boolean;
}>;
```

### Server logic for "relevant hands"
Use showdown eligibility already used by settlement (`ACTIVE` or `ALL_IN`) as the baseline (`src/engine/rules/BettingRound.ts:8`).

Suggested rule:
- If `lastHandResult.reason !== "SHOWDOWN"`: no reveals.
- If `SHOWDOWN`: include each eligible contender's cards in `showdownHoleCardsByUserId`.

This is deterministic and aligned with winner calculation inputs already in memory (`holeCardsByPlayerId`).

MVP policy:
- Always reveal all showdown-eligible hands.
- Do not implement muck behavior yet.

## Client Mapping Plan

### Adapter additions
In `apps/client/src/components/domain/table/table.adapter.ts`:
- Add a selector that returns opponent card display state per `userId`:
  - `inHand`: two face-down cards when opponent is occupied and hand is active.
  - `showdown`: face-up cards when `lastHandResult.reason === "SHOWDOWN"` and user exists in reveal map.
  - `waiting-after-showdown`: when `hand` is undefined but showdown result is still present, keep face-up cards visible until next hand starts.
- Keep hero cards sourced from `hero.holeCards` as-is.

### Opponent model extension
Extend `Opponent` type in `apps/client/src/components/domain/table/OpponentStrip.tsx` with UI card payload:

```ts
cards?: {
  left?: { rank: string; suit: string };
  right?: { rank: string; suit: string };
  faceDown: boolean;
  visible: boolean;
};
```

## UI Placement Recommendation

### Primary recommendation
Render two mini cards directly under the avatar circle inside each opponent tile in `OpponentStrip` (`apps/client/src/components/domain/table/OpponentStrip.tsx:27`).

Why:
- Keeps cards visually tied to each player.
- Minimal layout churn versus adding a new table layer.
- Works with existing top-strip architecture in `TableLayout` (`apps/client/src/components/domain/table/TableLayout.tsx:109`).

### Visual behavior
- Active hand (`snapshot.hand` exists): show mini card backs for occupied opponents.
- Hand end showdown (`snapshot.lastHandResult.reason === "SHOWDOWN"`): flip to face-up only for users present in reveal map.
- WAITING during hand-result hold: continue showing same face-up showdown cards from `lastHandResult`.
- Non-showdown endings (`LAST_PLAYER`): keep hidden/face-down (or hidden entirely).

## Edge Cases
1. Split pots with multiple winners:
- Reveal all showdown-eligible players, not only winners.

2. All-in before river:
- Still `SHOWDOWN`; same reveal rule.

3. Reconnect during hand-result hold:
- Reconnected user receives same `lastHandResult.showdownHoleCardsByUserId` in snapshot and sees identical face-up state.

## Rollout Steps
1. Contract: add `showdownHoleCardsByUserId` to `TableSnapshotPayload.lastHandResult`.
2. Engine: populate the map in `finishHandShowdownWithSidePots()`.
3. Client adapter: derive opponent card render state from `snapshot.hand` + `snapshot.lastHandResult`.
4. OpponentStrip UI: render mini `PlayingCard` pair with face-down/face-up state.
5. Tests:
- Contract test for new field shape.
- Dealer lifecycle test asserting showdown reveal map population.
- Adapter/UI tests for in-hand face-down and showdown face-up transitions.
- Reconnect-in-HAND_END test to ensure reveal map continuity after reconnect.

## Decision
Current payload is insufficient for full opponent showdown-card rendering. We should add `lastHandResult.showdownHoleCardsByUserId` and render cards inside each opponent seat tile in `OpponentStrip`.
