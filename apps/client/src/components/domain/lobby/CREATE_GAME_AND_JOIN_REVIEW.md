# Create Game & Join Button — Narrow Review

## Create Game flow

**CreateGameModal**
- Blinds and min buy-in are driven from `createGame.constants`: 8 blinds options, 8 min buy-in options, 20 BB min filter, 100 BB max.
- **Stale min when blinds change:** Changing blinds calls `handleBlindsChange`, which `setMinBuyInCents(getDefaultMinBuyInCents(bb))`, so min buy-in is always reset to the first valid option ≥ 20 BB. Correct.
- **effectiveMinBuyInCents:** If the user had a valid min selected and then the list of valid options changed (only possible if we changed constants), we fall back to `defaultMinCents` so we never submit below 20 BB. Correct.
- **Private table:** Password only sent when `visibility === "PRIVATE"`; `lobby.post` only sends `password` in that case. Matches backend expectations.
- **Unused import:** `MIN_BUYIN_OPTIONS` was imported in the modal but not used; removed.

**createGame.constants**
- `getValidMinBuyInOptions(bigBlindCents)` returns options with `20 BB <= minBuyInCents <= 100 BB` (max buy-in). Prevents submitting min > max.
- `getDefaultMinBuyInCents` falls back to `bigBlindCents * MIN_BB` when there are no options (future-proof).

**lobby.post.ts**
- Takes required `smallBlindCents`, `bigBlindCents`, `minBuyInCents`, `maxBuyInCents` from the modal; sends `speed: "normal"` for the backend. No derivation here (modal sends derived max). Correct.

**Lobby screen**
- `handleCreateGame` uses `Parameters<typeof postCreateTable>[0]`; modal now submits `CreateGameConfig`, which matches that shape. Types align.

---

## Join button & gating

**GameTableRow**
- `canJoin = balanceCents >= table.minBuyInCents`. Join is disabled when `!canJoin`. Hint text: "Insufficient balance for min buy-in" when disabled.
- Blinds and min use `formatCents(table.smallBlindCents)`, `formatCents(table.bigBlindCents)`, `formatCents(table.minBuyInCents)`. Row always has `smallBlindCents`/`bigBlindCents` from `normalizeTable` (defaults 100/200 if API omits them). Correct.
- **Disabled behavior:** `ConfirmButton` receives `disabled={!canJoin}`; the press handler is not called when disabled. No need to guard inside `onJoin` for normal use. Optional hardening: lobby could pass `onJoin={canJoin ? () => setChooseTableModal(...) : () => {}}` or check `bankroll >= t.minBuyInCents` inside the handler so the modal never opens if balance is below min (defense in depth). Not required for correctness.

**Lobby**
- `balanceCents={bankroll}` from `useBankroll().cents` is passed to every row. If bankroll is still loading (e.g. 0), all rows show Join disabled until balance loads; then Join enables where balance ≥ min. Correct.
- `ChooseTableModal` receives `minBuyInCents` and `maxBuyInCents` from the chosen table; it is only opened when the user clicks Join on a row where Join is enabled, so we only open when balance ≥ min. Modal’s min/max and server enforcement unchanged.

---

## Summary

| Area | Status |
|------|--------|
| Create game: blinds + min buy-in + 100 BB max | OK |
| Create game: 20 BB min filter for options | OK |
| Create game: min reset when blinds change | OK |
| Post payload and types | OK |
| Row: formatted blinds + min, canJoin, disabled Join | OK |
| Row: hint when cannot join | OK |
| Lobby: bankroll passed, modal only when Join clicked (enabled) | OK |
| Unused import in CreateGameModal | Fixed |

No blocking issues. Optional: add a second guard in the lobby so the join modal never opens when `bankroll < table.minBuyInCents` (e.g. if disabled state were ever bypassed).
