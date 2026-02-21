# Create Game Options — Proposal

## Current state

### Create Game modal (`CreateGameModal.tsx`)
- **Table Name** — free text
- **Game Speed** — chips: "Fast" | "Normal" (used for play timers; we are removing)
- **Visibility** — chips: "Public" | "Private" (password when Private)
- **Num Players** — chips: 3 | 6

Blinds and buy-in are **not** in the modal. The client sends defaults from `lobby.post.ts`:
- `smallBlindCents: 100`, `bigBlindCents: 200`
- `minBuyInCents: 2000`, `maxBuyInCents: 20000`

### Backend
- **CreateTableSchema** (realtime-contract): already has `smallBlindCents`, `bigBlindCents`, `minBuyInCents`, `maxBuyInCents`, and `speed`. Validation: `bigBlindCents >= smallBlindCents`, `maxBuyInCents >= minBuyInCents`.
- **TableManager.buildTableConfig** and **LobbyRouter** accept and pass these through. **PokerRoom** and **LobbyRoom** store and expose them.
- **GET /tables** returns `smallBlindCents`, `bigBlindCents`, `minBuyInCents`, `maxBuyInCents` (and `speed`) in table metadata.

### Lobby table row (`GameTableRow.tsx`)
- Shows: **name**, **players/seats**, **stakes** (blinds string).
- Blinds come from `lobbyTables.normalizeTable`: `blinds = sb != null && bb != null ? \`${sb}/${bb}\` : undefined` — raw cents, e.g. `"100/200"`. No formatted currency, no min buy-in.
- **Join** is always enabled; no check against user balance.

### Join flow
- User clicks **Join** → **ChooseTableModal** opens with table `minBuyInCents` / `maxBuyInCents` and user balance. User picks buy-in and applies. No upfront gating: users with balance &lt; min can still click Join and only see the modal.

---

## Proposed changes

### 1. Remove speed from Create Game (no play timers)
- **UI:** Remove "Game Speed" from `CreateGameModal` (state, chips, and from `onSubmit` payload).
- **Client API:** Keep sending a single default in `postCreateTable` (e.g. `speed: "normal"`) so the backend contract stays satisfied, or make `speed` optional in the schema and stop sending it once backend supports that.
- **Backend (optional for later):** Make `speed` optional in `CreateTableSchema` and in room config; default to `"normal"` where still required. No behavior change if we never use timers.

### 2. Add Blinds and Minimum buy-in to Create Game (dropdowns)

**Blinds (single dropdown — SB/BB pairs)**  
One dropdown: "Stakes" or "Blinds". Each option is a (smallBlindCents, bigBlindCents) pair.  
`maxBuyInCents` is derived automatically from blinds as `bigBlindCents * 100` (100 BB cap) and sent by the client. No Max buy-in dropdown in MVP.

Suggested options (cents), human-friendly labels:

| Label (example) | smallBlindCents | bigBlindCents |
|-----------------|-----------------|---------------|
| $0.10 / $0.20   | 10              | 20            |
| $0.25 / $0.50   | 25              | 50            |
| $0.50 / $1      | 50              | 100           |
| $1 / $2         | 100             | 200           |
| $2 / $5         | 200             | 500           |
| $5 / $10        | 500             | 1000          |
| $10 / $25       | 1000            | 2500          |
| $25 / $50       | 2500            | 5000          |

Default: e.g. $1 / $2 (100/200).  
When blinds change, recompute: `maxBuyInCents = bigBlindCents * 100`. Default min buy-in = first valid option ≥ 20 BB.

**Minimum buy-in (dropdown)**  
Options as fixed amounts in cents, with labels:

| Label   | minBuyInCents |
|--------|----------------|
| $5     | 500            |
| $10    | 1000           |
| $20    | 2000           |
| $50    | 5000           |
| $100   | 10000          |
| $200   | 20000          |
| $500   | 50000          |
| $1000  | 100000         |

Only show min buy-in options where `minBuyInCents >= bigBlindCents * 20` (20 BB minimum). This is a client-side guardrail only.

### 3. Show limits on table rows
- **Blinds:** Keep showing stakes but format as currency (e.g. `formatCents(sb) / formatCents(bb)` → "$1.00 / $2.00") instead of raw "100/200". Reuse `formatCents` from `@/lib/format`.
- **Min buy-in:** Add to the row subtitle, e.g. `Min buy-in: $20` so users see the requirement before clicking Join.

Example row line:  
`2/6 • $1.00 / $2.00 • Min $20`  
(or two lines if layout prefers)

Data: `LobbyTableRow` already has `minBuyInCents`; ensure `normalizeTable` keeps populating it from API (already does). No backend change.

### 4. Gate Join by minimum buy-in
- **Condition:** Disable the **Join** button when `balanceCents < table.minBuyInCents` (UI hint only; server still enforces).
- **UX:** Show Join as disabled and optionally a short hint: "Min buy-in $20" or "Insufficient balance" (e.g. muted text under the button or tooltip).
- **Data:** Lobby has `bankroll` (e.g. from `useBankroll()`). Pass `balanceCents` (or equivalent) and `table.minBuyInCents` into `GameTableRow` so it can compute `canJoin = balanceCents >= table.minBuyInCents` and disable the button when `!canJoin`.
- **ChooseTableModal:** Only opened when user can join (Join enabled). No change to modal logic beyond current min/max; server already enforces min buy-in at join/buy-in.

---

## Implementation checklist

| Area | Change |
|------|--------|
| **CreateGameModal** | Remove speed. Add Blinds dropdown (SB/BB pairs). Add Min buy-in dropdown. Pass `smallBlindCents`, `bigBlindCents`, `minBuyInCents` (and chosen or derived `maxBuyInCents`) in `onSubmit`. |
| **lobby.post.ts** | Accept `smallBlindCents`, `bigBlindCents`, `minBuyInCents` (and optionally `maxBuyInCents`) from modal; remove or keep `speed` as default only. |
| **service.registry** | `joinTable` input: keep or add blinds/buy-in as needed; ensure no `any` if types are tightened. |
| **GameTableRow** | Accept `balanceCents`. Format blinds with `formatCents`. Show min buy-in (e.g. `Min $X`). `canJoin = balanceCents >= table.minBuyInCents`. Disable Join when `!canJoin`; optional hint. |
| **lobby.tsx** | Pass `balanceCents` (from `useBankroll().cents`) into each `GameTableRow`. |
| **Backend (optional)** | Make `speed` optional in CreateTableSchema; default in PokerRoom/LobbyRoom where still read. |
| **realtime-contract** | If we drop speed from client, make `speed` optional in CreateTableSchema and default to `"normal"`. |

---

## File touch list (summary)

- `apps/client/src/components/domain/lobby/CreateGameModal.tsx` — remove speed; add blinds + min buy-in dropdowns; submit new fields.
- `apps/client/src/services/post/lobby.post.ts` — take blinds and min buy-in from input; optional speed default.
- `apps/client/src/components/domain/lobby/GameTableRow.tsx` — formatted blinds; min buy-in label; `balanceCents` prop; disable Join when balance &lt; minBuyInCents.
- `apps/client/app/lobby.tsx` — pass `balanceCents` to `GameTableRow`.
- `apps/client/src/lib/lobbyTables.ts` — optional: add a `blindsFormatted` or keep using `blinds` and format in the row (recommend format in row with existing `minBuyInCents`).
- `packages/realtime-contract/src/lobby.ts` — optional: `speed` optional, default `"normal"`.
- Backend types/schemas (TableManager, LobbyRouter, PokerRoom, openapi) — already support blinds and min/max buy-in; only adjust if we make `speed` optional.

---

## Dropdown value sets (reference)

**Blinds (SB/BB in cents):**  
`[10,20], [25,50], [50,100], [100,200], [200,500], [500,1000], [1000,2500], [2500,5000]`

**Min buy-in (cents):**  
`500, 1000, 2000, 5000, 10000, 20000, 50000, 100000`  
Labels: $5, $10, $20, $50, $100, $200, $500, $1000

These can live in a small constants file (e.g. `createGame.constants.ts`) and be reused for labels and API payloads.

---

**Summary.** Two deterministic client rules: `maxBuyIn = BB × 100`, `minBuyIn ≥ BB × 20`. Everything else in this proposal stays the same. MVP stays simple, consistent, and poker-realistic.
