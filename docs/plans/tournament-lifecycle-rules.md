# Tournament lifecycle rules (testable)

**Status:** Implemented in code + `pnpm test:tournaments` (M1–M17, unit suites).

## Time gates

| Rule | Definition |
|------|------------|
| **Registration open** | `canRegisterForTournament`: before `startTime`, or until `startTime + lateRegMinutes` while status is `REGISTERING`, `LATE_REG`, or `RUNNING`. |
| **Unregister open** | `canUnregisterFromTournament`: only `REGISTERING` and `now < startTime`. |
| **Late reg close** | `now >= startTime + lateRegMinutes` when `lateRegMinutes > 0`. |
| **Rebuy open** | REBUY format only: `now < startTime + rebuyPeriodMinutes` and under `maxRebuysPerPlayer`. |

`maxPlayers` is a **registration cap**, not a required field size and not a wait-for-fill condition.

## Start gates

| Rule | Threshold |
|------|-----------|
| Provision table | `registrations >= 1` |
| Deal hands (`RUNNING`) | `humanSeated >= 1` and `totalSeated >= 2` |
| Low entries cancel | `< 1` human or `< 2` total registrations at start / late-reg close |

During `LATE_REG`, the table may exist with only bots seated until a human joins.

## No-show (late reg close)

When late registration **closes**, any **human** registration with:

- `finishPlace == null`
- `rebuyPendingAt == null`
- not currently seated at the tournament table

is eliminated (no-show) with the next available `finishPlace` (same ordering as bust-outs).

If no humans remain active in the field and `seated >= 2`, status promotes from `LATE_REG` to `RUNNING` (bot-only demo). If `humanSeated >= 1` and `seated >= 2`, same promotion.

## End gates (freezeout / rebuy)

Evaluated in `WAITING` after each hand via `TournamentTableReconciler`.

1. Bust players with `stackCents == 0` (rebuy path may set `rebuyPendingAt` instead of `finishPlace`).
2. If `rebuyPendingCount > 0` → **do not** declare a winner.
3. Else `resolveTournamentWinnerUserId(state, registrations)`:

| Survivors with chips | Active human registrations (`finishPlace == null`) | Result |
|--------------------|-----------------------------------------------------|--------|
| 1 | Sole survivor is human | **Winner** |
| 1 | Sole survivor is bot, any human still active | **No finish** (wait) |
| 0 humans, 1+ bots | No active humans | **Bot wins** (demo / challenge) |
| 0 humans, 1+ bots | Active humans remain | **No finish** |
| 2+ | — | **No finish** |

**Active human** means `finishPlace == null` on a non-bot registration (includes registered no-shows until late-reg close assigns a place).

## Other terminals

| Status | When |
|--------|------|
| `CANCELLED` | Low entries at start or late-reg close |
| `ABANDONED` | All humans eliminated, max blind level |
| `FINISHED` | Winner resolved, or orphan reconciler (dead room / 12h stale with stored room) |

Orphan reconciler **does not** finish `RUNNING` tournaments with `roomId == null` (stale-room restore window).
