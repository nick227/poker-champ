## Turn Timeouts & Sitting Out

This document specifies how **per-turn timeouts** interact with our existing **sitting-out** model, and where to integrate this with minimal code churn.

### Goals

- **Per-turn timer** for connected human players:
  - Base window: **30s**.
  - After 30s, show a **10s visible countdown** client-side.
  - At 40s total, if no action, **auto-set that player to sitting out**.
- **Hardened sitting-out semantics**:
  - A human may sit out **indefinitely** until:
    - They explicitly sit back in,
    - The **table creator or an admin** removes them, or
    - Table-level sweeps (abandon/TTL) apply normal cleanup rules.
- **Low-code-churn**: reuse existing Dealer, automation, and seat persistence paths instead of introducing new parallel systems.

---

### Current Model (As-Is)

#### Core State

- **PlayerState (server)**:
  - `status`: `"WAITING" | "ACTIVE" | "FOLDED" | "ALL_IN" | "ABANDONED" | "OUT"`.
  - `sittingOutUntilNextHand: boolean` – seat-level flag gating whether a player is dealt into the next hand.
  - `connected: boolean` + `disconnectDeadlineTs: number` – connection state and reconnection window.
- **Seat snapshots (client)**:
  - Derived from `TableSeatSnapshot` plus `disconnectDeadlineTs`.
  - `table.adapter.ts` maps server state into:
    - **Hero display status**: `"ACTIVE" | "FOLDED" | "ALL_IN" | "SITTING_OUT | "RECONNECTING"`.
    - **Opponent display status**: `"active" | "folded" | "allIn" | "sittingOut" | "reconnecting"`.
  - Rules:
    - Any **disconnected + past deadline** or **ABANDONED/OUT** → `sittingOut`.
    - Connected ABANDONED/OUT also show as `sittingOut`.

#### Sitting Out Today

- **Manual toggle**:
  - Client sends `SET_SITTING_OUT { sittingOut: boolean }` via `useMultiTableStore.dispatchSetSittingOut`.
  - `PokerRoom` validates and delegates to `Dealer.setPlayerSittingOut(userId, sittingOut)`.
  - `Dealer.setPlayerSittingOutInternal`:
    - When `sittingOut === true`:
      - Sets `player.sittingOutUntilNextHand = true`.
      - Clears `disconnectDeadlineTs`.
      - Sets `player.needsAction = false`.
      - If `stackCents <= 0` → `status = "OUT"`.
      - Else sets `status = "ABANDONED"` while preserving stack.
      - Emits `"SEAT_CHANGE"` snapshot and, if mid-hand and this seat was `toActSeat`, may:
        - Advance street, or
        - Move `toActSeat` and call `maybeActForBot`.
    - When `sittingOut === false`:
      - Clears `sittingOutUntilNextHand` and `disconnectDeadlineTs`.
      - If `stackCents <= 0` → `status = "OUT"`.
      - If `street === "WAITING"` and stack > 0:
        - Sets `status = "ACTIVE"`, emits `"SEAT_CHANGE"`, and auto-starts hand when ≥2 non-out players.
      - If mid-hand, rejoin means “eligible next hand”; ABANDONED/OUT remain out of the current hand.

- **Disconnects and abandon**:
  - `Dealer.markDisconnected*` / `PlayerLifecycleService.markDisconnected`:
    - `connected = false`, `disconnectDeadlineTs = deadline`, emit `"SEAT_CHANGE"`, then `MAYBE_AUTOMATE_TURN`.
  - Periodic `sweepDisconnectDeadlines` → `markAbandoned`:
    - Sets `status = "ABANDONED"`, `connected = false`, clears deadline, disables `needsAction`, and schedules deferred removal.
  - Abandoned seats are later hard-removed and cashed out via:
    - `PlayerLifecycleService.removePlayer` + TTL,
    - `PokerRoom.runSittingOutSweep` when **no humans are connected**.

- **Auto-sit-out cap for repeated auto-actions**:
  - `TurnAutomationService.applyDisconnectedAutoActionCapForHand`:
    - Counts per-hand auto-actions for **disconnected humans**.
    - On reaching `AUTO_ACTION_HAND_CAP` (config), sets `player.status = "ABANDONED"`, `needsAction = false`.
    - Optional callback `onAutoSitOutReachedCap` updates persistent seats to `SEATED_SITTING_OUT`.

- **Persistent seats (out-of-band sitting out)**:
  - `TableSeatSessionService.markSittingOut` is called:
    - On disconnect during `PokerRoom.onLeave`,
    - When auto-sit-out cap is reached.
  - `PokerRoom.bootstrapPersistentSeatRecovery`:
    - Restores players from persisted sessions as **disconnected, sitting out**:
      - `connected: false`, `sittingOut: true` → `status = "ABANDONED"` with preserved stack.

#### Turn Automation Today

- **Dealer → TurnAutomationService wiring**:
  - `HandLifecycleService` and `PlayerLifecycleService` both emit `MAYBE_AUTOMATE_TURN` plans.
  - `Dealer.executeHandLifecyclePlans` / `executePlayerLifecyclePlans`:
    - For `MAYBE_AUTOMATE_TURN`, call `Dealer.maybeActForBot()`.
  - `TurnAutomationService.maybeActForBot()`:
    - If no active hand or staged runout: **no-op**.
    - Resolves `toActId` from `state.seats[state.toActSeat]`.
    - If `eligibleToAct(player) && player.needsAction` is false: returns.
    - Retrieves `HeroActionOptions` for the actor.
    - Behavior:
      - **Connected human**: early **return** (no automation).
      - **Disconnected human**: queue auto-action:
        - `CHECK` if legal, otherwise `FOLD`.
      - **Bot**: use `BotResolver` and `enqueueAction` with a randomized delay.

**Key point**: There is **no per-turn timer** for connected humans; timers only exist for bots and disconnected-human auto-actions.

---

### Identified Gaps

1. **No server-side per-turn deadline for connected humans**
   - `TurnAutomationService.maybeActForBot` explicitly skips automation when `player.kind !== "BOT" && player.connected`.
   - All enforcement relies on:
     - Immediate auto-actions for **disconnected** humans, and
     - Action-count caps for repeated auto-actions.

2. **No explicit concept of “timed-out into sit-out”**
   - `status = "ABANDONED"` + `sittingOutUntilNextHand = true` covers multiple cases:
     - Manual sit-out,
     - Disconnect that timed out,
     - Auto-action cap hits.
   - We do not differentiate in state or persistence **why** a seat is sitting out.

3. **No visual countdown for expiring turns**
   - The client knows:
     - `isMyTurn` from `getIsMyTurn(snapshot, seatContext)`.
     - `serverTimeTs` from snapshots.
   - But there is **no displayed per-turn deadline** and no count-down UX.

4. **Soft “forever sit-out” semantics are implicit**
   - A human with `status = "ABANDONED"` and non-zero stack can effectively **sit out indefinitely**:
     - They are preserved in persistent seats (if enabled).
     - They are only purged by TTL sweeps or explicit removal (`kickUser`, `removePlayer`).
   - This matches the desired user-facing behavior but is **not documented** and is spread across:
     - Dealer, PlayerLifecycleService, PokerRoom, TableSeatSessionService.

---

### Hardened Sitting-Out Model

We standardize sitting-out as a **seat state**, driven by a combination of fields:

- **Sitting out (logical)**:
  - A seat is *sitting out* when:
    - `status ∈ { "ABANDONED", "OUT" }`, **or**
    - `sittingOutUntilNextHand === true` while the table is at `street = "WAITING"`.
  - Operationally:
    - Not eligible to be dealt into the next hand.
    - Never has `needsAction = true` in an active hand.

- **Reasons a player may enter sitting out**:
  1. **Voluntary**:
     - Client sends `SET_SITTING_OUT { sittingOut: true }`.
  2. **Disconnect**:
     - `markDisconnected` then `markAbandoned` on deadline expiry.
  3. **Automation cap**:
     - `applyDisconnectedAutoActionCapForHand` promotes to `ABANDONED`.
  4. **Turn timeout (new)**:
     - Connected human **fails to act** within 40s and is auto-flipped to a sitting-out seat.

- **Leaving sitting out**:
  - **Player-initiated**:
    - `SET_SITTING_OUT { sittingOut: false }` when they have `stackCents > 0`.
    - If `street = "WAITING"`:
      - `status = "ACTIVE"` and they are eligible for next deal.
    - If mid-hand:
      - They remain out of the current hand but are eligible **next hand**.
  - **Table creator / admin**:
    - Uses existing `kickUserByAdmin` (room) or `Dealer.removePlayer` to:
      - Cash out remaining stack, and
      - Free the seat.

- **“Forever sit-out” policy**:
  - As long as:
    - The table exists,
    - The seat has not been purged by TTL sweep, and
    - An admin or the table creator has not kicked the player,
  - The player’s **stack and seat** remain in `ABANDONED` / sitting-out state.

This clarifies that “sitting out forever” is supported by **ABANDONED + persistent seats**, not by a separate flag.

---

### Ideal Insertion Point for Turn Timer

We want the timeout to be:

- **Authoritative on the server** (no cheating by paused clients).
- **Aligned with existing automation** and **action queue**.
- **Low churn**: no new scheduler infra beyond what Dealer already uses.

The ideal insertion point is the **existing automation hook**:

- `Dealer.maybeActForBot()` → `TurnAutomationService.maybeActForBot()`:
  - Already called whenever:
    - A hand starts (`HAND_START` → `MAYBE_AUTOMATE_TURN`),
    - Streets advance (`AUTO_TRANSITION` → `MAYBE_AUTOMATE_TURN`),
    - Players join/leave/abandon in ways that change `toActSeat`.
  - Already has access to:
    - `PokerState` (including `toActSeat`, `handId`, `street`),
    - `HeroActionOptions` for the current actor,
    - `enqueueAction` which uses the Dealer’s queued-auto-action pipeline and **turn tokens**.

**Conclusion**: The per-turn timeout should be implemented as a new branch **inside this automation layer**, not in a separate loop.

---

### Proposed Low-Churn Implementation

#### 1. Server-Side Turn Timeout Logic

**New configuration (server-only):**

- `TURN_TIMEOUT_BASE_MS = 30_000` – base thinking time.
- `TURN_TIMEOUT_COUNTDOWN_MS = 10_000` – final visible countdown window.
- `TURN_TIMEOUT_TOTAL_MS = TURN_TIMEOUT_BASE_MS + TURN_TIMEOUT_COUNTDOWN_MS` – currently `40_000`.

These can live alongside existing constants in `dealer/timing.ts`.

**New behaviour in the automation layer:**

- In `TurnAutomationService.maybeActForBot()`:
  - After resolving `player` and `options`:
    - Current logic:
      - If `player.kind !== "BOT" && player.connected` → **return**.
    - Proposed behavior:
      - Replace that early return with a **hook** back into the Dealer to schedule a turn timeout:
        - For **connected humans**, call a new dependency: `scheduleHumanTurnTimeout(userId)`.
        - For bots and disconnected humans, keep existing logic unchanged.

- In `Dealer` (low-churn reuse of queue infra):
  - Add a private method `scheduleHumanTurnTimeout(userId: string): void` that:
    - Uses the existing **turn-token + actionQueue** mechanism (as used by `enqueueInternalAction`) to ensure:
      - The timeout is cancelled automatically if the turn moves on (different `handId`, `handActionSeq`, `toActSeat`, or actor).
    - After `TURN_TIMEOUT_TOTAL_MS`, if the token is still valid and the player still needs action:
      - Calls `setPlayerSittingOutInternal(userId, true)` **without** enqueueing an auto-check/fold.

This:

- Reuses **existing**:
  - `captureTurnToken`,
  - stale token checks,
  - `getQueuedAutoActionIneligibleReason`-style reasoning (can be mirrored),
  - serialized mutation via `actionQueue`.
- Avoids new timers or external schedulers; it’s just a new queued operation with a delay.

**Edge cases:**

- If the player acts within 40s:
  - `handActionSeq` changes, or `toActSeat` moves.
  - The queued timeout sees a stale token and is discarded.
- If the player disconnects during the countdown:
  - Disconnection logic continues to queue **auto-check/fold** as today.
  - The timeout still fires eventually; when it does, it transitions them into the **sitting-out** seat state, which is consistent with “this player is no longer actively participating”.

#### 2. Client-Side Countdown (No Protocol Changes)

To avoid contract churn, the visual countdown uses **local timing**, anchored to server time:

- Inputs available today:
  - `snapshot.serverTimeTs` – authoritative server clock at snapshot time.
  - `buildTableSceneModel` gives `isMyTurn` and `heroStatus`.

**New client behavior (hook/utility):**

- When `isMyTurn` flips from **false → true** for the hero:
  - Compute a **local** `turnStartServerTs` from the latest snapshot.
  - Use constant thresholds:
    - `TURN_TIMEOUT_BASE_MS = 30_000`,
    - `TURN_TIMEOUT_COUNTDOWN_MS = 10_000`.
  - Local timer (e.g. `setInterval` in a small hook) computes:
    - `elapsedMs = nowLocal - (snapshot.serverTimeTs + networkOffsetEstimate)` (approx; can be simplified to a client-local timer started at receipt time if we’re comfortable with minor drift).
    - When `elapsedMs >= TURN_TIMEOUT_BASE_MS`, show UI **countdown**:
      - `remainingMs = max(0, TURN_TIMEOUT_BASE_MS + TURN_TIMEOUT_COUNTDOWN_MS - elapsedMs)`.
      - Render `Math.ceil(remainingMs / 1000)` as the countdown.
- When `isMyTurn` flips away (player acted or street advanced):
  - Reset countdown state and hide the timer.

This gives:

- Minimal code changes:
  - No new snapshot fields, no schema updates.
  - Purely a new client hook (consumed by `ActiveTableView`) driven by existing `TableSceneModel`.
- Acceptable behavior:
  - Countdown is approximate but **close** to server enforcement.
  - Small drift is acceptable because the server is the source of truth; the UI is advisory.

#### 3. Sitting-Out Lifecycle & Removal Controls

We standardize policies in one place:

- **Entering sitting-out via timeout**:
  - Same path as **manual sit-out**: `setPlayerSittingOutInternal(userId, true)`.
  - Guarantees:
    - Seat is marked `ABANDONED` (if stack > 0),
    - `sittingOutUntilNextHand = true`,
    - Not eligible to act in the current hand or be dealt into the next until explicitly changed.

- **Staying sitting out**:
  - The timeout path **does not** alter TTL semantics.
  - Existing sweeps continue to apply (abandoned purge, seat TTL, cashouts).

- **Leaving sitting-out**:
  - **Player**: manual sit-back-in (existing `SET_SITTING_OUT false`).
  - **Table creator / admin**: `kickUserByAdmin` or `Dealer.removePlayer`:
    - These already:
      - Force-fold when necessary,
      - Remove the seat,
      - Cash out remaining stack.

This reuses all existing leave/kick/economy flows; the timeout logic only changes **how** we mark a seat as sitting out.

---

### Summary of Changes (Conceptual)

- **No new game rules**: Poker rules are unchanged; only the **time a human has to act** is constrained.
- **Server**:
  - Add configurable `TURN_TIMEOUT_*` constants.
  - Extend the existing `TurnAutomationService` + Dealer automation hook to:
    - Schedule **auto sit-out** for connected humans after 40s of inactivity on their turn.
    - Use existing queued-auto-action infrastructure and turn tokens to avoid race conditions.
- **Client**:
  - Add a small hook to:
    - Detect hero “my turn” transitions.
    - Show a **10s countdown** starting at 30s into the turn, without changing the network contract.
- **Sitting out**:
  - Clearly define sitting-out as:
    - `ABANDONED`/`OUT` or `sittingOutUntilNextHand` + `WAITING`.
  - Treat timeout-based sit-out as another **entry path** into the same unified state.
  - Preserve the ability for a player to **sit out indefinitely** until:
    - They sit back in,
    - Admin/table creator removes them,
    - TTL sweeps purge abandoned seats according to existing policies.

