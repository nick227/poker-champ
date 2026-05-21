# Tournament release checklist (M1–M13)

Use this checklist before shipping tournament features to staging or production.

## 1. Database migrations

- [ ] All tournament migrations applied on target DB:

```powershell
pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
```

Expected tables/columns include:

| Area | Models / columns |
|------|------------------|
| Core | `Tournament`, `TournamentRegistration` |
| M10 | `TournamentPlayerResult`, `UserTournamentStats` |
| M11 | `Tournament.fillBotsAtStart`, `Tournament.fillBotCount`, `TournamentRegistration.isBot` |

- [ ] `pnpm exec prisma generate --schema packages/db/prisma/schema.prisma` succeeds after deploy.

## 2. OpenAPI and SDK

- [ ] Regenerate contract and SDK after any HTTP schema change:

```powershell
pnpm sdk:gen
```

- [ ] **TournamentSummary** includes: `fillBotsAtStart`, `fillBotCount`, `isRegistered` (optional on list/detail).
- [ ] **Standings rows** include: `userId`, `displayName`, `finishPlace`, `eliminatedAt`, `payoutCents`, `isBot`.
- [ ] **Profile GET** includes: `user`, `tournamentStats` (`tournamentsPlayed`, `tournamentWins`, `tournamentCashes`, `tournamentEarningsCents`).
- [ ] **Create tournament** body accepts: `fillBotsAtStart`, `fillBotCount` (admin only).

## 3. Automated tests (full tournament suite)

Run from repo root (uses `--no-file-parallelism` so integration suites do not race on shared bot users):

```powershell
pnpm test:tournaments
```

Equivalent manual command:

```powershell
pnpm exec vitest run --no-file-parallelism `
  apps/server/src/tests/integration/tournaments-m1.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m2.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m3.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m5.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m9.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m10.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m11.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m12.integration.test.ts `
  apps/server/src/tests/integration/tournaments-m13.integration.test.ts `
  apps/server/src/tournaments/tournament-payouts.test.ts `
  apps/server/src/tournaments/tournament-bot-fill.test.ts `
  apps/server/src/tournaments/tournament-user-stats.test.ts `
  apps/client/src/lib/tournament.utils.test.ts `
  apps/client/src/lib/tournament-bot-fill.test.ts `
  apps/client/src/lib/admin-tournament-form.test.ts `
  apps/client/src/lib/economyTransactionLabels.test.ts
```

- [ ] All tests pass.
- [ ] `pnpm -C apps/server typecheck` passes.
- [ ] `pnpm -C apps/client typecheck` passes.

## 4. Manual QA — core MVP

Follow [tournaments-mvp.md](./tournaments-mvp.md): admin create/cancel, lobby registration, start/join, blinds, bust/finish/payout, standings, cash lobby exclusion.

## 5. Manual QA — bot-filled demo

Follow [tournaments-bot-demo.md](./tournaments-bot-demo.md): admin bot preset, one human registers, bots fill at start, human-only prize pool and payouts, **Bot** labels in standings.

Quick seed (optional):

```powershell
pnpm tournaments:seed:soon -- --fill-bots --bot-count 5 --max-players 6 --starts-in-minutes 5
```

## 6. Release audit gates (M13)

| Gate | Expected |
|------|----------|
| Admin create/cancel | `POST /api/tournaments` and `POST /api/tournaments/:id/cancel` return **403** for non-`ADMIN` users (server-enforced). |
| Bot users | `tournament_bot_*` users excluded from admin user list; profile `tournamentStats` always empty; no stats/awards on finish. |
| Economy labels | `TOURNAMENT_ENTRY`, `TOURNAMENT_PAYOUT`, `TOURNAMENT_SEAT`, `TOURNAMENT_BUST`, `REFUND` show readable labels in wallet/history UI. |
| Payout rule B | Prize pool = human entry fees only; bots ineligible; prizes roll to humans by human finish order. |

## 7. Known non-goals (do not test for release)

- Late registration after start
- Custom blind structures (only `standard_8min`)
- Public / non-registered spectators
- Multi-table / MTT balancing
- Cross-tournament leaderboard aggregation
- Bot accounts in normal registration or bankroll flows

## 8. Post-release smoke

- [ ] Tournament director tick running in server process
- [ ] At least one scheduled tournament completes end-to-end with payouts
- [ ] Bot-demo tournament completable with a single human entrant
