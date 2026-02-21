# Rebuy Option Summary

## When it’s shown

The rebuy option is available when **all** of these are true:

- Hero is seated (`youAreSeated`).
- Hero stack is **zero**.
- Table has valid `minBuyInCents` and `maxBuyInCents` (both present and &gt; 0).

The rebuy sheet is hidden when there is an active hand in progress **and** we close it automatically when the table has no snapshot or an active hand (so it doesn’t stay open across state changes).

## Where it appears

1. **Idle (no active hand)**  
   In `EmptyTableView`: a **Rebuy** button is shown in the bottom area of the table scene. Tapping it opens the rebuy modal.

2. **Active hand, hero sitting out with zero stack**  
   In `TableLayout`: the bottom area shows a **Rebuy** button instead of the normal action bar when `canRebuy && !canAct`. Tapping it opens the same rebuy modal.

In both cases the table page passes `canRebuy` and `onPressRebuy`; the modal is rendered at the table page level.

## What it does

- Tapping **Rebuy** sets `rebuySheetVisible` and opens **ChooseTableModal** with title “Rebuy”.
- The modal is fed: current `balanceCents`, table `minBuyInCents`, and `maxBuyInCents` (capped by balance).
- On **Apply**, the table page calls `handleRebuyApply(buyInCents)`:
  - Calls `post.buyIn({ tableId, amountCents: buyInCents })`.
  - Refreshes bankroll and shows “Chips added to table” on success, or an error toast on failure.
- The modal is then closed.

So rebuy is “add chips to your current seat” via the existing buy-in API, with the same limits and UI as join buy-in.
