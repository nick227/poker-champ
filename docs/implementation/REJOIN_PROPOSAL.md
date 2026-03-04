# Rejoin After Sitting Out — Proposal

Minimal-churn proposal for how a player can rejoin the table after sitting out (timeout, disconnect, or manual sit-out), with a clear **Rejoin** button and predictable semantics.

---

## Current Flow (As-Is)

### How a player ends up sitting out

1. **Manual**: Client sends `SET_SITTING_OUT { sittingOut: true }` → `Dealer.setPlayerSittingOutInternal(userId, true)` → `status = "ABANDONED"`, `sittingOutUntilNextHand = true`, stack preserved.
2. **Disconnect**: `markDisconnected` → deadline → `markAbandoned` → same logical state (ABANDONED, sitting out).
3. **Auto-action cap**: Disconnected human exceeds per-hand auto-action cap → promoted to ABANDONED, sitting out.
4. **Turn timeout (when implemented)**: Connected human fails to act in time → same path as manual sit-out.

### How rejoin works today (server)

- **Single message**: Client sends `SET_SITTING_OUT { sittingOut: false }`.
- **Dealer** (`setPlayerSittingOutInternal(userId, false)`):
  - Clears `sittingOutUntilNextHand` and `disconnectDeadlineTs`.
  - If `stackCents <= 0` → `status = "OUT"`, snapshot, return (no rejoin).
  - If `street === "WAITING"`:
    - Sets `status = "ACTIVE"`, emits snapshot, and may auto-start the next hand if ≥2 non-out players.
  - If **mid-hand**:
    - Does **not** put the player into the current hand (no cards, no toAct).
    - Sets `status = "ABANDONED"` if they were OUT (keeps them out of current hand).
    - Emits snapshot; player is **eligible for the next hand** (flag cleared, so next `startHand` will include them).

So semantically: **rejoin = “sit back in”; if mid-hand, they are not in the current hand and are picked up in the next hand.** No “folded in current hand” on the server — they simply aren’t in the hand.

### How rejoin is exposed today (client)

- **Controller**: `toggleHeroSittingOut()` sends `SET_SITTING_OUT { sittingOut: !heroIsSittingOut }` via `dispatchSetSittingOut`.
- **Wiring**: `TableSceneRouter` passes `onToggleSittingOut={actions.toggleHeroSittingOut}` into `ActiveTableView` → `HeroZone`.
- **Gap**: There is **no visible Rejoin control**. `HeroZone` receives `onToggleSittingOut` and computes `sitOutDisabled` but does not render a “Rejoin” or “Sit back in” button. When hero is sitting out, the bottom area shows the generic “waiting/thinking” notification, not a rejoin CTA.

---

## Potential Issues

1. **No visible Rejoin**
   - Users may not know they can sit back in. A dedicated **Rejoin** button when `heroStatus === "SITTING_OUT"` and `stackCents > 0` fixes this with minimal churn (reuse existing message).

2. **RECONNECTING vs SITTING_OUT**
   - While disconnected within the reconnection window, hero shows as **RECONNECTING**; after deadline (or explicit abandon), **SITTING_OUT**. Rejoin is only relevant when they are SITTING_OUT (and connected again). No change needed for RECONNECTING (they’re not yet “sitting out” in the same sense).

3. **Zero stack**
   - If `stackCents <= 0`, server leaves them `OUT` and does not allow sit-back-in. Client should not show Rejoin when `stackCents <= 0` (already implied by “rejoin only when sitting out with stack”).

4. **Mid-hand rejoin semantics**
   - Server does not add the player to the current hand as “folded”; they are simply not in the hand. So “rejoin as folded” in the doc means: **for the rest of the current hand they do not act (and have no cards); next hand they are dealt in.** No server change required for this behavior.

5. **Persistence**
   - If persistent seats are enabled, sitting-out state is mirrored (e.g. `SEATED_SITTING_OUT`). Sitting back in is in-memory only unless persistence has a “clear sitting out” update; that’s out of scope for this minimal proposal. Rejoin remains correct for the in-memory game.

6. **Double-click / rapid rejoin**
   - Sending `SET_SITTING_OUT { sittingOut: false }` twice is idempotent; server already has the right state. Optional: disable button or show loading until next snapshot to avoid duplicate sends. Minimal approach: allow double-send; server is source of truth.

---

## Proposed Implementation (Minimal Churn)

### 1. Client: Rejoin button

- **When**: Hero is seated, `heroStatus === "SITTING_OUT"`, `heroStackCents > 0`, and `onToggleSittingOut` is provided (live table).
- **Where**: In the table view’s **bottom** section (same area as ActionBar / rebuy / notification). When these conditions hold, render a dedicated block:
  - Short line of copy, e.g. “You’re sitting out. You’ll be in the next hand when you rejoin.”
  - **Rejoin** button that calls `onToggleSittingOut()` (same as existing sit-back-in: sends `SET_SITTING_OUT { sittingOut: false }`).
- **Copy**: Use existing `TABLE.rejoin` for the button label.
- **No new messages or server changes.**

### 2. Server

- **No change.** Existing `SET_SITTING_OUT` and `setPlayerSittingOutInternal(userId, false)` already implement “rejoin; if mid-hand, eligible next hand”.

### 3. Optional polish

- **HeroZone**: Could also show a small “Rejoin” link/button near the hero when sitting out (e.g. under the status label). Not required for MVP; the bottom Rejoin button is the primary CTA.
- **Loading state**: Optionally set a short “pending rejoin” state and disable the button until the next snapshot to avoid duplicate sends. Defer if we want to keep the first iteration minimal.

---

## Summary

| Item                         | Action |
|------------------------------|--------|
| Rejoin semantics             | Already correct: `SET_SITTING_OUT false` → eligible next hand; mid-hand they are not in the current hand. |
| Rejoin button (bottom)       | Add in `ActiveTableView` when sitting out + stack > 0; call existing `onToggleSittingOut`. |
| Copy                         | Use `TABLE.rejoin` for button. |
| Server / protocol            | No change. |
| “As folded”                  | Interpreted as “not in current hand; in next hand” — no server “add as folded” needed. |

This gives a clear rejoin path with minimal churn and no new contracts or server logic.
