# Hand history: how it is saved and displayed

Summary of the hand-history pipeline from game play to database and from API to UI.

---

## 1. When history is saved

History is written only when **persistence is enabled**:

- **PersistenceFacade** (`src/engine/persistence/PersistenceFacade.ts`): `enabled === true` only when **both** `DATABASE_URL` is set **and** `NODE_ENV !== "test"`.
- If the game server runs with `NODE_ENV=test`, no Hand rows are written. Use `NODE_ENV=development` (or production) for the live server.

There is a **single persistence path**; no other code creates or updates `Hand` / `HandPlayer` for live play. See `src/engine/persistence/HAND_HISTORY_PIPE.md` for the full call sequence.

---

## 2. Saving pipeline (engine → DB)

### 2.1 Identity: PokerPlayer and roster

- **HandHistoryService** keeps an in-memory map: `externalId` (userId or `bot_*`) → `PokerPlayer.id` (cuid).
- **PokerPlayer** has `@@unique([tableId, externalId])`; `externalId` is the game’s player id (userId for humans, bot id for bots).

**ensureTableAndPlayers(roster)** (must be called with the **full table roster**):

- Callers: `Dealer.ensurePlayerPersistence(roster)`, `PlayerLifecycleService.addBot` (full roster).
- Upserts `PokerTable` and each `PokerPlayer` (tableId, externalId, displayName, seat, userId for humans).
- Fills the in-memory map so `startHand` / `recordAction` / `recordPayout` / `endHand` can resolve player ids.

If the roster is incomplete, `resolvePlayerId(externalId)` throws (“Unknown player …”); the caller (SettlementService) does not catch it, so the error can propagate and **actions may never be persisted**. At the throw site, HandHistoryService logs a **warn** (externalId, tableId, known keys) so production logs capture when this happens. Ensure the full roster is always passed to `ensureTableAndPlayers` at both call sites (Dealer.ensurePlayerPersistence and PlayerLifecycleService.addBot).

### 2.2 Hand lifecycle

| Step | Caller | What is written |
|------|--------|------------------|
| **startHand(params)** | HandLifecycleService when a new hand starts | `Hand` row + `HandPlayer` rows (via `resolvePlayerId`). |
| **recordAction** | SettlementService on accepted action | `HandAction` row. |
| **recordPayout** | SettlementService on payout | `HandPayout` row. |
| **endHand(params)** | SettlementService (from finishHandByLastStanding or finishHandShowdownWithSidePots) | `Hand.endedAt`, `Hand.reason`, `Hand.boardJson`; `HandPlayer.endingStackCents` updated. |

All of the above are no-ops when `!persistence.enabled || !persistence.handHistory`.

### 2.3 Leaving the table

- **removePlayer(playerId)** is called when a player or bot leaves (PlayerLifecycleService). It **only removes that player from the in-memory map**; it does **not** delete the `PokerPlayer` row. Deleting would break historical data: `HandPlayer`, `HandAction`, and `HandPayout` reference `PokerPlayer`, so past hands would lose those players from joins and API responses would silently drop them. PokerPlayer rows are kept as historical identity records. Seat reuse is already handled by `@@unique([tableId, externalId])`: when someone new (or the same externalId re-joining) sits, `ensureTableAndPlayers` upserts; the `update` branch refreshes `displayName`, `seat`, and `userId`, so a player who changes their username or links an account keeps their PokerPlayer row current.

---

## 3. Display pipeline (API → client)

The HTTP layer only **reads** hand data; it does not write it.

### 3.1 API routes (`HandHistoryRouter`)

- **GET /api/history/overview**  
  Loads all completed hands where the authenticated user participated (`players.some.player.userId`). Selects `players` and `payouts` with `player: { select: { userId: true } }`. In code, for each hand, finds the “hero” by `userId`, then computes totalHands, totalProfitCents, winningHands, winRate, avgPotCents, biggestPotCents. Returns that overview object.

- **GET /api/history/hands**  
  Cursor-based pagination. Loads completed hands for the authenticated user, ordered by `createdAt` desc, with table name, players, payouts, actions. Transforms each hand into a list item: hero is picked in code by `userId`; computes netResultCents, heroWonCents (pot total), heroActionSummary from last hero action. Returns `{ hands: HandHistoryListItem[], nextCursor }`.

- **GET /api/history/hands/:id**  
  Loads the hand only if the user participated. Returns hand metadata, boardCards, players (including hole cards for all players — human and bot — from `HandPlayer.holeCardsJson`), actions, payouts. Replay frames for the hand (if any) are loaded via **ReplayFrameService.getFramesForHand(handId)** and included as `snapshots` in the response. When `holeCardsJson` is missing for a player (e.g. legacy data), the API falls back to `lastHandResult.showdownHoleCardsByUserId` from snapshots if the hand reached showdown.

### 3.2 Replay frames (hand detail)

- **ReplayFrameService** reads `TableSnapshotLog` rows for the handId (with a JSON path filter on the payload). It returns an ordered list of `TableSnapshotPayload` used for hand replay in the UI. If no frames are stored, the hand detail still shows static data (board, players, actions, payouts).

### 3.3 Client

- **history.service** (`apps/client/src/services/history.service.ts`): Defines `HandHistoryListItem`, `HandHistoryDetail`, `HistoryOverview`, and implements `getOverview`, `getHands`, `getHandDetail` via the SDK (auth token required).

- **History screen** (`apps/client/app/history.tsx`): Two tabs — **Overview** (total hands, net profit, win rate, avg/biggest pot from `getOverview`) and **Hands** (paginated list from `getHands`). Tapping a hand calls `getHandDetail` and opens **HandDetailModal** with the hand (and optional replay snapshots).

- **HandList / HandListItem**: Consume `HandHistoryListItem` from the history service; display playedAt, tableName, net result, pot (heroWonCents), and hero action summary.

- **HandDetailModal**: Shows board, players (with all hole cards for each player), actions, payouts, and can drive replay from the `snapshots` array when present.

---

## 4. Key files

| Area | Files |
|------|--------|
| Persistence gate | `src/engine/persistence/PersistenceFacade.ts` |
| Save logic | `src/engine/persistence/HandHistoryService.ts` |
| Call sequence doc | `src/engine/persistence/HAND_HISTORY_PIPE.md` |
| Dealer/roster | `src/engine/Dealer.ts` (ensurePlayerPersistence), `src/engine/dealer/services/PlayerLifecycleService.ts`, `HandLifecycleService.ts`, `SettlementService.ts` |
| Read API | `src/http/HandHistoryRouter.ts` |
| Replay frames | `src/engine/persistence/ReplayFrameService.ts` |
| Client types & API | `apps/client/src/services/history.service.ts` |
| UI | `apps/client/app/history.tsx`, HandList, HandListItem, HandDetailModal |

---

## 5. If hands do not appear

1. Ensure `DATABASE_URL` is set and the server is **not** running with `NODE_ENV=test`.
2. Ensure `ensureTableAndPlayers` is always called with the **full table roster** (e.g. after addPlayer and when addBot runs).
3. Run `npx tsx scripts/confirm-history-user.ts <email>` to inspect overview counts and PokerPlayer rows for that user.
4. Run `npx tsx scripts/inspect-hand-hole-cards.ts [limit]` to verify hole cards in HandPlayer rows (humans vs bots).

---

## 6. Scripts

**confirm-history-user.ts** — `npx tsx scripts/confirm-history-user.ts [email]` (default email: `test@example.com`).

**Output:**

- User line: email and username (or id if no username).
- **Overview (computed like API):** totalHands, totalProfitCents, winningHands, winRate %, avgPotCents, biggestPotCents — same logic as GET /api/history/overview.
- **Raw hand count:** number of completed hands where the user participated (hands.length).
- **PokerPlayer rows:** count of PokerPlayer rows with that userId (can be &gt; 1 if the user has played at multiple tables).

**inspect-hand-hole-cards.ts** — `npx tsx scripts/inspect-hand-hole-cards.ts [limit]` — Inspects hole card presence in HandPlayer rows for the last N completed hands; compares humans vs bots and simulates the API response mapping.
