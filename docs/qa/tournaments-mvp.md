# Tournament MVP — QA checklist

Manual release verification for scheduled single-table freezeout tournaments. Run against a dev/staging stack with the tournament director enabled.

## Prerequisites

- [ ] Admin user account (`role: ADMIN`)
- [ ] Two+ player accounts with bankroll ≥ entry fee
- [ ] Optional: `pnpm tournaments:seed:soon` to create a registering event starting in ~5 minutes

## Admin — create & cancel

- [ ] Open `/admin` → **Tournaments** tab
- [ ] Create tournament: name, entry fee, local start date/time, max players (2–9), starting stack; blind preset `standard_8min` only
- [ ] New tournament appears in admin list as **Registering** with correct entry fee and registered count `0/N`
- [ ] Start time displays in **your local timezone** (includes timezone abbreviation, e.g. `PDT`)
- [ ] **Cancel** visible only for `REGISTERING` tournaments; cancel succeeds and status becomes **Cancelled**
- [ ] Cancel is hidden/disabled for `STARTING`, `RUNNING`, or `FINISHED` tournaments
- [ ] Admin empty state: “No tournaments yet” when list is empty
- [ ] Admin error state: failed load shows message + **Try again**

## Lobby — discovery & registration

- [ ] Lobby **Tournaments** section lists upcoming / running / recent groups
- [ ] Tournament card shows name, **local** start time, entry fee, registered/max, status
- [ ] Empty state: “No tournaments scheduled yet” when none exist
- [ ] Loading skeletons show on first load; **Try again** on load error
- [ ] Unauthenticated user can open register flow → redirected to login
- [ ] Register deducts entry fee; `registeredCount` increments; **Unregister** refunds
- [ ] Full tournament: register disabled or returns friendly “This tournament is full”
- [ ] Closed tournament: friendly “Registration is closed” (not raw API code)
- [ ] Insufficient bankroll: friendly message on register

## Start, join, play

- [ ] At/after `startTime`, director moves tournament to `STARTING` then `RUNNING`
- [ ] Registered players see **Join Table** when `tableId` and `roomId` are set
- [ ] Join lands on tournament table (banner shows tournament context)
- [ ] Unregistered players cannot join tournament table
- [ ] Blinds advance on schedule between hands (`standard_8min` preset)

## Bust-out, finish, payout, standings

- [ ] Busted player is removed from table; cannot act on future hands
- [ ] Eliminated player sees result/standings path (result banner + view standings)
- [ ] Last player standing finishes tournament; winner receives payout per preset
- [ ] `GET /api/tournaments/:id/standings` shows finish places and payouts
- [ ] Finished tournament shows **View Standings** in lobby

## Cash lobby exclusion

- [ ] `GET /api/lobby/tables` does not list tournament tables
- [ ] Lobby realtime table list excludes rooms with `metadata.tournamentId`
- [ ] Tournament tables are only reachable via tournament join flow

## Auto-cancel & edge cases

- [ ] Tournament with 0–1 registrants at start auto-cancels (no table created)
- [ ] Duplicate unregister is idempotent (no error spam)
- [ ] Director tick safe on retry while `RUNNING`
- [ ] Stuck `STARTING` without `roomId` resumes after server restart/tick

## Automated regression (CI/local)

See **[tournaments-release.md](./tournaments-release.md)** for the full test command, SDK audit, and release gates.

```powershell
pnpm test:tournaments
```

## Bot-filled demo (M11/M12)

See **[tournaments-bot-demo.md](./tournaments-bot-demo.md)**.

## Out of scope (do not test for MVP)

- Late registration, public spectators, multi-table / MTT balancing, custom blind structures, cross-tournament leaderboards
