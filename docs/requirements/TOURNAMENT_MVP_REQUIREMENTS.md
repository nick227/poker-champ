# Poker Tournaments — MVP Requirements

**Status:** Draft  
**Last updated:** 2026-05-20  
**Audience:** Product, client, server, economy

---

## 1. Overview

### 1.1 Goal

Enable **scheduled, multi-player freezeout tournaments** on Poker Champ: admins can plan and publish events, players can discover and register, and the system runs a single-table MTT from start through payout without manual chip handling.

### 1.2 MVP success definition

A player can:

1. See upcoming tournaments in the lobby.
2. Register (entry fee debited from bankroll).
3. Join the tournament table at start time.
4. Play until one winner remains (or a configured payout places finish).
5. Receive prize money to bankroll automatically.

An admin can create a tournament with name, entry fee, start time, and capacity, and cancel it before start if needed.

### 1.3 Guiding principles

- **Reuse cash-game engine** — Same `PokerRoom`, dealer, and table UI; tournament rules layer on top (stacks, blinds, bust-outs), not a second poker engine.
- **Economy stays separated** — Registration and payouts via `CashierService`; in-hand chips via existing ledger/dealer path.
- **Ship thin, run end-to-end** — One table, freezeout, fixed payout structure beats multi-table, rebuys, or advanced ICM in v1.

---

## 2. Current state (baseline)

Already implemented and should be treated as foundation, not greenfield:

| Area | Status |
|------|--------|
| **Data** | `Tournament`, `TournamentRegistration` in Prisma (`status`, `entryFeeCents`, `prizePoolCents`, `startTime`) |
| **HTTP API** | `GET/POST /api/tournaments`, `GET /api/tournaments/:id`, `POST /api/tournaments/:id/register` |
| **Registration economy** | `CashierService.processTournamentRegister` — bankroll → prize pool, idempotent `externalRef` |
| **OpenAPI** | Tournament endpoints documented under `tournaments` tag |
| **Client** | No dedicated tournament lobby UI; admin may hit API only |

**Not implemented (MVP must deliver):**

- Tournament lifecycle orchestration (start, blind levels, bust-outs, finish).
- Linking tournament ↔ Colyseus room / `PokerTable`.
- `CashierService.processTournamentPayouts` (documented in economy roadmap, not built).
- Player-facing discovery, registration UX, and “go to my tournament” flow.
- Unregister / refund before start; cancel tournament.

---

## 3. Scope

### 3.1 In scope (MVP)

#### Planning & scheduling

- Admin creates tournament: **name**, **entry fee** (cents), **scheduled start** (UTC), **max players** (2–9), **starting stack** (chips, tournament-only), **blind structure** (preset levels: SB/BB + duration).
- Tournament visible in lobby list with status, start time, entry fee, registered count / max.
- Status lifecycle: `REGISTERING` → `STARTING` → `RUNNING` → `FINISHED` | `CANCELLED`.
- Optional **late registration** window: configurable minutes after scheduled start, while `RUNNING` and before level N (MVP default: **off**).

#### Registration

- Authenticated users register while `REGISTERING` (and `LATE_REG` if enabled).
- Entry fee deducted once; duplicate register is idempotent success.
- Insufficient bankroll → clear error (`INSUFFICIENT_BANKROLL`).
- Registration closed when status is not open or table is full.
- **Unregister** before start: refund entry to bankroll, decrement prize pool, remove registration (if tournament not `STARTING`/`RUNNING`).

#### Tournament play (single-table freezeout)

- At start: create **one** dedicated table room; seat all registered players with **equal starting stacks** (not cash buy-in range).
- **Blind level scheduler** advances SB/BB on interval (server-authoritative); broadcast level + next level time to clients.
- **Bust-out**: zero chips → eliminated; seat removed; no rebuy.
- **Hand-for-hand** not required in MVP; normal dealing pace.
- Play continues until **one player has all chips** OR remaining players match **payout places** (see payouts).
- Disconnect: reuse existing sit-out / reconnect behavior; eliminated if stack hits zero.

#### Payouts

- **Preset payout table** by entrant count (MVP: top 3 for 6+ players, top 2 for 4–5, winner-take-all for ≤3 — exact percentages in §5.4).
- On finish: `CashierService` distributes `prizePoolCents` to finishing positions; record `TOURNAMENT_PAYOUT` transactions.
- Tournament `status` → `FINISHED`; results persisted (finish place per user).

#### Operations

- Admin **cancel** while `REGISTERING`: refund all entries, status `CANCELLED`.
- Admin cannot cancel after `RUNNING` in MVP (manual support only).

### 3.2 Out of scope (explicit non-goals)

- Multi-table tournaments, table balancing, or final table merge.
- Rebuys, add-ons, bounties, knockout pools.
- Satellite / ticket / phased qualifiers.
- Custom blind structures (user-defined); only **admin-selected presets**.
- Rake on tournament entry (MVP: 100% of entry fee → prize pool).
- ICM deal-making, chopping, or deal negotiation UI.
- Public tournament creation (non-admin).
- Leaderboard points / awards integration (follow-up epic).
- Email/push reminders (optional nice-to-have post-MVP).
- Bot-filled tournaments (may use existing bots later; not required for MVP acceptance).

---

## 4. User stories

### Player

| ID | Story | Acceptance hint |
|----|--------|-----------------|
| P1 | As a player, I see upcoming tournaments on the lobby so I can choose an event. | List shows name, start time (local), fee, players/max, status. |
| P2 | As a player, I register for a tournament so I have a seat when it starts. | Balance decreases by entry fee; I appear in registered count. |
| P3 | As a player, I unregister before start so I am not charged for an event I skip. | Full refund; cannot unregister after start. |
| P4 | As a player, I am directed to the tournament table at start so I can play without hunting a link. | CTA enabled at `STARTING`/`RUNNING`; deep link to table room. |
| P5 | As a player, I see current blind level and time until next level. | Visible on tournament table UI. |
| P6 | As a player, I see when I am eliminated and my finish place. | Overlay or modal with place; cannot rejoin. |
| P7 | As a player, I receive winnings in my bankroll when the tournament ends. | Balance increases per payout; transaction history shows payout. |

### Admin

| ID | Story | Acceptance hint |
|----|--------|-----------------|
| A1 | As an admin, I schedule a tournament with fee, time, and capacity. | Create form/API; appears in list as `REGISTERING`. |
| A2 | As an admin, I cancel a tournament before it starts so a bad event is not run. | All registrants refunded; status `CANCELLED`. |
| A3 | As an admin, I see registration count and final standings. | Detail view or admin API. |

---

## 5. Functional requirements

### 5.1 Tournament configuration (create)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | 1–120 chars (existing API) |
| `entryFeeCents` | int | yes | > 0 |
| `startTime` | datetime | yes | Must be in the future at create |
| `maxPlayers` | int | yes | 2–9 (single table) |
| `startingStackCents` | int | yes | Tournament chips; e.g. 10_000 |
| `blindStructureId` | enum | yes | Preset ID (see §5.3) |
| `lateRegMinutes` | int | no | Default `0` (disabled) |

### 5.2 Status lifecycle

```
REGISTERING ──(start job, min 2 players)──► STARTING ──(table ready)──► RUNNING ──(winner/payout)──► FINISHED
     │                                              │
     └──(admin cancel / insufficient players)──► CANCELLED
```

| Status | Meaning |
|--------|---------|
| `REGISTERING` | Open for register/unregister |
| `LATE_REG` | Optional; register allowed per config |
| `STARTING` | Room provisioning; players may join table |
| `RUNNING` | Active play; registration closed |
| `FINISHED` | Payouts complete |
| `CANCELLED` | Refunded; no play |

**Start conditions (MVP):**

- At `startTime`, if registered count ≥ 2 and ≤ `maxPlayers`, transition to `STARTING`.
- If registered count < 2 at `startTime`, transition to `CANCELLED` and refund all (auto-cancel).

### 5.3 Blind structure (presets)

MVP provides **one default preset** (additional presets can be data-driven later):

| Level | SB | BB | Ante | Duration (min) |
|-------|----|----|------|----------------|
| 1 | 25 | 50 | 0 | 8 |
| 2 | 50 | 100 | 0 | 8 |
| 3 | 75 | 150 | 0 | 8 |
| 4 | 100 | 200 | 0 | 8 |
| 5 | 150 | 300 | 0 | 8 |
| 6 | 200 | 400 | 0 | 8 |
| 7 | 300 | 600 | 0 | 8 |
| 8 | 400 | 800 | 0 | 8 |
| 9 | 600 | 1200 | 0 | 8 |
| 10 | 800 | 1600 | 0 | 8 |

Server advances level on timer; updates table config blinds between hands (not mid-hand).

### 5.4 Payout structure (MVP)

Percentages of `prizePoolCents` (integer math; remainder to 1st place):

| Players | 1st | 2nd | 3rd |
|---------|-----|-----|-----|
| 2 | 100% | — | — |
| 3 | 70% | 30% | — |
| 4–6 | 50% | 30% | 20% |
| 7–9 | 50% | 30% | 20% |

Places beyond paid positions: $0. Elimination order determines rank (last bust = 2nd when paying top 2, etc.).

### 5.5 Registration rules

- One registration per user per tournament (DB unique constraint — already exists).
- Registration only if `user.bankrollCents >= entryFeeCents`.
- Cannot register if `registrations >= maxPlayers`.
- `TOURNAMENT_CLOSED` if status not in `REGISTERING` / `LATE_REG`.

### 5.6 Table & room

- One `PokerTable` (or room) per tournament; `tournamentId` on table metadata.
- Table name defaults to tournament name; not listed in public cash-game lobby (tournament-only entry).
- Seating: all registrants auto-assigned seats at start (no manual seat pick in MVP).
- Min/max “buy-in” for join path replaced by fixed `startingStackCents` for tournament tables.

### 5.7 Elimination & finish detection

- After each hand, director checks stacks; players at 0 chips marked eliminated with `finishPlace`.
- Tournament ends when paid places remain (e.g. 3 players left when paying top 3 → continue until 1 remains **or** define stop at 3 players with simultaneous payout — **MVP rule: play until one winner holds all chips**, then assign 2nd/3rd by elimination order before final hand).  
  **Clarified MVP rule:** Standard freezeout — continue until one player has all chips; payout order by elimination sequence (last eliminated = 2nd, etc.).

### 5.8 Economy

| Event | Service | Requirement |
|-------|---------|-------------|
| Register | `processTournamentRegister` | Exists; extend for `maxPlayers` cap |
| Unregister / cancel refund | New `processTournamentRefund` | Atomic credit bankroll, decrement pool, delete registration |
| Payout | `processTournamentPayouts` | Split pool by §5.4; idempotent by tournament + place |
| In-hand | Ledger / dealer | No bankroll touches; tournament chips only |

All money movements require `externalRef` for idempotency (existing economy pattern).

---

## 6. API requirements (delta from today)

### 6.1 Extend existing

| Endpoint | Change |
|----------|--------|
| `POST /api/tournaments` | Body adds `maxPlayers`, `startingStackCents`, `blindStructureId`, optional `lateRegMinutes` |
| `GET /api/tournaments` | Include `registeredCount`, `maxPlayers` in list items |
| `GET /api/tournaments/:id` | Include registrations (user id, display name), blind level, `tableId` / `roomId` when started |

### 6.2 New (MVP)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/tournaments/:id/unregister` | User | Refund before start |
| `POST /api/tournaments/:id/cancel` | Admin | Cancel + refund all |
| `GET /api/tournaments/:id/standings` | Public | Finish places and payouts (after `FINISHED`) |

### 6.3 Realtime / lobby

- Lobby payload or dedicated `GET /api/tournaments` poll — MVP may use REST poll every 30s on lobby screen.
- Tournament table join: reuse join token flow with `tournamentId` guard (only registered players).

---

## 7. Client requirements (MVP)

### 7.1 Lobby — Tournaments section

- Section above or beside cash tables: **Upcoming** / **Running** / **Recent**.
- Row: name, start time, entry fee (formatted), `registered / max`, status badge, **Register** / **Unregister** / **Join**.
- Tap row → detail: description (optional), payout summary, registrant count, blind preset name.

### 7.2 Registration UX

- Confirm dialog showing entry fee and non-refundable after start time.
- Show bankroll and disabled register if insufficient funds.
- Toast on success / error codes from API.

### 7.3 Tournament table

- Reuse table page with tournament banner: level, blinds, next level countdown, entrants remaining.
- Eliminated state: read-only spectate or redirect to lobby with result card.

### 7.4 Admin

- Minimal: extend existing admin tools or API-only create/cancel for first internal test.
- **MVP acceptance allows admin-via-API** if schedule UI slips; **player lobby UI is required**.

---

## 8. Server & orchestration

### 8.1 Tournament director (new component)

Background responsibility (worker or in-process scheduler):

1. Poll tournaments where `startTime <= now` and `status = REGISTERING`.
2. Validate player count; cancel or start.
3. Create room, seat players, set `RUNNING`.
4. Run blind level timer; push config updates to room.
5. Track eliminations; on end trigger payouts and `FINISHED`.

Must survive process restart: persist level index and `nextLevelAt` on `Tournament` row.

### 8.2 Schema extensions (proposed)

```prisma
// Additions to Tournament — illustrative
maxPlayers          Int
startingStackCents  Int
blindStructureId    String
lateRegMinutes      Int       @default(0)
currentLevel        Int       @default(1)
nextLevelAt         DateTime?
tableId             String?   // link to PokerTable / room
roomId              String?
finishedAt          DateTime?

// TournamentRegistration
finishPlace         Int?
eliminatedAt        DateTime?
```

Exact fields finalized during implementation plan.

### 8.3 Authorization

- Create / cancel: `ADMIN` only (matches current create route).
- Register / unregister: authenticated owner.
- Join table: registered + tournament `STARTING` or `RUNNING`.

---

## 9. Non-functional requirements

| Category | Requirement |
|----------|-------------|
| **Correctness** | No double charge on register retry; no double payout on director retry |
| **Concurrency** | Last seat registration race handled by transaction / unique constraint |
| **Audit** | All entry/refund/payout in `BalanceTransaction` with `tournamentId` |
| **Observability** | Log state transitions with `tournamentId`; metric for cancelled vs finished |
| **Testing** | Integration test: register N players → start → simulate busts → assert payouts |
| **Performance** | Single table, ≤9 players — no special scaling target |

---

## 10. Acceptance criteria (checklist)

- [ ] Admin creates tournament with max players and blind preset; appears in API list.
- [ ] Two players register; prize pool equals 2× entry fee.
- [ ] Third registration fails when full; unregister refunds one entry.
- [ ] At start time, tournament starts with both players seated and equal stacks.
- [ ] Blinds increase on schedule between hands.
- [ ] Eliminated player cannot act; remaining count correct.
- [ ] Tournament finishes with one winner; payouts match preset % and sum to prize pool.
- [ ] Cancel before start refunds all registrants.
- [ ] Auto-cancel when only 0–1 registrants at start time.
- [ ] Player sees tournament in lobby and can register and join without admin help.

---

## 11. Delivery phases (recommended)

| Phase | Deliverable |
|-------|-------------|
| **M1 — Planning & money** | Schema + API extensions; unregister/cancel/refund; lobby list/register UI |
| **M2 — Director & table** | Start job, room creation, seating, blind timer, tournament table join guard |
| **M3 — Finish & payout** | Elimination tracking, `processTournamentPayouts`, standings, polish |

MVP is complete at end of **M3**.

---

## 12. Open questions

Resolve before implementation plan is locked:

1. **Timezone display** — Store UTC only; client localizes?
2. **Minimum players to start** — 2 confirmed; cancel if 1?
3. **Tie / split pot at final table** — Use existing split logic; confirm payout order tie-breaker.
4. **Spectators** — Allow non-registered watch on tournament table?
5. **Private vs public tournaments** — MVP all public?

---

## 13. References

- `apps/server/src/http/TournamentsRouter.ts` — current HTTP surface
- `packages/db/prisma/schema.prisma` — `Tournament`, `TournamentRegistration`
- `apps/server/src/engine/economy/CashierService.ts` — registration; payout TBD
- `docs/implementation/ECONOMY_COMPLETE.md` — Phase 6 tournament payout note
- `docs/architecture/ECONOMY_ARCHITECTURE.md` — cashier vs ledger separation
