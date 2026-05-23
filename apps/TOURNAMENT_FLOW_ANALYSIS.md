# Tournament Setup & Flow Analysis

**Document Purpose**: Clarify tournament loading, registration, start behavior, late registration, prize pool payouts, and refund logic. This document exists to nail down ambiguous scenarios before implementation changes.

---

---

## 🎯 MVP POLICY DECISIONS

These decisions clarify all ambiguous behaviors and form the contract for tournament mechanics.

### Registration & Refund Policy

| Question | Decision | Rationale |
|----------|----------|----------|
| **Can players unregister during late reg?** | ❌ **No** | Once the first hand is dealt, players are committed; prevents abuse |
| **Can late reg stay open while cards are dealing?** | ✅ **Yes** | Late registration window is time-based, cards deal independently |
| **Does seating 2+ players close late reg?** | ❌ **No** | Late registration closes only by time, max players, finish, or cancel |
| **What closes late reg?** | Time elapsed, max seats filled, tournament finish/cancel | See detailed rules below |
| **If no human sits?** | Auto-cancel after grace period + full refund | Default grace = 10 min |
| **Are no-shows refunded?** | Only if tournament CANCELLED before first hand or ABANDONED with no valid result | After first hand, no-shows blind down as ghost stacks |
| **Are no-shows in prize pool?** | ✅ **Yes** | Entry fees form prize pool regardless of seating |
| **Do no-shows get finishPlace?** | ✅ **Yes** | Assigned lowest places (e.g., 8th, 9th) for payout calculations |

### Rebuy & Gameplay Policy

| Question | Decision | Rationale |
|----------|----------|----------|
| **Are rebuys allowed after rebuy period?** | ❌ **No** | Rebuy window is hard stop; no exceptions |
| **Are bots counted for payouts?** | ❌ **No** | Only humans eligible for prize pool distribution |
| **Are bots counted for gameplay seats?** | ✅ **Yes** | Bots fill seats, participate in hands, and support bot/achievement wins |
| **Minimum to deal?** | 1+ **seated human** + enough opponents to deal | Opponents may be bots or committed ghost stacks |
| **When is money payout mode active?** | 2+ committed human-funded entries | 1 human vs bots only is bot challenge / achievement mode, no money payout |

### Late Registration Logic

```javascript
// Late registration CLOSES when ANY of these occurs:
1. Time elapsed: now >= startTime + lateRegMinutes
2. Max seats filled: seatedCount >= maxPlayers
3. Tournament finishes (winner determined)
4. Tournament cancelled/abandoned

// Late registration remains OPEN even if:
- Cards are already dealing
- 1 player is seated (doesn't trigger close)
- Blind levels advancing
```

---

## 1. Tournament Creation & Configuration

### Configuration Options (Currently Available)

```typescript
// From TournamentCreateForm + TournamentsRouter CreateTournamentSchema
{
  name: string,                          // Tournament name (1-120 chars)
  entryFeeCents: number,                 // Cost per entry
  startTime: Date (ISO string),          // Tournament start date/time
  maxPlayers: number,                    // 2-9 players
  startingStackCents: number,            // Stack given to all players
  blindStructureId: string,              // Currently only "standard_8min" (8-min levels, 25/50 → 800/1600)
  lateRegMinutes: number,                // Late reg duration (minutes), defaults to first 2 levels (16 min)
  playFormat: "FREEZEOUT" | "REBUY",     // Tournament format
  maxRebuysPerPlayer: number,            // 0-10 (only used if playFormat="REBUY")
  rebuyPeriodMinutes: number,            // 0-120 (only used if playFormat="REBUY")
  fillBotsAtStart: boolean,              // Auto-fill empty seats with bots
  fillBotCount?: number,                 // Number of bots to fill (1 to maxPlayers-1)
}
```

### Current Defaults
- **lateRegMinutes**: `defaultLateRegMinutesForStructure()` → first 2 blind levels
  - For "standard_8min": 8 + 8 = **16 minutes**
- **playFormat**: "FREEZEOUT" (hard-coded, user cannot currently change)
- **maxRebuysPerPlayer**: 0 (rebuys not fully configured in UI)
- **rebuyPeriodMinutes**: 0 (rebuys not fully configured in UI)

### UI Gaps ⚠️ → MVP Requirements
- ❌ **Late registration toggle**: No UI to disable late registration (lateRegMinutes = 0) — **MUST ADD**
- ❌ **Play format selector**: UI hard-codes FREEZEOUT; cannot create REBUY tournaments — **MUST ADD**
- ❌ **Rebuy configuration**: No UI fields for maxRebuysPerPlayer or rebuyPeriodMinutes — **MUST ADD**
- ❌ **Start grace period**: No configuration for auto-cancel timeout — **ADD default 10 min**
- ❌ **Last level to rebuy**: No configuration (implicitly: can rebuy until rebuyPeriodMinutes elapsed) — **ENFORCE via code**

---

## 2. Tournament Lifecycle & Status Transitions (REVISED)

### New MVP Status Flow

```
REGISTERING
    ↓
STARTING / SEATING (new: grace period for at least 1 seated human)
    ├─→ Auto-cancel if no human seats before grace expires (refund all)
    └─→ Deal first hand once 1+ human seats and enough opponents exist
        ↓
LATE_REG (if lateRegMinutes > 0)
    ├─→ New registrations allowed
    ├─→ Unregister BLOCKED (policy change)
    ├─→ Rebuys allowed if configured
    ├─→ Cards may be dealing
    └─→ Closes on: time expired, max seats, finish, or cancel
        ↓
RUNNING (if lateRegMinutes == 0, or after late reg closes)
    ├─→ No new registrations
    ├─→ Unregister BLOCKED
    ├─→ Rebuys allowed only if rebuy period still open & enforced
    ├─→ Blind levels advancing
    ├─→ No-show ghost stacks post blinds/antes and auto-fold
    └─→ Sitting-out players post blinds/antes and auto-fold
        ├─→ Winner determined
        └─→ All humans eliminated at max blind
            ↓
        FINISHED (valid result)
            └─→ Money payouts issued only if money payout mode is active

CANCELLED (new: explicit status)
    ├─→ No human seated before first hand / grace timeout
    ├─→ Admin cancelled
    └─→ All human registrations refunded

ABANDONED (refined)
    ├─→ Started but all humans eliminated at max blind
    └─→ All human entries refunded (policy change)
```

### Detailed Status Descriptions (MVP)

| Status | Trigger | Description | Unregister Allowed? | New Reg Allowed? |
|--------|---------|-------------|---------------------|------------------|
| **REGISTERING** | Created | Tournament open for registration, no table yet | ✅ Yes | ✅ Yes |
| **STARTING/SEATING** | Start time reached + min regs | Table created, waiting for 1+ human to sit; grace period active | Conditional: only before seated/first hand | ❌ No |
| **LATE_REG** | First hand dealt + lateRegMinutes > 0 | Late reg window open; cards may be dealing | ❌ **No** (POLICY) | ✅ Yes |
| **RUNNING** | Late reg closed OR lateRegMinutes == 0 | Normal play; no new registrations | ❌ No | ❌ No |
| **FINISHED** | Winner determined (human or bot challenge result) | Tournament complete; money payouts only if money mode is active | ❌ No | ❌ No |
| **CANCELLED** | Grace timeout with 0 seated humans OR admin cancel before first hand | No valid result reached; all humans refunded | N/A | N/A |
| **ABANDONED** | All humans busted at max blind | Invalid end state (possible bot-only survivors); all humans refunded | N/A | N/A |

---

## 2B. Registration State Fields (NEW)

To implement MVP policy, TournamentRegistration needs these fields:

```typescript
model TournamentRegistration {
  id: String @id
  tournamentId: String
  userId: String
  isBot: boolean
  
  // NEW: State tracking
  seatedAt?: DateTime              // When player first seated at table
  firstHandDealtAt?: DateTime      // When first hand dealt after they seated
  disconnectedAt?: DateTime        // When last disconnect/bust occurred
  noShowAt?: DateTime              // Marked no-show after grace period
  seatState: TournamentSeatState   // ACTIVE, SITTING_OUT, NO_SHOW_GHOST, BUSTED, BOT
  finishPlace?: Int                // Placement: 1st, 2nd, 3rd, etc.
  rebuyCount: Int @default(0)      // How many rebuys used
  
  // Existing
  entryTxId: String
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Distinction capability**:
- `seatedAt == null` → Registered but never seated
- `seatedAt != null && finishPlace == null && disconnectedAt != null` → Seated but disconnected (can rejoin)
- `finishPlace != null` → Busted/finished (assigned place)
- `seatedAt == null && noShowAt != null` → No-show ghost stack; posts blinds/antes and auto-folds

```typescript
type TournamentSeatState =
  | "ACTIVE"         // Player is seated and can act
  | "SITTING_OUT"    // Visible at table, posts blinds/antes, auto-folds
  | "NO_SHOW_GHOST"  // Virtual seat, posts blinds/antes, auto-folds
  | "BUSTED"         // Finish place assigned
  | "BOT";           // Plays normally, no buy-in, no payout eligibility
```

---

## 2C. Predicate Functions (NEW)

Instead of reusing `regOpen` predicate, implement three separate, clear predicates:

```typescript
// canRegisterForTournament(tournament, now)
// Returns: true if new players can register
function canRegisterForTournament(
  tournament: Tournament,
  now: Date = new Date()
): boolean {
  if (tournament.status === "REGISTERING") return true;
  if (tournament.status === "LATE_REG") {
    return now.getTime() < lateRegCloseMs(tournament);
  }
  return false;
}

// canUnregisterFromTournament(tournament, registration, now)
// Returns: true if player can unregister and get refund
function canUnregisterFromTournament(
  tournament: Tournament,
  registration: TournamentRegistration,
  now: Date = new Date()
): boolean {
  // MVP Policy: Allow unregister only before official start.
  // Official start = first hand dealt. Seated/dealt players are committed.
  return (
    (tournament.status === "REGISTERING" || tournament.status === "STARTING") &&
    !tournament.firstHandDealtAt &&
    registration.seatedAt == null &&
    registration.firstHandDealtAt == null
  );
}

// canRebuyTournament(tournament, registration, now)
// Returns: true if player can apply a rebuy
function canRebuyTournament(
  tournament: Tournament,
  registration: TournamentRegistration,
  now: Date = new Date()
): boolean {
  if (tournament.playFormat !== "REBUY") return false;
  if (registration.rebuyCount >= tournament.maxRebuysPerPlayer) return false;
  
  // Rebuy period is time-based: from startTime to startTime + rebuyPeriodMinutes
  const rebuyCloseMs = tournament.startTime.getTime() + 
                       tournament.rebuyPeriodMinutes * 60 * 1000;
  if (now.getTime() >= rebuyCloseMs) return false; // Rebuy period closed
  
  return true;
}
```

**Key change**: `canUnregisterFromTournament()` is **much more restrictive** than `canRegisterForTournament()`. This prevents the abuse scenario where players could unregister mid-game.

---

## 3. What Happens at Tournament Start Time (MVP)

### Automatic Actions (TournamentDirector.processDueTournaments)

When start time is reached:

1. **Transition to STARTING / SEATING**
   - Create Colyseus poker room with table configuration
   - Set status to `STARTING` (new intermediate status)
   - **Start grace timer**: Default 10 minutes
   - Tournament in "seating phase" — waiting for at least one human to sit down

2. **Bot Filling** (if enabled)
   - Add bots to reach `fillBotCount` seats
   - Bots registered as TournamentRegistrations (with `isBot: true`)
   - Bots can be seated immediately

3. **Minimum to Deal**
   - Requires: **1+ seated HUMAN** + enough opponents to deal
   - Opponents may be bots or committed no-show ghost stacks
   - First hand dealt is the official tournament start
   - 1 human + bots only can produce bot/achievement results, but no real-money payout

4. **Grace Period Logic** (NEW MVP FEATURE)
   ```javascript
   at startTime:
     status = STARTING
     graceUntilMs = startTime + startGraceMinutes * 60 * 1000
   
   after graceUntilMs:
     if (seatedHumans < 1):
       status = CANCELLED
       refund all human registrations
       end tournament
     else:
       proceed to LATE_REG or RUNNING
   ```

5. **Transition to LATE_REG or RUNNING**
   - Once first hand is ready to deal:
     - If `lateRegMinutes > 0`: Transition to **LATE_REG** status
     - If `lateRegMinutes == 0`: Transition directly to **RUNNING** status
   - Registered humans who have not seated become NO_SHOW_GHOST stacks
   - Blind levels tick based on level duration (8 min for standard_8min)
   - Current level stored in `tournament.currentLevel`

### Policy Changes at Start
- ❌ **Unregistering blocked**: Once the first hand is dealt, players cannot unregister (MVP policy)
- ✅ **Cards can deal during LATE_REG**: Even if new players can join, cards may deal if 1+ human and enough opponents are present
- ✅ **Grace period**: 10 min default to get at least 1 seated human; auto-cancel + refund if timeout
- ✅ **Ghost stacks**: No-shows post blinds/antes on schedule and auto-fold until busted or seated

### Player Experience at Start
- If player registered and hasn't joined: can click "Join" to enter table
- If player registered and late reg still open: **can rejoin table without re-registering**
- If player never registered: **cannot join** (unless late registration still open and they register)

---

## 4. Late Registration System

### How It Works

Late registration is a **window of time** during which new players can:
1. Register for the tournament (post entry fee)
2. Join the table immediately
3. Bust out and re-join later (as spectator only if `finishPlace` is set)

### Configuration

```javascript
// From tournament-schedule.ts
function lateRegCloseMs(tournament) {
  return tournament.startTime.getTime() + tournament.lateRegMinutes * 60 * 1000;
}

function isLateRegistrationOpen(tournament, now = new Date()) {
  if (tournament.lateRegMinutes <= 0) return false; // Disabled
  if (tournament.status === "REGISTERING") return true; // Pre-start
  if (tournament.status === "LATE_REG" || tournament.status === "RUNNING") {
    return now.getTime() < lateRegCloseMs(tournament); // Check time window
  }
  return false;
}
```

### Scenarios

**Scenario A: Late Reg ON (default)**
```
Start Time: 12:00 PM
Late Reg Duration: 16 minutes
Late Reg Closes: 12:16 PM

11:50 AM: Player A registers and joins
12:05 PM: Player B registers and joins (late reg open)
12:10 PM: Player C registers and joins (late reg still open)
12:20 PM: Player D tries to register → BLOCKED (late reg closed)
```

**Scenario B: Late Reg OFF**
```
Start Time: 12:00 PM
Late Reg Duration: 0 minutes

11:55 AM: Player A registers and joins
12:00 PM: Tournament starts, table created, blinds up
12:01 PM: Player B tries to register → BLOCKED (tournament already started)
```

### Late Registration Closure Events

Late registration automatically closes when ANY of these occur:
1. **Time elapsed**: `now >= startTime + lateRegMinutes`
2. **Max seats filled**: All seats occupied by registered players
3. **Tournament finishes**: Winner determined (1 human with chips)
4. **Tournament cancelled/abandoned**: No valid result reached

**Important**: Seating players does not close late registration. Late registration closes only by time elapsed, max seats filled, tournament finish, cancel, or abandon.

### Current Behavior in CashierService

```typescript
// processTournamentRegister() checks:
const regOpen =
  tourney.status === "REGISTERING" ||
  tourney.status === "LATE_REG" ||
  isLateRegistrationOpen(tourney, new Date());

// processTournamentRefund() checks the same:
const regOpen =
  tourney.status === "REGISTERING" ||
  tourney.status === "LATE_REG" ||
  isLateRegistrationOpen(tourney, new Date());
```

**MVP Policy**: New registrations may remain open during LATE_REG, but refunds do not. Unregister/refund is allowed only before the first hand is dealt and before the player has seated.

---

## 5. Player Registration, Entry Fees & Prize Pool

### Registration Process

1. **Player clicks "Register"** on tournament detail
2. **CashierService.processTournamentRegister()**:
   - Check tournament open (REGISTERING, LATE_REG, or late reg time window open)
   - Check tournament not full (`registrations.count < maxPlayers`)
   - **Debit player's bankroll**: `user.bankrollCents -= entryFeeCents`
   - **Create TournamentRegistration** record
   - **Credit prize pool**: `tournament.prizePoolCents += entryFeeCents`
   - Create TOURNAMENT_ENTRY balance transaction
3. **Player appears in standings** as registered

### Prize Pool Composition

```
Prize Pool = sum of all entry fees
           = registeredCount × entryFeeCents

Example:
  entryFeeCents = 1000 cents ($10)
  10 players registered
  prize pool = $100
```

### Entry Fee Deduction Timing

- ✅ Deducted **immediately** on registration (before player joins table)
- ✅ Refundable only before the first hand is dealt and before the player has seated
- ✅ Late registration extends new-entry registration only; it does not extend the refund window
- ✅ If tournament cancelled before start: entries refunded

---

## 6. Unregistering & Refunds

### When Refunds Are Allowed

Current bug/legacy behavior in `processTournamentRefund()`:

```typescript
const regOpen =
  tourney.status === "REGISTERING" ||
  tourney.status === "LATE_REG" ||
  isLateRegistrationOpen(tourney, new Date());

if (!regOpen) throw new Error(TOURNAMENT_CLOSED);
```

**Intended MVP logic**: Replace this reused `regOpen` check with `canUnregisterFromTournament()`, which allows refunds only before the first hand is dealt and before the player has seated.

### Refund Behavior

✅ **Allowed During**:
1. REGISTERING status, or STARTING before the first hand is dealt
2. Before the first hand is dealt
3. Before the player has been seated or dealt

✅ **Refund Actions**:
1. Delete TournamentRegistration record
2. Return entry fee to player bankroll: `user.bankrollCents += entryFeeCents`
3. Decrement prize pool: `tournament.prizePoolCents -= entryFeeCents`
4. Create REFUND balance transaction

❌ **Not Allowed When**:
1. Tournament status is LATE_REG, RUNNING, FINISHED, CANCELLED, or ABANDONED
2. First hand has been dealt
3. Player has already been seated
4. Player has finishPlace set

### Scenario: Player Tries to Unregister After Start

```
Setup: 10 players registered, first hand deals at 12:00 PM, late reg closes at 12:16 PM
At 12:01 PM: Player attempts to unregister
Result: ❌ BLOCKED — refund window ended when the first hand was dealt
```

**MVP Policy**: Players cannot withdraw for a refund after the first hand is dealt, even if late registration is still open.

---

## 7. Gameplay & Player Elimination

### Player Bust-Out / Elimination

When a player loses all chips:
1. PokerRoom marks player as eliminated
2. Sets `TournamentRegistration.finishPlace` to their placement
3. Player can **rejoin as spectator** (read-only mode)
4. ✅ Player is eligible for payouts based on finish place

### Example Tournament Flow

```
Registered Players: Alice, Bob, Charlie (3 humans) + 1 bot
All 4 seated, blinds rolling

Level 1: All playing
Level 2: Bot busted out (finishPlace = 4)
Level 3: Charlie busted out (finishPlace = 3, eligible for payout)
Level 4: Alice vs Bob, Alice has all chips (Bob finishPlace = 2)
        Tournament ends → Alice finishPlace = 1

Payouts (3-player structure: 50%/30%/20% of prize pool):
  Alice (1st): 50%
  Bob (2nd): 30%
  Charlie (3rd): 20%
  Bot (4th): $0 (ineligible)
```

### Tournament Win Condition

Tournament ends when:
- **1 human with chips remains** (others eliminated or have 0 chips)
- Tournament transitions to **FINISHED**

---

## 8. Prize Pool & Payout Distribution

### Payout Structure (from tournament-payouts.ts)

Payouts are **fixed-size prize pools** distributed by finish place:

```typescript
function getPayoutSlots(entrantCount) {
  if (entrantCount <= 2) return [{ place: 1, percent: 100 }];   // Winner takes all
  if (entrantCount === 3) return [
    { place: 1, percent: 70 },
    { place: 2, percent: 30 }
  ];
  // 4+ players: return [
  //   { place: 1, percent: 50 },
  //   { place: 2, percent: 30 },
  //   { place: 3, percent: 20 }
  // ];
}
```

### Payout Calculation

```typescript
// Example: 10 players registered @ $10 = $100 prize pool
// 8 humans show up, 2 bots

// Human finish order: Alice(1st), Bob(2nd), Charlie(3rd), David(4th-8th)
// Payout slots (4+ humans): 50%/30%/20% (paid to top 3 only)

Payouts (of $100 pool):
  Alice: $50
  Bob: $30
  Charlie: $20
  David-Helen: $0 (only 3 paid places)
```

### Key Rules

1. **Bots are ineligible for payouts** — they don't receive prizes
2. **Unpaid payout slots are rebalanced across payable humans**
   - If top 3 pays 50/30/20 but only 2 humans are payable, normalize 50+30 = 80
   - 1st receives 62.5%, 2nd receives 37.5%; nobody keeps the unused 20%
3. **Prize pool = registered count × entry fee**
   - NOT "active players" or "seated players"
   - Counts **all humans who registered**, even if they never joined
4. **Payout tier** depends on **human entrant count**, not total players
5. **Rounding**: Remainder cents go to 1st place
6. **Bot challenge results** may be recorded without money payouts when no money-valid human tournament exists

### Payout Issuance (processTournamentFinishResults)

When tournament moves to FINISHED:
1. Find all registrations with `finishPlace != null` and `isBot: false`
2. Check whether money payout mode is active: 2+ committed human-funded entries and at least one payable human finisher
3. Compute payouts using `computeHumanPayoutAmountsByUserId()` and normalize unpaid slots across payable humans
4. Create TOURNAMENT_PAYOUT balance transactions for eligible humans
5. Record bot/achievement result if applicable
6. Award badges/achievements if earned

When tournament moves to ABANDONED, it follows the refund/no-payout flow instead: refund all human entries, zero the prize pool, and do not issue normal tournament payouts.

---

## 8B. Ghost Stack Blind/Ante Drain

No-show and sitting-out stacks use the same blind schedule as active players. There is no separate penalty rate.

### Seat States

- **ACTIVE**: Player can act normally
- **SITTING_OUT**: Visible at table, posts blinds/antes, auto-folds every hand
- **NO_SHOW_GHOST**: Virtual seat, posts blinds/antes when owed, auto-folds every hand
- **BOT**: Plays normally, never buys in, never receives payouts
- **BUSTED**: Stack is 0, finishPlace assigned

### Drain Formula

For a full table:

```text
handsPerOrbit = tableSize
orbitCost = smallBlind + bigBlind + ante * tableSize
orbitsToBlindOutAtCurrentLevel = stack / orbitCost
handsToBlindOutAtCurrentLevel = orbitsToBlindOutAtCurrentLevel * tableSize
```

Example at 25/50 with no ante on a 9-seat table:

```text
orbitCost = 25 + 50 = 75
startingStack = 1500
orbitsToBlindOut = 1500 / 75 = 20
handsToBlindOut = 20 * 9 = 180
```

Because blind levels rise, actual bust-out happens faster than the level-1-only estimate. Ghost stacks should therefore be advanced through the same virtual button/blind/ante rotation as the live table, not drained by a flat timer.

---

## 9. Special Cases & Edge Scenarios

### Scenario 1: No Humans Register ❌

```
Tournament created: 2-9 players max
Bots filled: 2 bots (if fillBotsAtStart: true)
Humans registered: 0

At start time:
  Table created with 2 bots
  No humans ever join
  
Result:
  Tournament does not deal cards.
  If no human is seated by grace timeout, tournament becomes CANCELLED.
  Any human entries are refunded.
  Bot-only tournaments do not produce FINISHED or bot-challenge results.
```

**MVP Behavior**: Bot-only tournaments cannot start gameplay because at least 1 seated human is required.

---

### Scenario 2: Humans Register but Don't Join

```
Tournament setup:
  3 human registrations (Alice, Bob, Charlie)
  entryFeeCents: 1000
  prizePoolCents: 3000

At start time:
  Table created, but NO players join
  Minimum 1 seated human never reached
  
Timeline:
  12:00 → 12:30: Table exists, all 3 still registered, prize pool locked
  12:30: Bob joins table
  Table now has 1 human + fill bots
  First hand can deal if enough opponents exist

Possible outcomes:
  A) First hand deals → Alice/Charlie become NO_SHOW_GHOST stacks
  B) Grace timeout passes before anyone sits → CANCELLED + refunds all human entries
  C) Admin cancels → refunds all human entries
```

**MVP Policy**: Grace timeout defaults to 10 minutes. If zero humans are seated when it expires, the tournament is CANCELLED and all human entries are refunded. Once any human sits and the first hand is dealt, other committed humans become ghost stacks instead of refunds.

---

### Scenario 3: One Human Joins, Then Drops Out

```
Tournament: 8 registered (5 humans + 3 bots filling)
At 12:00: Tournament starts, STARTING → LATE_REG
Only Alice joins (1 human seated)
Bots fill opponent seats, so cards may deal

12:05: Alice's connection drops, she's removed from table
Zero humans seated now
Alice remains a SITTING_OUT stack if already dealt in

Options:
  A) If no hand has dealt, grace timeout can cancel
  B) If a hand has dealt, Alice posts blinds/antes and auto-folds
  C) Bots keep playing normally but never receive money payouts
```

**MVP Policy**: After first hand, disconnects become sitting-out stacks. They remain visible, post blinds/antes, auto-fold, and eventually bust.

---

### Scenario 4: Human Joins, Plays One Hand, Then Leaves

```
Tournament: 3 humans registered + 1 bot
All seated at 12:05, cards dealt
After 1 hand, Alice stands up (disconnects or leaves voluntarily)

Current Behavior:
  Alice's registration still active
  finishPlace is NOT set (she hasn't busted)
  She can rejoin if late reg still open
  She can spectate after finishing

If Alice never returns:
  She remains in registrations with finishPlace = null
  She is NOT eligible for payouts (only finishPlace winners pay)
  Her entry fee is in prize pool but not paid to her
```

**⚠️ QUESTION**: Should there be a "sitting out too long → forfeit" rule?

---

### Scenario 5: 10 Register, 2 Join, 1 Busts Out

```
Setup:
  10 humans register @ $10 → prizePool = $100
  Only 2 show up and join table
  After 5 minutes: 1 busts out (finishPlace = 2)
  1 human remains (finishPlace = 1)

Payout Calculation:
  humanEntrantCount = 10 (because 10 humans registered)
  Payout structure (10 players): 50%/30%/20%
  
  Winner payout: $50
  Runner-up payout: $30

  Unpaid slots are normalized across payable humans.
```

**⚠️ CRITICAL AMBIGUITY**: 

Does `entrantCount` in `getPayoutSlots()` mean:
- A) **Total registrations** (all who paid entry fee) → 10 humans
- B) **Seated players** (those who actually joined) → 2 humans

From code:
```typescript
// In processTournamentFinishResults:
const prizePoolCents = tournament.prizePoolCents; // Based on ALL registrations
const humanEntrantCount = tournament.registrations.filter(r => !r.isBot).length;

// Then in computeHumanPayoutAmountsByUserId:
const payoutSlots = getPayoutSlots(humanEntrantCount);
```

**Answer**: It uses **total human registrations**, not seated players.

So in this scenario:
```
prizePool = $100 (from 10 registrations @ $10)
humanEntrantCount = 10
Payout slots (10 players): 50%/30%/20% = $50/$30/$20

Only 2 humans actually played:
  Winner (Alice): $62.50 (1st place, normalized from 50/80)
  Loser (Bob): $37.50 (2nd place, normalized from 30/80)
  
Remaining 8 who registered but never played:
  Receive NO_SHOW_GHOST stacks
  Post blinds/antes and auto-fold until busted
  Receive $0 unless they somehow finish inside a payable normalized slot, which should normally be avoided by assigning no-show finishes below active/seated players
```

**Implication**: If 8 players register but never show up, the 2 who do show up can win the full funded prize pool because the absent stacks are mathematically participating and blinding down.

---

### Scenario 6: Rebuy Tournament — When Can Players Rebuy?

```
Tournament setup:
  playFormat: "REBUY"
  maxRebuysPerPlayer: 2
  rebuyPeriodMinutes: 30
  startTime: 12:00 PM

At 12:00: Tournament starts
At 12:15: Alice busts, applies first rebuy (still within 30-min window)
At 12:20: Alice busts again, applies second rebuy
At 12:25: Alice busts third time, cannot rebuy (max 2 reached)
At 12:30: Late registration closes, rebuy period ends
At 12:31: Bob busts (rebuy period expired) → cannot rebuy
```

**Current Code** (from EconomyRouter):
```typescript
// POST /buyin (rebuy endpoint)
// Enforces: maxRebuysPerPlayer check
// Does NOT check if rebuyPeriodMinutes has elapsed
```

**MVP Policy Checks**:
1. Can rebuys happen AFTER rebuyPeriodMinutes elapses?
   - Current code: Appears to allow it (no time check visible)
   - MVP policy: No. Rebuy closes at `startTime + rebuyPeriodMinutes` as a hard stop.

2. Can players rebuy if they're sitting out or not seated?
   - MVP policy: Rebuy is still subject to the same hard time window and per-player max

3. Is rebuy fee same as entry fee?
   - Current code: Appears to be configurable separately (not visible in UI)

---

### Scenario 7: Late Reg ON, One Human vs Bots

```
Tournament: 1 human registration + 2 bots, fillBotsAtStart: true
At 12:00: Table created, 2 bots seated
At 12:05: Alice sits, first hand deals
At 12:16: Late reg closes (no other humans registered)

Result:
  Tournament can produce a bot challenge / achievement result.
  Bots never buy in and never receive payouts.
  Alice does not receive a real-money payout unless 2+ committed human-funded entries existed.
```

**MVP Behavior**: One human can play against bots for record/achievement value without bots contributing money.

---

### Scenario 8: Player Tries to Unregister During Late Registration

```
Setup:
  5 humans registered @ $10 → prizePool = $50
  Late reg until 12:16 PM
  
At 12:10:
  Alice wants to cancel (maybe joined but didn't like table)
  Calls unregister endpoint
  
Expected: ❌ BLOCKED — refund window ended when the first hand was dealt
Actual: Should return TOURNAMENT_CLOSED and keep Alice's entry in the prize pool
```

**MVP Policy**: Unregister is allowed only before the first hand is dealt and before the player has seated. Late registration extends paid entry only, not refunds.

---

## 10. Tournament Abandonment (All Humans Eliminated)

### What Triggers Abandonment?

From `tournament-abandon.ts`:

```typescript
async function abandonTournamentAtMaxBlind(tournamentId) {
  // Conditions:
  1. Tournament status === "RUNNING"
  2. Current blind level === max blind level (last level)
  3. All human registrations have finishPlace != null (all busted)
  
  // Action:
  1. Process tournament abandon refunds (CashierService)
  2. Mark tournament ABANDONED
  3. Set prizePoolCents = 0
  4. Process finish results (no payouts issued)
}
```

### Abandonment Payout Rules

- **No payouts issued**: `processTournamentFinishResults()` still runs but prizePoolCents = 0
- **All entries refunded**: Each player's entry fee returned to their bankroll
- **Bot busts out**: No refund (never had bankroll debit)
- **Bot-only entries**: No bankroll debit occurred, so there is nothing to refund

### Example: Abandonment Scenario

```
5 humans registered @ $10 = $50 prize pool
2 humans join table (Alice, Bob) + 3 bots
Cards deal normally
Alice and Bob both bust out at level 8 (max blind)
Only bots remain with chips

Trigger: All humans eliminated, max blind reached

Result:
  Tournament status: ABANDONED
  prizePoolCents: 0 (was $50)
  Refunds issued: $10 to Alice, $10 to Bob
  Non-joiners: 3 humans never joined, also refunded because ABANDONED means no valid tournament result exists.
```

**MVP Policy**: ABANDONED means no valid tournament result exists, so all human entries are refunded, including no-shows.

---

## 11. Current UI & Configuration Gaps

### Missing Features in TournamentCreateForm

| Feature | Status | Impact |
|---------|--------|--------|
| **Late registration toggle** | ❌ Missing | Can't disable late reg; always 16 min |
| **Play format selector** | ❌ Missing | Locked to FREEZEOUT |
| **Rebuy configuration** | ❌ Missing | Can't create rebuy tournaments |
| **Last level to rebuy** | ❌ Missing | No UI for rebuyPeriodMinutes |
| **Bot auto-fill options** | ✅ Present | Can choose to fill bots and count |
| **Blind structure preset** | ❌ Missing | Locked to standard_8min |

### Unclear/Ambiguous Behaviors

| Scenario | Current Behavior | Needs Clarification |
|----------|------------------|---------------------|
| **Player unregisters during LATE_REG** | Must be blocked | Refund window ends at first hand dealt |
| **Tournament waits indefinitely for 2+ seated** | Add grace timeout | Auto-cancel + refund all human entries |
| **Non-joiner registration in abandoned tournament** | Refunded | ABANDONED has no valid result |
| **Rebuy after rebuyPeriodMinutes elapses** | Prevent | Hard stop at rebuyPeriodMinutes |
| **Late reg closes on 2+ seated OR time?** | Time-based (not code) | Confirmed: seating does not close late registration |

---

## 12. Code-Level Implementation Changes (MVP)

### Priority 1: Split Predicates (CRITICAL)

**Remove**: The reused `regOpen` predicate
**Add**: Three separate predicates with clear semantics

```typescript
// In tournament-schedule.ts

export function canRegisterForTournament(
  tournament: { status: string; startTime: Date; lateRegMinutes: number },
  now: Date = new Date()
): boolean {
  if (tournament.status === "REGISTERING") return true;
  if (tournament.status === "LATE_REG") {
    return now.getTime() < lateRegCloseMs(tournament);
  }
  return false;
}

export function canUnregisterFromTournament(
  tournament: { status: string; firstHandDealtAt?: Date | null },
  registration: { seatedAt?: Date | null; firstHandDealtAt?: Date | null },
  now: Date = new Date()
): boolean {
  // MVP Policy: Only before official start and before seating
  return (
    (tournament.status === "REGISTERING" || tournament.status === "STARTING") &&
    !tournament.firstHandDealtAt &&
    registration.seatedAt == null &&
    registration.firstHandDealtAt == null
  );
}

export function canRebuyTournament(
  tournament: { status: string; startTime: Date; rebuyPeriodMinutes: number; playFormat: string; maxRebuysPerPlayer: number },
  registration: { rebuyCount: number },
  now: Date = new Date()
): boolean {
  if (tournament.playFormat !== "REBUY") return false;
  if (tournament.rebuyPeriodMinutes <= 0) return false;
  if (registration.rebuyCount >= tournament.maxRebuysPerPlayer) return false;
  
  const rebuyCloseMs = tournament.startTime.getTime() + tournament.rebuyPeriodMinutes * 60 * 1000;
  return now.getTime() < rebuyCloseMs;
}
```

### Priority 2: Add Tournament Config Fields

```typescript
// schema.prisma: Add to Tournament model
model Tournament {
  // ... existing fields ...
  
  // NEW
  startGraceMinutes: Int @default(10)     // Grace period to reach min seated
  graceExpireMs: BigInt?                  // Unix ms when grace expires
  firstHandDealtAt: DateTime?             // Official tournament start
  
  // CLARIFY: Make these explicit
  lateRegMinutes: Int @default(16)        // 0 = disabled, >0 = minutes
  rebuyPeriodMinutes: Int @default(0)     // 0 = no rebuys, >0 = minutes
  maxRebuysPerPlayer: Int @default(0)     // 0 = no rebuys, >0 = max count
}
```

### Priority 3: Update Registration State Fields

```typescript
// schema.prisma: Add to TournamentRegistration
model TournamentRegistration {
  // ... existing fields ...
  
  // NEW state tracking
  seatedAt: DateTime?                     // When first seated
  firstHandDealtAt: DateTime?             // When first hand dealt after seating
  disconnectedAt: DateTime?               // When disconnected/busted
  noShowAt: DateTime?                     // When marked no-show (grace expired)
  rebuyCount: Int @default(0)             // How many rebuys used
  
  // EXISTING (keep)
  finishPlace: Int?                       // 1st, 2nd, 3rd, etc.
  isBot: Boolean @default(false)
}
```

### Priority 4: Enforce Rebuy Period (CashierService)

```typescript
// In EconomyRouter POST /buyin endpoint (rebuy)

import { canRebuyTournament } from "./tournament-schedule.js";

router.post("/buyin", requireAuth, async (req, res) => {
  const { tournamentId } = req.body;
  const userId = req.user.id;
  
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  const registration = await prisma.tournamentRegistration.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  
  // MVP: Enforce rebuy period
  if (!canRebuyTournament(tournament, registration, new Date())) {
    return res.status(400).json({ error: "Rebuy period closed" });
  }
  
  // ... rest of rebuy logic ...
});
```

### Priority 5: Update TournamentsRouter Predicates

```typescript
// In TournamentsRouter.ts

import { canRegisterForTournament, canUnregisterFromTournament } from "./tournament-schedule.js";

// POST /:id/register
if (!canRegisterForTournament(tournament, new Date())) {
  throw new Error(TOURNAMENT_CLOSED);
}

// POST /:id/unregister (POLICY CHANGE)
if (!canUnregisterFromTournament(tournament, new Date())) {
  throw new Error(TOURNAMENT_CLOSED); // Now blocks LATE_REG + RUNNING
}
```

### Priority 6: Implement Grace Period + Auto-Cancel

```typescript
// In TournamentDirector.ts

async function checkGraceTimeoutAndCancel(
  tournament: Tournament,
  now: Date = new Date()
): Promise<void> {
  if (tournament.status !== "STARTING") return;
  if (!tournament.graceExpireMs || now.getTime() < tournament.graceExpireMs) return;
  
  // Grace expired, check whether any human seated before the first hand
  const seatedHumans = await countSeatedHumansInTournament(tournament.id);
  if (seatedHumans < 1) {
    // Auto-cancel: refund all entries
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "CANCELLED", finishedAt: now },
    });
    
    // Refund all registrations
    await CashierService.processTournamentCancelRefunds({
      tournamentId: tournament.id,
      externalRef: tournamentCancelExternalRef(tournament.id),
    });
  }
}
```

---

## 13. Summary: What Happens at Different Stages (MVP)

### Pre-Start (REGISTERING)
- Players can register and unregister freely
- Entry fees debited immediately
- Prize pool grows with each registration
- No table created yet

### At Start Time (STARTING → LATE_REG or RUNNING)
- **Minimum requirements**: 1+ registered players
- **Table created** with starting stack for each player
- **If lateRegMinutes > 0**: Enter LATE_REG status, allow more registrations
- **If lateRegMinutes == 0**: Enter RUNNING status, tournament closed to new regs
- **Min to deal**: 1+ seated human plus enough opponents before cards flip. Bots and committed ghost stacks may satisfy the opponent seats.

### During Late Registration Window
- New players can register + join immediately
- Existing registered players cannot unregister after the first hand is dealt.
- Cards may already be dealing (if 1+ human and enough opponents are present)
- Status: LATE_REG allows late registration; RUNNING does not allow late registration

### After Late Registration Closes
- Tournament locked: no new registrations allowed
- All remaining players are committed
- Blind levels advancing
- Cards dealing (or had been for a while)

### When Tournament Ends
- **FINISHED**: Human or bot/achievement winner determined, tournament over
- **ABANDONED**: All humans busted at max blind level, tournament abandoned
- **ACTION**: Money payouts issued only if money mode is active; bot challenge wins may record without payouts; refunds issued if ABANDONED

---

## 14. Highest-Priority MVP Implementation (in order)

### 🔴 CRITICAL (Block all else until done)

1. **Split predicates** → `canRegisterForTournament()`, `canUnregisterFromTournament()`, `canRebuyTournament()`
   - Prevents abuse of unregister-during-play
   - Makes logic auditable

2. **Block unregister after start** → Use `canUnregisterFromTournament()`
   - Policy: Only allowed before first hand dealt and before the player has seated
   - Rejects all LATE_REG and RUNNING

3. **Enforce rebuy period** → Use `canRebuyTournament()`
   - Rebuys close at `startTime + rebuyPeriodMinutes`
   - Hard stop, no exceptions

4. **Define ghost-stack behavior** → Add `noShowAt` + seat state logic
   - Never-seated players become NO_SHOW_GHOST stacks after first hand
   - Ghost stacks post blinds/antes, auto-fold, and eventually bust

5. **Refund on ABANDONED** → Extend `processTournamentAbandonRefunds()`
   - All human registrations get entry fee back
   - Currently doesn't refund; needs implementation

### 🟡 HIGH (Do before UI release)

6. **Implement start grace timeout** → 10 min default
   - Add `startGraceMinutes`, `graceExpireMs` fields
   - Auto-cancel + full refund if 0 humans seated at timeout
   - Prevents tournaments hanging indefinitely

7. **Update CashierService.processTournamentRefund()** → Use new `canUnregisterFromTournament()`
   - Stop allowing unregister in LATE_REG status
   - Throw error if tournament already started

8. **Document late registration as time-based only**
   - Add comments clarifying: NOT seat-based closure
   - Clarify: Cards CAN deal during LATE_REG

### 🟢 MEDIUM (For next sprint)

9. **Add UI fields**:
   - Late registration toggle (lateRegMinutes = 0 to disable)
   - Play format selector (FREEZEOUT vs REBUY)
   - Rebuy configuration (maxRebuysPerPlayer, rebuyPeriodMinutes)
   - Start grace period (startGraceMinutes)

10. **Add registration state tracking**:
    - `seatedAt`, `firstHandDealtAt`, `disconnectedAt`, `noShowAt`, `seatState` fields
    - Enables spectator logic and better diagnostics

### Test Cases to Add

```javascript
// MUST PASS (MVP-blocking)
✅ canUnregisterFromTournament blocks during LATE_REG
✅ canUnregisterFromTournament blocks during RUNNING
✅ canRebuyTournament blocks after rebuyPeriodMinutes
✅ Grace timeout refunds if 0 humans seated
✅ ABANDONED status refunds all human entries
✅ 10 register / 2 join / 1 busts: Payout from all 10 entries (not just 2)
✅ No-shows become ghost stacks, post blinds/antes, auto-fold, and eventually receive finishPlace
✅ Bots ineligible for payouts
✅ 1 human + bots can produce bot/achievement result with no money payout

// SHOULD PASS (Core logic)
✅ Late reg stays open while cards dealing
✅ 2 players seated does NOT close late reg early
✅ Rebuy allowed during LATE_REG if within period
✅ Rebuy blocked after period closes
✅ CANCELLED status issued on grace timeout
✅ All human registrations refunded on CANCELLED
```

---

## 15. MVP Policy Summary Table

| Scenario | MVP Decision | Rationale |
|----------|------|----------|
| **Unregister after first hand** | ❌ Block | Prevents abuse, commitment required |
| **Late reg while dealing** | ✅ Allow | Window is time-based, not seat-based |
| **2 seated = close late reg** | ❌ No | Late reg only closes on time/max/finish/cancel |
| **Grace timeout with 0 humans seated** | ✅ Auto-cancel + refund | Prevents bot-only starts |
| **No-show entries in pool after first hand** | ✅ Yes | Ghost stacks blind down instead of refunding |
| **No-show gets placement** | ✅ Yes | Assigned when ghost stack busts |
| **Rebuy after period** | ❌ Block | Hard stop, clear cutoff |
| **Bot for payouts** | ❌ Ineligible | Only humans get prizes |
| **Bot for seats** | ✅ Count | Fills seats and may play once 1+ human is seated |
| **1 human vs bots only** | Bot/achievement result only | No money payout without 2+ committed human-funded entries |
| **2+ human-funded entries, 1 seated** | Money-valid via ghost stacks | Absent humans post blinds/antes and auto-fold |
| **All humans bust at max blind** | Refund + ABANDONED | No valid human winner, all entries refunded |

---

**End of Analysis**
