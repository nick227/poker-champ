# History Refactor Proposal

## Problem Statement

The Hand History feature (overview and hands list) returns zero data for human users, even though:
- The persistence layer is correctly wired (logs confirm `ensurePlayerPersistence` is called)
- Hands are being played and stored in the database (121 hands with `endedAt` NOT NULL)
- The API queries use the correct nested relation (`player: { userId }`)

### Root Cause

The root cause is a **schema design flaw** in the `PokerPlayer` table:

| Issue | Current State | Impact |
|-------|--------------|--------|
| `PokerPlayer.id` | Uses `userId` for humans, `bot_*` for bots | Global identity - one row per user across ALL tables |
| Unique constraint | `@@unique([tableId, seat])` | Seat is not stable - causes conflicts when humans reuse seats |
| No table-scoped identity | N/A | Cannot track same user across multiple tables/sessions |

### Evidence

```sql
-- Hands exist
SELECT COUNT(*) FROM Hand WHERE endedAt IS NOT NULL; -- 121

-- But no PokerPlayers have userId
SELECT COUNT(*) FROM PokerPlayer WHERE userId IS NOT NULL; -- 0
```

Despite the logs showing:
```
[HAND_HISTORY] upserting player { 
  id: 'b4e5d9bf-7d1f-4e8e-983d-1ed35c9eb0a1',
  userId: 'b4e5d9bf-7d1f-4e8e-983d-1ed35c9eb0a1',
  tableId: 'table_7xjt3EKq6F'
}
```

The data is not being persisted because:
1. When a user joins a new table, the upsert finds their existing global row and updates it
2. The `@@unique([tableId, seat])` constraint may be causing silent failures when a seat was previously used by a bot

---

## Recommendation

### Schema Changes

Modify `prisma/schema.prisma` - PokerPlayer model:

```prisma
model PokerPlayer {
  id          String   @id @default(cuid())  // Auto-generated, not userId
  externalId  String                   // NEW: stores userId (humans) or bot_* (bots)
  userId      String?                  // Nullable FK to User table
  user        User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  tableId     String
  table       PokerTable @relation(fields: [tableId], references: [id], onDelete: Cascade)

  displayName String @default("Player")
  seat        Int

  actions     HandAction[]
  payouts     HandPayout[]
  handsPlayed HandPlayer[]

  @@unique([tableId, externalId])  // NEW: one identity per table
  @@index([tableId])
  @@index([userId])
}
```

### Code Changes

#### 1. HandHistoryService.ensureTableAndPlayers()

```typescript
// Before (broken)
await this.prisma.pokerPlayer.upsert({
  where: { id: pl.id },
  create: { id: pl.id, tableId, seat, displayName, userId },
  update: { tableId, seat, displayName, userId },
});

// After (fixed)
await this.prisma.pokerPlayer.upsert({
  where: { tableId_externalId: { tableId: this.tableId, externalId: pl.id } },
  create: { 
    tableId: this.tableId, 
    externalId: pl.id,
    displayName: pl.name, 
    userId: pl.userId ?? null,
  },
  update: { 
    displayName: pl.name, 
    userId: pl.userId ?? null,
  },
});
```

#### 2. HandHistoryService.removePlayer()

Update to delete by composite key or id (id is now auto-generated cuid).

#### 3. Other files that reference PokerPlayer.id

Audit and update any code that assumes `PokerPlayer.id === userId`.

---

## Migration Path

### Step 1: Prisma Schema Update
- Add `externalId` field (String, required)
- Change `id` to `@default(cuid())`
- Replace `@@unique([tableId, seat])` with `@@unique([tableId, externalId])`

### Step 2: Generate Migration
```bash
npx prisma migrate dev --name add_external_id_to_poker_player
```

### Step 3: Update HandHistoryService
- Change upsert to use composite unique key
- Remove `seat` from create/update (seat belongs on HandPlayer)

### Step 4: Data Migration (if needed)
- Populate `externalId` from existing `id` values
- This may require a one-time migration script for existing data

### Step 5: Test
- Play hands as human
- Verify PokerPlayer rows have userId populated
- Verify history endpoints return data

---

## Known Blast Radius

### Files Requiring Changes

| File | Change Type |
|------|-------------|
| `prisma/schema.prisma` | Schema definition |
| `src/engine/persistence/HandHistoryService.ts` | Upsert logic |
| Potentially other files using PokerPlayer.id | Audit needed |

### Breaking Changes

1. **Existing PokerPlayer data**: Will need migration or may need to be reset
2. **Any code assuming `PokerPlayer.id === userId`**: Will break
3. **Seat uniqueness**: Moves from table-level to identity-level (correct behavior)

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Migration failure | Medium | Test on dev DB first |
| Data loss | Low | Existing hands don't depend on PokerPlayer identity |
| Downtime | Low | Migration is additive |
| Client impact | None | API contracts unchanged |

### Backward Compatibility

- Hand history queries will work for NEW hands after migration
- OLD hands (before fix) may still show zero if PokerPlayer.userId wasn't populated
- This is acceptable - the fix enables correct tracking going forward

---

## Success Criteria

After implementation:
1. `SELECT COUNT(*) FROM PokerPlayer WHERE userId IS NOT NULL;` returns > 0 after playing hands
2. `/api/history/overview` returns `totalHands > 0` for users who played
3. `/api/history/hands` returns hand list for users who played
4. Same user can play across multiple tables/sessions with proper history tracking

---

## Timeline Estimate

- Schema + migration: 15 minutes
- Code changes (HandHistoryService): 10 minutes
- Testing: 15 minutes
- **Total: ~40 minutes**

---

## Alternative Considered

**Do nothing / accept limitation**: Not viable for a real poker platform. History tracking is fundamental.

**Use different table per user**: Over-engineered. The proposed solution is the standard approach for multi-tenant table games.
