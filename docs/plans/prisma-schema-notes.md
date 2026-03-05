# Prisma Schema Documentation

This document describes the database schema for the Poker Champ application.

## Overview

- **Database**: MySQL (via Prisma)
- **ORM**: Prisma Client JS
- **Schema Version**: The schema uses explicit versioning in certain models (e.g., `TableSnapshotLog.schemaVersion`, `TableSeatSession.schemaVersion`)

---

## Models

### User

Represents a registered player in the system.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | String (unique) | User's email, normalized to lowercase |
| `username` | String? (unique) | Display handle |
| `usernameNormalized` | String? (unique) | Lowercase/alphanumeric-only version for lookups |
| `passwordHash` | String | bcrypt hashed password |
| `displayName` | String | Display name shown at tables |
| `role` | UserRole enum | `USER`, `MODERATOR`, `ADMIN` |
| `isBanned` | Boolean | Account ban flag |
| `deletedAt` | DateTime? | Soft delete timestamp |
| `trustLevel` | Int | 1=New, 2=Verified, 3=Trusted |
| `bankrollCents` | Int | Central wallet balance (default: $10,000) |
| `createdAt` | DateTime | Registration time |
| `updatedAt` | DateTime | Last profile update |

**Relations**: Has many `sessions`, `playerHistory`, `balances`, `transactions`, `registrations`, `createdTables`, `leaderboardSnapshots`

---

### UserSession

Authentication sessions linked to users.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Token (nanoid) - also the primary key |
| `userId` | UUID | FK to User |
| `createdAt` | DateTime | Session creation |
| `lastUsedAt` | DateTime? | Last request timestamp |
| `expiresAt` | DateTime | Session expiration |

**Behavior**: Sessions are deleted when the user is deleted (CASCADE)

---

### PokerTable

A poker table instance.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Table ID |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update |
| `name` | String | Table display name |
| `creatorId` | String? | FK to creating User |
| `maxSeats` | Int | Max players (default: 9) |
| `showStats` | Boolean | Whether to show stats publicly |

**Relations**: Has many `players`, `hands`, `snapshotLogs`, `balances`, `transactions`

---

### PokerPlayer

A player record at a specific table (can be human or bot).

| Field | Type | Description |
|-------|------|-------------|
| `id` | CUID | Primary key |
| `externalId` | String | userId or `bot_*` identifier |
| `userId` | String? | FK to User (null for bots) |
| `tableId` | String | FK to PokerTable |
| `displayName` | String | Name shown at table |
| `seat` | Int | Seat number (0-8) |

**Constraints**: Unique on `[tableId, externalId]`

**Relations**: Has many `actions`, `payouts`, `handsPlayed`

---

### PlayerBalance

A user's balance at a specific table (separate from their central bankroll).

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `tableId` | String | FK to PokerTable |
| `userId` | String | FK to User |
| `status` | String | `ACTIVE`, `CASHED_OUT`, `ABANDONED` |
| `balanceCents` | Int | Current chip count |

**Constraints**: Unique on `[tableId, userId]`

---

### BalanceTransaction

Immutable ledger of all money movements.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `createdAt` | DateTime | Transaction timestamp |
| `tableId` | String? | FK to PokerTable |
| `userId` | String | FK to User |
| `tournamentId` | String? | FK to Tournament |
| `handId` | String? | FK to Hand |
| `amountCents` | Int | Transaction amount (positive/negative) |
| `type` | String | `BUYIN`, `CASHOUT`, `BET`, `PAYOUT`, `REFUND`, `TOURNAMENT_ENTRY`, `TOURNAMENT_PAYOUT` |
| `externalRef` | String? | Idempotency key |
| `metaJson` | Json? | Additional transaction data |

**Indexes**: `[userId, createdAt]`, `[tableId, userId]`

---

### Hand

A single hand of poker.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Hand ID |
| `createdAt` | DateTime | Hand start time |
| `endedAt` | DateTime? | Hand completion time |
| `tableId FK to PokerTable` | String | |
| `dealerSeat` | Int | Dealer button position |
| `smallBlindCents` | Int | Small blind amount |
| `bigBlindCents` | Int | Big blind amount |
| `reason` | String? | End reason: `LAST_PLAYER`, `SHOWDOWN` |
| `boardJson` | Json? | Community cards array |

**Relations**: Has many `players`, `actions`, `payouts`, `snapshotLogs`, `txs`

---

### HandPlayer

Links players to a specific hand.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `handId` | String | FK to Hand |
| `playerId` | String | FK to PokerPlayer |
| `seat` | Int | Player's seat |
| `startingStackCents` | Int | Stack at hand start |
| `endingStackCents` | Int? | Stack at hand end |
| `holeCardsJson` | Json? | Player's hole cards (for audit) |

**Constraints**: Unique on `[handId, playerId]`

---

### HandAction

Records every action taken during a hand.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `handId` | String | FK to Hand |
| `playerId` | String | FK to PokerPlayer |
| `seat` | Int | Player's seat |
| `actionIndex` | Int | Sequential action number |
| `street` | String | `PREFLOP`, `FLOP`, `TURN`, `RIVER` |
| `action` | String | `FOLD`, `CHECK`, `CALL`, `BET`, `RAISE`, `ALL_IN`, `AUTO_FOLD`, `AUTO_CHECK` |
| `amountCents` | Int | Bet amount |
| `potBeforeCents` | Int | Pot size before action |
| `potAfterCents` | Int | Pot size after action |
| `metaJson` | Json? | Additional data (sizing, etc.) |

**Constraints**: Unique on `[handId, actionIndex]`

**Indexes**: `[handId, createdAt]`, `[handId, actionIndex]`

---

### HandPayout

Payout records for showdown hands.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `handId` | String | FK to Hand |
| `playerId` | String | FK to PokerPlayer |
| `payoutIndex` | Int | Order of payout (side pots) |
| `amountCents` | Int | Payout amount |

**Constraints**: Unique on `[handId, payoutIndex]`

---

### TableSnapshotLog

State snapshots for replay and debugging.

| Field | Type | Description |
|-------|------|-------------|
| `id` | CUID | Primary key |
| `tableId` | String | FK to PokerTable |
| `handId` | String? | FK to Hand |
| `snapshotId` | String (unique) | Unique snapshot identifier |
| `reason` | SnapshotLogReason enum | Why snapshot was taken |
| `street` | String | Current street |
| `payloadJson` | Json | Full state at this point |
| `payloadBytes` | Int | Payload size (for monitoring) |
| `stateHash` | String | State integrity hash |
| `schemaVersion` | Int | Schema version for migrations |

**Reasons**: `HAND_START`, `ACTION_ACCEPTED`, `STREET_TRANSITION`, `POT_UPDATED`, `SHOWDOWN`, `HAND_END`, `PLAYER_JOIN`, `PLAYER_LEAVE`

---

### TableSeatSession

Tracks player presence at tables.

| Field | Type | Description |
|-------|------|-------------|
| `id` | CUID | Primary key |
| `tableId` | String | FK to PokerTable |
| `userId` | String | FK to User |
| `seat` | Int | Seat number |
| `state` | TableSeatSessionState | `SEATED_ACTIVE`, `SEATED_SITTING_OUT`, `LEFT` |
| `stackCentsSnapshot` | Int | Stack when seated |
| `buyInCents` | Int | Buy-in amount |
| `handIdSnapshot` | String? | Current hand when disconnected |
| `disconnectAt` | DateTime? | When player disconnected |
| `lastSeenAt` | DateTime | Last activity |
| `reservedUntil` | DateTime? | Seat reservation expiry |
| `schemaVersion` | Int | Schema version |

**Constraints**: Unique on `[tableId, userId]`

---

### Tournament

Tournament configuration and state.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `createdAt` | DateTime | Creation time |
| `updatedAt` | DateTime | Last update |
| `name` | Tournament name |
| `status` | String | `REGISTERING`, `RUNNING`, `FINISHED`, `CANCELLED` |
| `entryFeeCents` | Int | Buy-in amount |
| `prizePoolCents` | Int | Total prize pool |
| `startTime` | DateTime | When tournament starts |

**Relations**: Has many `registrations`, `transactions`

---

### TournamentRegistration

Links users to tournaments.

| Field | Type | Description |
|-------|------|-------------|
| `tournamentId` | UUID | FK to Tournament |
| `userId` | UUID | FK to User |
| `createdAt` | DateTime | Registration time |
| `entryTxId` | String? | Idempotency reference |

**Constraints**: Unique on `[tournamentId, userId]`

---

### LeaderboardSnapshot

Periodic aggregated stats for leaderboards.

| Field | Type | Description |
|-------|------|-------------|
| `id` | CUID | Primary key |
| `createdAt` | DateTime | Snapshot time |
| `period` | String | Time period (e.g., `2024-W01`) |
| `category` | String | Stat category (e.g., `net_profit`, `hands_played`) |
| `actorId` | String | Stable identity (userId or bot ID) |
| `actorType` | String | `USER` or `BOT` |
| `userId` | String? | FK to User (null for bots) |
| `userDisplayName` | String | Name at snapshot time |
| `value` | String | JSON value (supports decimals) |
| `valueNumerator` | Int | Numeric value for sorting |
| `valueDenominator` | Int? | For ratios/percentages |
| `handCount` | Int | Hands played in period |
| `rank` | Int | Position on leaderboard |
| `computedAt` | DateTime | Computation timestamp |
| `isEmpty` | Boolean | No activity flag |

**Indexes**: Multiple composite indexes for efficient leaderboard queries

---

### LobbyChatMessage

Chat messages in the lobby.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Primary key |
| `scope` | String | Chat scope (default: `lobby`) |
| `createdAt` | DateTime | Message time |
| `senderUserId` | String | User who sent it |
| `senderName` | String | Display name |
| `text` | String | Message content |

---

### BotStats

Aggregate statistics for bots.

| Field | Type | Description |
|-------|------|-------------|
| `botId` | String | Bot identifier |
| `handsPlayed` | Int | Total hands |
| `netCents` | BigInt | Net profit/loss |
| `grossWonCents` | BigInt | Total won |
| `grossLostCents` | BigInt | Total lost |
| `updatedAt` | DateTime | Last update |

---

## Enums

### UserRole
- `USER`
- `MODERATOR`
- `ADMIN`

### SnapshotLogReason
- `HAND_START`
- `ACTION_ACCEPTED`
- `STREET_TRANSITION`
- `POT_UPDATED`
- `SHOWDOWN`
- `HAND_END`
- `PLAYER_JOIN`
- `PLAYER_LEAVE`

### TableSeatSessionState
- `SEATED_ACTIVE`
- `SEATED_SITTING_OUT`
- `LEFT`

---

## Design Notes

1. **Soft Deletes**: Users are soft-deleted via `deletedAt` rather than hard deletion
2. **Immutability**: Transactions and actions are append-only; they are never updated
3. **Dual Economy**: User has both a `bankrollCents` (central wallet) and `PlayerBalance` per table
4. **Audit Trail**: Hole cards stored in `HandPlayer.holeCardsJson` for dispute resolution
5. **State Snapshots**: Full table state captured at key moments for replay/debugging
6. **Schema Versioning**: Certain models include `schemaVersion` for migration compatibility
