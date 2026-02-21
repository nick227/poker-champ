# Server log analysis: unexpected game end

## Log summary

- **Table:** `table_JXmvBT-SNc`, **Hand:** `hand_PnWkERr_eJ`
- **Events:** Bot (seat 1) CALL in PREFLOP → SHOWDOWN_PAYOUT (bot wins 400¢) → cash-out for human `46c35edb-...` (19400¢) → "player left" → "bot left"

## What the logs show

1. **PREFLOP showdown is correct**  
   Only one non-folded player remained when the bot called: `countNotFoldedPlayers <= 1` → hand finishes without a flop (`HAND_FINISHED` → `finishHandByLastStanding`). So the other player (human) had already folded (or been force-folded) before the bot’s call.

2. **"cash-out processed" then "player left"**  
   That order matches **releasePendingSeats** → **removePlayer(userId)** with default options (no `cashOutAfterRemoval`). So the human was in **pendingSeatReleaseUserIds** (abandoned) and was removed when the hand ended, not by an explicit "Leave" click.

3. **"bot left" right after**  
   `maybeRemoveBotsIfNoHumans()` runs when the room sees **humanCount === 0**. So after the human was removed by `releasePendingSeats`, something (e.g. the same client’s `onLeave` when the tab closed) ran room cleanup and removed the bot.

## Reconstructed timeline

1. **Human disconnected** (e.g. network blip, closed tab, sleep).
2. **Reconnect window (60s) expired** → `markAbandoned(userId)`:
   - If human was in the hand and ACTIVE → **force-fold**.
   - Human added to **pendingSeatReleaseUserIds** (seat released after hand ends).
3. **Hand continued** with only the bot left to act; bot called → hand ended, bot won 400¢.
4. **Hand end** ran `RELEASE_PENDING_SEATS` → **removePlayer(human)**:
   - Cash out 19400¢ → "cash-out processed".
   - Remove from table → "player left".
5. **Room cleanup** (e.g. same client’s leave/close) → **maybeRemoveBotsIfNoHumans()** → "bot left".

So the game ended because:

- The human was **abandoned** (disconnect + no reconnect in time).
- They were **force-folded** (if they were still in the hand).
- When the hand ended, **pending seat release** ran and **removed** them (cash-out + "player left").
- Then the room removed the bot when it saw no humans left.

## Why it felt "unexpected"

- From the **server’s** perspective: disconnect → abandon → force-fold (if in hand) → hand ends → release pending seat → remove player → remove bots. All by design.
- From the **user’s** perspective: they may have thought they were only briefly disconnected and expected to still be in the hand or at the table, but:
  - After 60s they were marked abandoned and (if in hand) force-folded.
  - When the hand ended they were removed and cashed out.
  - So the "game ended" and "you left" experience can feel sudden if they didn’t realize they’d been disconnected long enough to be abandoned.

## No bug found

- PREFLOP showdown is correct (one player left after the other folded).
- Cash-out and "player left" order match `removePlayer` without `cashOutAfterRemoval` (pending seat release path).
- "bot left" matches `maybeRemoveBotsIfNoHumans()` after human count went to 0.

## Optional improvements (product/UX)

- **Reconnect UI:** Make it very clear that the user is in a 60s reconnect window and that after that they will be sat out / folded and then removed when the hand ends.
- **Post-disconnect feedback:** After reconnect expiry, consider a clear message that they were removed due to disconnect (and optionally that their stack was cashed out).
- **Logging:** Add a short log line when releasing a pending seat (e.g. `reason: "ABANDON_RECONNECT_EXPIRED"`) so future logs make this path obvious.
