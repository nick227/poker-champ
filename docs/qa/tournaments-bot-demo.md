# Bot-filled tournament demo — QA flow

QA path for **M11/M12**: one human plus catalog bots, human-only prize pool and payouts.

## Prerequisites

- Admin account (`role: ADMIN`)
- One player account with bankroll ≥ entry fee
- Tournament director running (server tick)
- Optional seed: `pnpm exec tsx scripts/seed-tournament-soon.ts --fill-bots --bot-count 5 --max-players 6 --starts-in-minutes 5`

## 1. Admin — create bot-filled event

- [ ] Open `/admin` → **Tournaments**
- [ ] Click **Apply bot demo preset** (name `QA Bot Demo`, max 6, bot fill on, 5 bots, start ~15m)
- [ ] Or enable **Fill open seats with bots at start** manually and set bot count
- [ ] Create tournament; list row shows **Bot fill: … at start**
- [ ] Tournament detail (`/tournaments/:id`) shows **Bot fill** info row

## 2. One human registers

- [ ] Log in as a normal player; open tournament from lobby or detail
- [ ] **Register** — entry fee debited; `prizePoolCents` = one × entry fee
- [ ] Registered list shows the human **without** a Bot label
- [ ] `registeredCount` is 1; table not full

## 3. Bots fill at start

- [ ] Wait until `startTime` (or set start in the past in DB for dev)
- [ ] Director moves to `STARTING` → `RUNNING`
- [ ] Registrations include bot rows (`isBot`); no extra `TOURNAMENT_ENTRY` txs for bots
- [ ] `prizePoolCents` unchanged (still one human entry)
- [ ] Human + bots seated on tournament table with `startingStackCents`

## 4. Human joins table

- [ ] Registered human sees **Join Table**
- [ ] Join opens tournament table; banner shows tournament context
- [ ] Bots appear at seats; opponent names show **Bot** badge in standings/roster where applicable

## 5. Tournament finishes

- [ ] Play or simulate bust-outs until one human has chips (bots may bust first)
- [ ] Tournament status `FINISHED`; `prizePoolCents` cleared after payout

## 6. Standings — bots labeled

- [ ] `GET /api/tournaments/:id/standings` (or UI **View Standings**)
- [ ] Bot rows have `isBot: true` and **Bot** label in client UI
- [ ] Bots may have `finishPlace` but `payoutCents` = 0

## 7. Human-only payout verified

- [ ] Human finisher receives full prize pool (single human entrant → winner-take-all)
- [ ] No `TOURNAMENT_PAYOUT` rows for `tournament_bot_*` users
- [ ] If a bot placed ahead of the human on the table, payout still goes to the human (rule B)
- [ ] `UserTournamentStats` / awards updated for human only (no bot stats rows)

## Automated regression

```powershell
pnpm exec vitest run apps/server/src/tests/integration/tournaments-m11.integration.test.ts apps/server/src/tests/integration/tournaments-m12.integration.test.ts apps/server/src/tournaments/tournament-payouts.test.ts
pnpm -C apps/client exec vitest run src/lib/tournament-bot-fill.test.ts src/lib/admin-tournament-form.test.ts
pnpm -C apps/server typecheck
pnpm -C apps/client typecheck
```

## Out of scope

Late registration, public spectators, custom blind structures, multi-table / MTT, leaderboard aggregation.
