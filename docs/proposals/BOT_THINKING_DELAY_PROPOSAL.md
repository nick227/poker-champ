# Bot Thinking Delay and Turn-Indication Proposal

## Purpose

- Add a **configurable 0.5–3 s delay** during a bot’s turn to simulate “thinking,” without changing game logic.
- Make the **active (current-to-act) opponent row** clearly visible (e.g. green border) so players see whose turn it is.

This document reviews current game flow, where delay and visual already exist, and proposes the safest, most natural places to apply a configurable delay and to reinforce the turn indication.

---

## 1. Current State

### 1.1 Delay

- **Location:** Server only.
- **Constant:** `src/engine/dealer/timing.ts` → `BOT_ACTION_DELAY_MS = 800`.
- **Usage:** `TurnAutomationService.maybeActForBot()` calls `enqueueAction(toActId, payload, BOT_ACTION_DELAY_MS)`.
- **Mechanics:** `Dealer.enqueueInternalAction(userId, payload, delayMs)` chains onto `actionQueue`, waits `delayMs`, then applies the action (with stale-turn and reconnect checks). So:
  - Snapshot is sent **immediately** when it becomes the bot’s turn (clients see “bot to act”).
  - Bot action is **applied** only after the delay.
  - Clients therefore show “bot’s turn” for the full delay (currently 800 ms) with no client-side logic.

So the **delay is already in the right place**: server-side, between “snapshot: bot to act” and “apply bot action and send next snapshot.”

### 1.2 Turn indication (opponent row)

- **Data:** Snapshot includes `hand.toActSeat`; each seat has `isToAct: state.toActSeat === seat`. Adapter maps that to `Opponent.isActive`.
- **UI:** `OpponentStrip` uses `o.isActive` for:
  - `className`: `o.isActive ? "bg-brand-soft/15" : "bg-panel"`.
  - `style`: `s.rowShellActive` when `o.isActive`.
- **Style:** `opponentStrip.styles.ts` → `rowShellActive`: `borderColor: ACTIVE_TILE_BORDER`, shadow, elevation. `tableColors.ts` → `ACTIVE_TILE_BORDER = "hsl(158, 52%, 42%)"` (green).

So the **active opponent row already has a green border and background** when it’s that opponent’s turn. The missing piece is only to **treat this explicitly as “turn” indication** and optionally make it stronger (e.g. border width, or 0.5–3 s delay so the highlight is visible longer).

---

## 2. Game Flow (Where Delay and Visual Fit)

High level:

1. **Action applied** (human or bot) → `applyActionResult(TURN_ADVANCED)`.
2. **Snapshot sent** → `sendTableSnapshotToAll(reason, actionId)` with updated `hand.toActSeat`.
3. **maybeActForBot()** → If toAct is a bot, **enqueueAction(userId, payload, BOT_ACTION_DELAY_MS)** (no snapshot yet).
4. **Client** receives snapshot → `mapSeatsToOpponents` + hero-relative ordering → `OpponentStrip` renders; the opponent whose `seat === toActSeat` has `isActive === true` → **green border / active style**.
5. **After delay** → Server runs queued bot action → `applyActionResult` → new snapshot (toAct moved or hand advanced).

So:

- **Delay:** Only on the server, inside the existing queue: wait N ms, then apply bot action. No change to when snapshots are sent; no client-side delay.
- **Visual:** Purely from current snapshot: `toActSeat` → `seat.isToAct` → `Opponent.isActive` → existing active style. No new “turn” concept; we just clarify that “active row = current to-act” and optionally strengthen the style.

---

## 3. Safety: Avoiding \"Ghost Bot Actions\"

### 3.1 Current execution-time guards

The high-risk failure mode with a longer delay window is a **stale queued bot action** firing after:

- The hand ended
- The turn advanced to a different seat
- The acting seat/user changed for any other reason

Dealer already defends against this at **execution time**, not just enqueue time:

- `enqueueInternalAction(...)` captures a **turn token** via `captureTurnToken(userId)` with:
  - `handId`
  - `street`
  - `handActionSeq`
  - `toActSeat`
  - `toActUserId`
  - `actorSeat`
- When the queued function wakes up after `delayMs`, it calls `getQueuedTurnTokenStaleReason(token)` and immediately discards the auto action if **any** of these changed:
  - `this.state.handId !== token.handId`
  - `this.state.street !== token.street`
  - `this.state.handActionSeq !== token.handActionSeq`
  - `this.state.toActSeat !== token.toActSeat`
  - `currentToActUserId !== token.toActUserId`
- It then checks `getQueuedAutoActionIneligibleReason(userId)` so an action is also discarded if the actor is no longer eligible (e.g. not in hand, not to act).

In other words: a queued bot action is **hand/street/turn-sequence/seat-locked**. If the hand progresses, the turn moves, or the to-act occupant changes before the delay elapses, the action is dropped with a diagnostic and never applied.

This makes a 0.5–3 s delay **safe** from the “ghost bot action” perspective; the action is always revalidated against current state at execution time.

### 3.2 Optional additional hardening (future)

If we ever want an even clearer invariant, we could:

- Expose a derived `turnId` (e.g. from `handId + street + handActionSeq + toActSeat`) into the snapshot for debugging/analytics only.
- Keep the existing server-side token checks as the **single source of truth** for discard decisions.

Given the existing `captureTurnToken` + `getQueuedTurnTokenStaleReason` implementation, no extra engine field is strictly required for safety; the current token already acts as a robust turn identifier.

---

## 4. Proposed Changes

### 3.1 Delay: 0.5–3 s configurable

**Goal:** 500–3000 ms (inclusive), so the “bot thinking” moment is visible and feels natural, without feeling slow.

**Options:**

| Option | Where | Pros | Cons |
|--------|--------|------|------|
| **A. Single constant (min–max)** | `timing.ts`: e.g. `BOT_ACTION_DELAY_MIN_MS = 500`, `BOT_ACTION_DELAY_MAX_MS = 3000` | Simple, one place | Fixed for all tables |
| **B. Random in range per turn** | `TurnAutomationService`: pick random in `[MIN, MAX]` each time | Feels more natural | Slightly more code |
| **C. Table or room config** | Table/room config passed into Dealer / TurnAutomationService | Per-table tuning, A/B tests | More wiring and config surface |

**Recommendation:** Start with **B (random in [500, 3000] ms per bot turn)** in `TurnAutomationService`, using constants from `timing.ts` so the range is easy to tune. Add C later if product needs per-table or per-room delay.

**Exact place:** Keep passing `delayMs` into `enqueueAction`. In `TurnAutomationService.maybeActForBot()`, instead of `BOT_ACTION_DELAY_MS`, compute e.g.:

```ts
const delayMs = BOT_ACTION_DELAY_MIN_MS + Math.floor(Math.random() * (BOT_ACTION_DELAY_MAX_MS - BOT_ACTION_DELAY_MIN_MS + 1));
this.deps.enqueueAction(toActId, payload, delayMs);
```

**Do not:**

- Add delay on the client (e.g. “hold” or hide the next snapshot). That would duplicate state and complicate sync.
- Delay the **sending** of the “bot to act” snapshot. Send it immediately so the client can show the active row right away; only the **application** of the bot action is delayed.

**Disconnected humans:** They already use `enqueueAction(toActId, payload)` with **no** delay. Leave that as-is so only bots get the thinking delay.

### 3.2 Visual: Active opponent row = “current turn”

**Goal:** Clearly indicate “this row is the player whose turn it is,” and keep it consistent with hero’s turn (HeroZone already has `isActiveTurn` and an active style).

**Current:** The row with `o.isActive === true` already gets:

- `borderColor: ACTIVE_TILE_BORDER` (green)
- `bg-brand-soft/15`
- Shadow and elevation

So the **semantic** is already “this is the to-act opponent.” We only need to:

1. **Document** that `Opponent.isActive` means “this opponent is the current to-act” (not just “in hand”).
2. **Optionally** make the turn state a bit more obvious:
   - Slightly thicker border (e.g. 2px) when active, or
   - Reuse or mirror the same design token used for hero’s `isActiveTurn` (e.g. same green or same border width) so “turn” looks consistent between hero and opponents.

**Recommendation:**

- In code/comments: state that `isActive` on an opponent means “current to-act.”
- In styles: either keep current `rowShellActive` or add one small tweak (e.g. `borderWidth: 2` when active) and use the same green token as today. No new “turn” vs “active” distinction; the single “active = to-act” meaning is enough.
- No client-side “turn” timer or extra state: the snapshot is the source of truth; when the next snapshot arrives, the next player is active.

**Edge cases:**

- **Hero’s turn:** HeroZone already shows `isActiveTurn`; opponent rows all have `isActive === false`. No change.
- **Bot’s turn:** One opponent has `isActive === true` for the duration of the server delay (0.5–3 s), then the next snapshot updates who is active. No change to data flow; only delay length and optional style tweak.

---

## 5. Where to Apply (Summary)

| Concern | Current | Safest / most natural place |
|--------|---------|-----------------------------|
| **Bot thinking delay (0.5–3 s)** | 800 ms fixed in `timing.ts`, used in `TurnAutomationService` | **Keep delay on server.** Use a 500–3000 ms range (random per turn) in `TurnAutomationService`, constants in `timing.ts`. No client delay. |
| **Active opponent row (green border)** | `Opponent.isActive` + `rowShellActive` + `ACTIVE_TILE_BORDER` | **Keep in OpponentStrip.** Treat `isActive` as “current to-act”; optionally strengthen `rowShellActive` (e.g. border width). No new state or timers. |

---

## 6. Implementation Checklist

- [ ] **timing.ts:** Add `BOT_ACTION_DELAY_MIN_MS = 500`, `BOT_ACTION_DELAY_MAX_MS = 3000`; keep or deprecate `BOT_ACTION_DELAY_MS` (if deprecated, use min/max only).
- [ ] **TurnAutomationService:** For bot turns, compute delay in `[MIN, MAX]` (e.g. random) and pass to `enqueueAction(toActId, payload, delayMs)`. Disconnected-human path stays `enqueueAction(..., no delay)`.
- [ ] **OpponentStrip / styles:** Document that active row = to-act; optionally bump border width or align with hero’s active style.
- [ ] **Tests:** Existing `dealer.auto-action-queue-race.test.ts` uses 800 ms; update to use the new range or (preferably) inject a delay provider so tests can use a deterministic small delay instead of randomness.

---

## 7. Testability and Delay Injection

Random delays in CI without control will eventually create **flaky tests**. To avoid this:

- Introduce a small interface (conceptually):
  - `getBotDelayMs(): number`
- In production:
  - Implementation returns a random value in `[BOT_ACTION_DELAY_MIN_MS, BOT_ACTION_DELAY_MAX_MS]`.
- In tests:
  - Implementation returns a fixed small value (e.g. `10`), or can be overridden per test.

This keeps the engine behavior realistic in production while making bot timing deterministic under test, and avoids wiring test-only flags through game logic.

---

## 8. References

- `src/engine/dealer/timing.ts` — current `BOT_ACTION_DELAY_MS`
- `src/engine/dealer/services/TurnAutomationService.ts` — `maybeActForBot()`, `enqueueAction(..., BOT_ACTION_DELAY_MS)`
- `src/engine/Dealer.ts` — `enqueueInternalAction`, `applyActionResult`, `maybeActForBot()`
- `apps/client/.../table.adapter.ts` — `Opponent.isActive` from `seat.isToAct`
- `apps/client/.../OpponentStrip.tsx` — `o.isActive` → `rowShellActive`, `bg-brand-soft/15`
- `apps/client/.../opponentStrip.styles.ts` — `rowShellActive`
- `apps/client/.../constants/style/tableColors.ts` — `ACTIVE_TILE_BORDER`
