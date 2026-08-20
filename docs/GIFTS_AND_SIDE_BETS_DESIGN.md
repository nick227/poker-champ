# Gifts & Side Bets — Player Interaction System

**Status:** Proposal
**Author:** Nick Rios (drafted with Claude)
**Date:** 2026-08-20

---

## Table of Contents

1. [Goals & Non-Goals](#1-goals--non-goals)
2. [Core Idea: One Interaction Model, Two Features](#2-core-idea-one-interaction-model-two-features)
3. [Data Model](#3-data-model)
4. [Realtime Contract](#4-realtime-contract)
5. [Server: Services & Resolution](#5-server-services--resolution)
6. [Client: Stores & UI](#6-client-stores--ui)
7. [The Catalog System (why this scales)](#7-the-catalog-system-why-this-scales)
8. [Initial Gift Catalog](#8-initial-gift-catalog)
9. [Initial Side-Bet Catalog](#9-initial-side-bet-catalog)
10. [Economy Integrity & Anti-Abuse](#10-economy-integrity--anti-abuse)
11. [Implementation Plan](#11-implementation-plan)
12. [Open Questions & Decisions](#12-open-questions--decisions)

---

## 1. Goals & Non-Goals

**Goals**
- Let players send each other cosmetic/value **Gifts** and propose **Side Bets**, both scoped to a shared table.
- Minimal new code: reuse the existing realtime contract, Colyseus room, Zustand store, and `CashierService` patterns instead of inventing new ones.
- Both features should be **catalog-driven** so we can add new gifts and new side-bet types by editing a data array, not by shipping new server logic or a migration, in the common case.

**Non-goals (v1)**
- No cross-table gifting/betting (must share a table).
- No admin dashboard for catalog management (catalog lives in code for now — see [§7](#7-the-catalog-system-why-this-scales)).
- No recurring/scheduled bets.
- No real-money withdrawal implications beyond what `CashierService` already governs — this stays inside the existing chip economy.

---

## 2. Core Idea: One Interaction Model, Two Features

Gifts and side bets are the same shape wearing different clothes — but only *some* of that shape is actually shared. Being explicit about the split is the point of this section; the rest of the doc follows from it.

**Genuinely shared** (one model, one path, no branching by type):
- The `PlayerInteraction` row itself — durable ID, both parties, `catalogKey`, table/hand scope, `stakeCents`, `metadata`, timestamps.
- The catalog pattern (data array, validated `catalogKey`, client and server import the same source — [§7](#7-the-catalog-system-why-this-scales)).
- The realtime shell: one message router entry point, one rate-limit + session-auth path, one broadcast mechanism.
- The client store/UI entry point (one player-action popup, one dispatch layer).
- Telemetry/audit: every *actual chip movement* is a `BalanceTransaction`, same as today's buy-ins/cash-outs. A side bet's `PENDING`/`ACTIVE` period moves no chips (§5.2), so it has no `BalanceTransaction` legs during that time — its audit trail is the `PlayerInteraction` row's own status/timestamp history, which is exactly why that row needs to be durable and explicit about state rather than a fire-and-forget log line.

**Deliberately not shared** (branches by type, because the safety profile differs):
- **Money movement.** A gift is one terminal debit+credit — it either fully happens or fully fails, in one transaction, and there's nothing left open afterward. A side-bet stake needs to be held before anyone has won anything, and must later resolve to exactly one of {payout, released-unmatched}. Modeling both as calls to a single `transferBetweenUsers` (my first draft) hid that difference — it implicitly needed a "who holds the money in between" answer, which I filled in with a fabricated `HOUSE_ESCROW` user. Fixing the fake account wasn't the whole fix, either: a first revision replaced it with "debit the stake immediately, no counterpart credit yet," which is still a real ledger movement with no equal-and-opposite side — it temporarily breaks the invariant that total chips in the system (`sum(User.bankrollCents) + sum(PlayerBalance.balanceCents)`) stays constant. The actual design treats a held stake as a **spend-authorization hold, not a ledger entry** — see [§5.2](#52-money-movement-a-reservation-not-a-premature-transfer) for why that distinction matters and how it works.
- **Lifecycle.** Gifts have no state machine — `PENDING`/`ACTIVE` never apply to them. Side bets do, and every transition needs a concurrency guard (see [§5.2](#52-money-movement-a-reservation-not-a-premature-transfer)).
- **Resolution.** Immediate for gifts. Deferred and *must survive a process restart* for side bets — see [§5.4](#54-resolution-durability).

This split is why Gifts can ship first (Phase 2) and Side Bets plug into the same `PlayerInteraction`/catalog/realtime/UI scaffolding later (Phase 3) without the scaffolding itself needing to change.

```
PlayerInteractionService          (new — sibling to CashierService)
  ├─ sendGift()                   → CashierService.debitUser() + creditUser()   [one transaction, terminal — real chip movement]
  ├─ proposeSideBet()             → reservedCents check only                    [no chip movement — authorizes a hold]
  ├─ respondSideBet()             → reservedCents check, or release             [holds opponent's stake, or releases initiator's]
  ├─ cancelSideBet()              → release reservation                        [no chip movement]
  └─ resolveSideBetsForHand()     → SideBetConditionEvaluator + CashierService.debitUser()/creditUser()  [only point a side bet's chips actually move]
```

---

## 3. Data Model

Single new table, plus new enum values on the existing ledger. Modeled directly on `CashierService.processTournamentRegister` (debit → counterpart record → ledger row, all in one transaction, idempotent via `externalRef`).

```prisma
enum PlayerInteractionType {
  GIFT
  SIDE_BET
}

enum PlayerInteractionStatus {
  PENDING     // side bet awaiting opponent response
  ACTIVE      // side bet accepted, awaiting resolution
  COMPLETED   // gift delivered / side bet paid out
  DECLINED    // opponent declined
  CANCELLED   // initiator rescinded before response
  EXPIRED     // offer timed out
  VOIDED      // could not resolve (e.g. lock condition violated) — full refund
}

model PlayerInteraction {
  id            String                   @id @default(cuid())
  type          PlayerInteractionType
  status        PlayerInteractionStatus  @default(PENDING)
  catalogKey    String                   // e.g. "gift.rose", "sidebet.coin_flip"
  tableId       String
  handId        String?                  // set for hand-scoped side bets
  initiatorId   String
  recipientId   String
  stakeCents    Int                      @default(0)   // gift value, or per-side bet stake
  payoutCents   Int?                     // final resolved payout (side bets)
  winnerId      String?
  metadata      Json?                    // catalog-specific params (e.g. pot threshold, lock street)
  externalRef   String                   @unique
  createdAt     DateTime                 @default(now())
  respondedAt   DateTime?
  resolvedAt    DateTime?
  expiresAt     DateTime?

  table     PokerTable @relation(fields: [tableId], references: [id])
  hand      Hand?      @relation(fields: [handId], references: [id])
  initiator User       @relation("InteractionsInitiated", fields: [initiatorId], references: [id])
  recipient User       @relation("InteractionsReceived", fields: [recipientId], references: [id])

  @@index([tableId, status])
  @@index([recipientId, status])
  @@index([handId])
}
```

`BalanceTransaction.type` (currently a plain `String`, see `packages/db/prisma/schema.prisma:73-104`) gets new values, exactly like `TOURNAMENT_ENTRY`/`TOURNAMENT_PAYOUT` today: `GIFT_SENT`, `GIFT_RECEIVED`, `SIDE_BET_PAYOUT`. That's the full list — there's no `SIDE_BET_ESCROW`/`REFUND`/`VOID` because, per [§5.2](#52-money-movement-a-reservation-not-a-premature-transfer), a held-but-unresolved stake never moves any actual chips, so there's nothing for those states to log in the ledger.

Note what's **not** in the DB: the catalog itself. `catalogKey` is just a string, validated against a code-side catalog array at request time (see [§7](#7-the-catalog-system-why-this-scales)).

---

## 4. Realtime Contract

New additions to `packages/realtime-contract/src/table.ts` (or a new `interactions.ts` re-exported from `index.ts`, same package both apps already import).

**Inbound (client → server)**, joining the existing `TableInboundMessageSchema` union (`ACTION`, `CHAT`, etc.):

```ts
SEND_GIFT          { recipientUserId, catalogKey }
PROPOSE_SIDE_BET   { recipientUserId, catalogKey, stakeCents, handScope: "NEXT_HAND" | "SESSION", subjectUserIds?: [string, string] }
RESPOND_SIDE_BET   { interactionId, accept: boolean }
CANCEL_SIDE_BET    { interactionId }
```

`subjectUserIds` is required for any catalog entry whose condition needs two seats to compare (`WINNER_IS`, `LOSER_HAND_RANK_AT_LEAST`, `FOLD_ORDER`) — it's the pair of *other* seated players whose hand outcome is being wagered on, distinct from `initiatorId`/`recipientId` (the two people placing the bet). This is what makes "no v1 side bet may reference a hand either bettor is dealt into" ([§9](#9-initial-side-bet-catalog)) mechanically enforceable rather than just a policy statement: the server can reject a propose/accept where `subjectUserIds` overlaps `{initiatorId, recipientId}`. `REACHED_SHOWDOWN` needs no subjects — it's a whole-hand boolean, not a comparison between two seats.

**Outbound (server → client)**, joining `TableOutboundMessageSchema` (`TABLE_SNAPSHOT`, `CHAT_MESSAGE`, etc.):

```ts
GIFT_RECEIVED      { interactionId, senderUserId, recipientUserId, catalogKey, stakeCents, createdAt }
SIDE_BET_OFFER     { interactionId, initiatorUserId, recipientUserId, catalogKey, stakeCents, expiresAt }
SIDE_BET_UPDATE    { interactionId, status }               // accepted / declined / cancelled / expired
SIDE_BET_RESOLVED  { interactionId, winnerId, payoutCents, resolutionNote }
```

`GIFT_RECEIVED` broadcasts to the whole table (so it can toast/animate for onlookers, same as `CHAT_MESSAGE` does today). `SIDE_BET_OFFER`/`SIDE_BET_UPDATE`/`SIDE_BET_RESOLVED` target the two participants plus a table-wide echo for the resolved event only (so a resolved bad-beat bet is a visible table moment, but a pending offer is private).

---

## 5. Server: Services & Resolution

### 5.1 Message handling

New `onMessage` cases in `apps/server/src/rooms/room/PokerRoomMessageRouter.ts`, following the exact shape of the existing `CHAT` handler (`:167-202`): rate-limit → Zod `safeParse` → resolve `userId` from session → authorize → call `PlayerInteractionService` → broadcast. Authorization has two parts:
- Both bettors must be currently **seated** at this table — gifts and side bets are seated-players-only in v1, not open to rail-birds (see [§12](#12-open-questions--decisions)).
- For `PROPOSE_SIDE_BET`/`RESPOND_SIDE_BET` on a catalog entry with `subjectUserIds` (§4): both subjects must be currently dealt into the target hand, and `subjectUserIds` must be disjoint from `{initiatorId, recipientId}` — this is the actual enforcement point for "no own-hand bets" (§9/§10), checked at both propose and accept time since seating/dealing can change between the two.

### 5.2 Money movement: a reservation, not a premature transfer

`CashierService` (`apps/server/src/engine/economy/CashierService.ts`) already composes a debit and a credit inside one `prisma.$transaction` for every existing operation (buy-in, cash-out, tournament entry). It gets **two new primitives**, used only when chips actually change hands:

- `CashierService.debitUser(userId, amountCents, type, externalRef)` — atomic, transaction-guarded so it fails clean on insufficient balance, writes a `BalanceTransaction` leg.
- `CashierService.creditUser(userId, amountCents, type, externalRef)` — atomic, writes a `BalanceTransaction` leg.

Gifts use both directly, in one transaction, terminal. Side bets **do not call either at propose or accept time.** A stake that's merely pending doesn't stop being the proposer's chips — it stops being *spendable*. Those are different things, and only the ledger should reflect the first, or `sum(User.bankrollCents) + sum(PlayerBalance.balanceCents)` stops being a true count of chips in the system for as long as any bet is held. A hold is a **spend-authorization constraint layered on top of the ledger, not a ledger entry** — the same relationship `PlayerBalance` already has to `User.bankrollCents` (money at a table is a separate named bucket from bankroll; a pending side-bet stake is just another one).

```
reservedCents(userId)   — derived, not stored:
  SUM(stakeCents) across this user's own PlayerInteraction rows (as initiator, or as recipient once ACTIVE)
  WHERE status IN ('PENDING', 'ACTIVE')
  — served by the existing @@index([tableId, status]) / @@index([recipientId, status])

CashierService.getSpendableCents(userId) = User.bankrollCents - reservedCents(userId)
  — the ONE helper every spend check (proposeSideBet, sendGift, buy-in, cash-out, tournament register/rebuy) must
    validate against — see the reservation-consistency note below for why "must" is load-bearing, not aspirational
```

```
sendGift(initiatorId, recipientId, tableId, catalogKey)
  → look up GIFT_CATALOG[catalogKey], validate exists
  → one transaction: debitUser(initiator, cost, "GIFT_SENT") + creditUser(recipient, cost, "GIFT_RECEIVED")
  → create PlayerInteraction (status COMPLETED)   — terminal, real chip movement, nothing left open

proposeSideBet(initiatorId, recipientId, tableId, catalogKey, stakeCents, handScope)
  → look up SIDE_BET_CATALOG[catalogKey], validate stake within the catalog's big-blind-relative bounds (§7) and the per-pair daily cap (§10)
  → check CashierService.getSpendableCents(initiator) >= stake
  → create PlayerInteraction (status PENDING, expiresAt = now + 30s)   — no BalanceTransaction, no bankrollCents change
  → return for broadcast (SIDE_BET_OFFER to recipient)

respondSideBet(interactionId, recipientId, accept)
  → one transaction, guarded by `WHERE id = interactionId AND status = 'PENDING'`:
      if accept: check CashierService.getSpendableCents(recipient) >= stake, status → ACTIVE   — still no chip movement
      if decline: status → DECLINED   — initiator's stake drops out of reservedCents the moment status changes; nothing to refund because nothing moved

cancelSideBet(interactionId, initiatorId)
  → same CAS guard, only while still PENDING → status → CANCELLED   — no chip movement

resolveSideBetsForHand(tableId, handId)
  → find ACTIVE PlayerInteraction rows scoped to handId, guarded by `WHERE status = 'ACTIVE'`
  → for each, run SideBetConditionEvaluator against persisted Hand/HandPlayer/HandAction/HandPayout rows
  → one transaction: debitUser(loser, stake, "SIDE_BET_PAYOUT") + creditUser(winner, both stakes, "SIDE_BET_PAYOUT") + status → COMPLETED
    — this is the only point a side bet's chips actually move
  → if the lock condition was violated (e.g. street already past when accepted), status → VOIDED directly, no chip movement either way
```

Net effect: total system chips are invariant through the entire `PENDING`/`ACTIVE`/`DECLINED`/`CANCELLED`/`EXPIRED`/`VOIDED` lifecycle, because nothing ever left anyone's balance during it — `reservedCents` is a read-time constraint, not a store of value. Exactly one settlement moves real chips, atomically, at `COMPLETED`. This is why it's not "recognize the hold as a platform liability and track it" — there's no liability to track, because the ledger was never touched to create one.

`reservedCents` is computed rather than materialized deliberately: `proposeSideBet`/`respondSideBet`/`cancelSideBet` are low-frequency, user-initiated actions (not hot-path poker actions), so an aggregate query per call is cheap — and unlike a mutable counter column, it cannot drift out of sync with the interaction rows that are its source of truth, because it *is* those rows.

**Concurrency guard.** Every status transition (`respondSideBet`, `cancelSideBet`, `resolveSideBetsForHand`) is a single `updateMany` with a `WHERE status = <expected current status>` guard inside the transaction — the same compare-and-swap pattern `CashierService` already uses elsewhere (e.g. its `gte`-guarded balance updates). This makes double-accept, accept-after-expiry, and double-resolution races fail closed (zero rows updated → no-op). It's also what keeps `reservedCents` trustworthy: since a stake only counts while status is `PENDING`/`ACTIVE`, and status can only transition once per CAS guard, there's no window where the same stake is briefly double-counted or drops out early.

**Insufficient-balance races across concurrent offers.** Because `getSpendableCents` is checked *inside* the same transaction that flips status to `PENDING`/`ACTIVE` — not checked, then held separately — a user cannot open multiple offers that jointly exceed their balance. Each call either passes its check and commits its status change atomically, or fails; there's no gap between "checked" and "reserved" for a second concurrent call to race into.

**Reservation consistency across every balance-check path — the one place this design can quietly break.** `reservedCents` only protects the economy if *every* path that decides "can this user afford X" subtracts it — `bankrollCents - reservedCents`, never raw `bankrollCents`. That's not just `proposeSideBet`/`respondSideBet`; it's every existing `CashierService` check too: cash-game buy-in (`processCashGameBuyIn`), cash-out (`processCashGameCashOut`), tournament registration/rebuy (`processTournamentRegister`, the rebuy path in `apps/server/src/http/EconomyRouter.ts`), and anything added later. Each of those predates this feature and has no reason to know a hold exists unless it's explicitly touched. If even one of them checks raw `bankrollCents`, a user can hold a side-bet stake *and* spend the same chips on a buy-in — each individual transaction is internally consistent (nothing corrupts the database), but the hold model itself is bypassed, silently, because the bypass never produces an error anywhere.

The mitigation is to make the bypass structurally hard, not just documented: introduce one `CashierService.getSpendableCents(userId)` helper that computes `bankrollCents - reservedCents`, and require every balance-check call site — new and existing — to go through it instead of reading `User.bankrollCents` directly. This is a Phase 3 task (§11), specifically an audit of every existing `CashierService`/`EconomyRouter` balance check, not just new-code review — the existing paths are the ones with no natural reason to have been touched by this feature otherwise.

### 5.3 Reusing hand-history persistence for resolution — this is the key architectural win

Hand-scoped side bets (coin flip, bad beat, first-to-fold, board texture, etc.) don't need any new live-state plumbing. They resolve by reading the **same `Hand`/`HandPlayer`/`HandAction`/`HandPayout` rows** that already get written for hand history (the tables `HandHistoryRouter.ts` and `history.service.ts` already serve). `resolveSideBetsForHand` hooks in as one extra step right after those rows are persisted at hand end (in the hand-lifecycle/settlement flow that already writes them) — it does not touch live game state (`PokerState`/`Dealer`) at all.

`SideBetConditionEvaluator` (new, small: `apps/server/src/engine/economy/SideBetConditionEvaluator.ts`) is a fixed set of ~8 pure functions over that persisted data, keyed by a `condition.kind` string in `metadata`:

```
WINNER_IS                  — did subject A or subject B win the hand's pot
LOSER_HAND_RANK_AT_LEAST   — did the losing subject's hand reach a given rank (bad-beat check)
REACHED_SHOWDOWN           — boolean, no subjects needed
FOLD_ORDER                 — which of the two subjects folded first
POT_SIZE_AT_LEAST          — final pot vs. a threshold set at proposal time
BOARD_SUIT_MAJORITY        — red vs. black majority on the final board
BOARD_HAS_PAIR             — whether the community cards paired
ALL_IN_OCCURRED            — whether the hand involved an all-in
```

("Subjects" = `subjectUserIds` from §4 — the two seats whose hand outcome is being wagered on, always disjoint from the two bettors per the v1 no-own-hand-bets decision.)

**This is the whole trick for "rapidly expand" side bets**: a new hand-scoped bet type is a new `SIDE_BET_CATALOG` entry that references one of these existing conditions with different parameters (e.g. "Bad Beat Bounty" = `LOSER_HAND_RANK_AT_LEAST: TWO_PAIR`, "River Rat" = `REACHED_SHOWDOWN: true`). No new server code unless the bet needs a genuinely new predicate — and even then, it's one more small pure function, not a new subsystem.

For bets that can't be server-verified at all (freeform social wagers), there's an escape hatch: the `MANUAL` condition kind resolves via mutual confirmation — both participants send `RESPOND_SIDE_BET`-style confirmation of the same winner; if they agree, it pays out. This is the **"Honor Bet"** catalog entry (see [§9](#9-initial-side-bet-catalog)) — it lets players invent entirely new bets (with a custom label they type in) with **zero backend changes at all**, at a capped stake.

For the one bet type that can't resolve on a single hand (`STACK_RACE`, "over the next 10 hands"), resolution is a light session counter rather than a single hook — flagged as Phase 4 below, since it needs a small "hands remaining" decrement somewhere in the existing hand-end flow rather than a one-shot check.

### 5.4 Resolution durability

The original draft treated "hook `resolveSideBetsForHand` into hand-end persistence" as the whole story. It isn't: a Colyseus room is an in-memory process. If it restarts or crashes between a hand's `Hand`/`HandPayout` rows being persisted and the resolution hook running, an `ACTIVE` bet is left stranded — status never advances, stake stays held, forever, with no error anywhere.

The hook firing once is the fast path, not the safety mechanism. Two things make it safe regardless of whether the hook fires:

- `resolveSideBetsForHand` is **idempotent** — it's the same `WHERE status = 'ACTIVE'` CAS-guarded transaction from [§5.2](#52-money-movement-a-reservation-not-a-premature-transfer), so calling it twice for the same `handId` is a no-op the second time.
- A **periodic reconciliation sweep** (cron or scheduled job, not tied to any specific room process) queries for `PlayerInteraction` rows still `ACTIVE` whose `handId` already has persisted `HandPayout` rows, and calls the same resolution path on them. This is the backstop for the crash case — it's what makes the durable `interactionId`/`handId` pairing load-bearing rather than incidental, since the sweep has to be able to find orphaned bets purely from persisted state, with no dependency on any particular room instance still being alive.

Net: the hand-end hook is a latency optimization (resolve within the same tick as the hand ending); the sweep is what actually guarantees every bet resolves. Both call the exact same idempotent function.

---

## 6. Client: Stores & UI

### 6.1 Dispatch

`apps/client/src/features/table/stores/multitable.store.ts` gets `dispatchSendGift`, `dispatchProposeSideBet`, `dispatchRespondSideBet`, `dispatchCancelSideBet` — each a thin wrapper exactly like `dispatchSendChat` (`:253-262`): validate against the shared Zod schema, call the bound room `sender`.

### 6.2 Inbound routing & state

`apps/client/src/realtime/tableRealtime.message.ts` routes the four new outbound types, same as it does `CHAT_MESSAGE` today, into new `table.store.ts` state:

```
giftFeedByTableId: Record<tableId, GiftReceivedEvent[]>       // rolling toast queue
sideBetsByTableId: Record<tableId, Record<interactionId, SideBetState>>  // offers + active + resolved (session-scoped)
```

### 6.3 UI

- **Entry point**: `onPlayerPress` in `useTablePageController.tsx` (currently opens `PlayerHistoryPopup`, stats-only) gains two actions on the popup: "🎁 Send Gift" and "🎲 Make Side Bet". Simplest change: add tabs to `PlayerHistoryPopup.tsx` (Stats / Gift / Bet) rather than a new modal component, since it already owns the "tap a player" entry point and `ModalSheet` shell.
- **Gift tab**: renders `GIFT_CATALOG` as a data-driven grid (one row of markup, N catalog entries — adding gift #16 requires zero UI changes). Tap → confirm → `dispatchSendGift`.
- **Bet tab**: renders `SIDE_BET_CATALOG` as a data-driven list with a stake slider bounded by the entry's `minStakeBigBlinds`/`maxStakeBigBlinds` resolved against the table's current big blind. Submit → `dispatchProposeSideBet`.
- **New component** `SideBetOfferBanner.tsx`: non-blocking overlay (same `blocking: false` `ModalSheet` pattern chat already uses) shown to the recipient with Accept/Decline and a countdown to `expiresAt`. Registered in `TablePageOverlays.tsx` alongside every other overlay.
- **New component** `GiftToast.tsx` / a new atmosphere effect: since `StageAtmosphere.tsx` and `TableStage.tsx` are the current home for ambient table visual effects (already under active revision in this branch), a received gift should register as a new atmosphere effect type there rather than a bespoke overlay layer — keeps one place owning "things that animate over the table."
- **Resolution toast**: `SIDE_BET_RESOLVED` renders a brief table-wide toast ("🎲 Nick won the Bad Beat Bounty — +500"), reusing whatever toast/snackbar primitive the app already has for other ephemeral notices.

No new state library, no new modal primitive, no new websocket path — every piece slots into an existing seam.

---

## 7. The Catalog System (why this scales)

Both catalogs are plain TypeScript data, living in the shared contract package so client and server import the same source of truth with no duplication and no drift:

```
packages/realtime-contract/src/catalog/gifts.ts     → GIFT_CATALOG: GiftCatalogEntry[]
packages/realtime-contract/src/catalog/sideBets.ts  → SIDE_BET_CATALOG: SideBetCatalogEntry[]
```

```ts
interface GiftCatalogEntry {
  id: string;              // "gift.rose" — stored as PlayerInteraction.catalogKey
  emoji: string;
  label: string;
  flavorText: string;
  costCents: number;       // fixed cost = amount recipient receives
}

interface SideBetCatalogEntry {
  id: string;               // "sidebet.coin_flip"
  label: string;
  description: string;
  minStakeBigBlinds: number;   // bounds are relative to the table's current big blind, not flat cents —
  maxStakeBigBlinds: number;   // keeps a wager appropriately sized whether the table is $0.05/$0.10 or $5/$10.
                                // Secondary safeguard against the incentive-distortion risk in §10 — the primary
                                // one is that own-hand bets are disallowed outright (subjectUserIds, §4/§5.1)
  payoutMultiplier?: number;   // default 1:1; e.g. 3 for a rare bad-beat bet (opponent's held stake scales accordingly — not a house rake, see §10)
  condition:
    // v1 — built because a real catalog entry in §9 needs it today
    | { kind: "WINNER_IS" }
    | { kind: "LOSER_HAND_RANK_AT_LEAST"; rank: HandRank }
    | { kind: "REACHED_SHOWDOWN"; value: boolean }
    | { kind: "FOLD_ORDER" }
    // not built yet — add only when a catalog entry actually needs one (see §9)
    | { kind: "POT_SIZE_AT_LEAST"; thresholdCents: number }
    | { kind: "BOARD_SUIT_MAJORITY"; color: "RED" | "BLACK" }
    | { kind: "BOARD_HAS_PAIR" }
    | { kind: "ALL_IN_OCCURRED" }
    | { kind: "SESSION_STACK_RACE"; handsWindow: number }
    | { kind: "MANUAL" };       // Honor Bet — mutual confirmation, no server check; gated, see §9/§10
  lockBeforeStreet?: "PREFLOP" | "FLOP" | "TURN" | "RIVER"; // offer must be accepted before this street
}
```

`minStakeBigBlinds`/`maxStakeBigBlinds` are resolved against the table's current big blind at **both** `proposeSideBet` and `respondSideBet` time, not just once at proposal — a tournament's blinds can increase between the two, and re-checking at accept keeps the bound meaningful rather than grandfathering in a stake sized for a blind level that no longer applies.

Only `WINNER_IS`, `LOSER_HAND_RANK_AT_LEAST`, `REACHED_SHOWDOWN`, and `FOLD_ORDER` are in the Phase 3 build — those are what Coin Flip, Bad Beat Bounty, River Rat, and First to Fold actually need (§9). The rest of the union (`POT_SIZE_AT_LEAST`, `BOARD_SUIT_MAJORITY`, `BOARD_HAS_PAIR`, `ALL_IN_OCCURRED`, `SESSION_STACK_RACE`, `MANUAL`) is listed here to show the shape scales, but is deliberately **not** implemented until a real bet needs it — writing all eight predicates before three of them have a caller is exactly the kind of premature abstraction this design otherwise argues against. Each one is cheap to add later (a small pure function plus a catalog entry), so there's no cost to waiting for a real reason.

**Adding gift #16 is a one-line array push.** **Adding a side bet that composes an already-built `condition.kind` is a one-object array push, no new server code.** Adding one that needs a new predicate is one small pure function plus the array push — still not a new subsystem. This directly satisfies "rapidly expand both" and "minimal code footprint," without requiring the whole predicate surface to exist upfront.

The catalog lives in code rather than the DB deliberately for v1 — it ships via normal deploys, gets type-checked, and needs no admin tooling. If/when non-engineers need to tweak pricing or add gifts without a deploy, this can move to a DB-backed table with an in-memory cache later **without changing `PlayerInteraction`** at all, since `catalogKey` is already just an opaque string.

---

## 8. Initial Gift Catalog

All gifts transfer real chip value to the recipient (no platform rake — gifting is meant to feel generous). Costs are illustrative; tune against typical stack sizes.

| Emoji | Name | Cost | Flavor |
|---|---|---:|---|
| 👏 | Slow Clap | 50 | "Nice hand... barely." |
| 🌹 | Rose | 100 | A classy nod of respect. |
| 🍀 | Good Luck Charm | 100 | Sending luck for the next hand. |
| 🎩 | Hat Tip | 150 | Respect for a great fold or read. |
| 🔥 | Nice Bluff | 200 | Caught red-handed, paid in style. |
| 🍺 | Round on Me | 250 | Buys the table a round. |
| 🧊 | Ice in Your Veins | 300 | For a cold-blooded, clutch call. |
| 🎂 | Happy Cake Day | 300 | Reserved for account-anniversary moments (pairs with the join-date already shown in `PlayerHistoryPopup`). |
| 🦈 | Sharp Play | 350 | Respect for a well-timed, sharp move. |
| 🏆 | GG Well Played | 400 | End-of-session sportsmanship. |
| 🚑 | Bad Beat Sympathy | 500 | Condolences after a brutal beat. |
| 🎁 | Mystery Gift | 777 | Fixed cost, randomized flavor/animation only — no RNG on payout. |
| 👑 | Chip Leader Crown | 1,000 | Congratulating the table's current chip leader. |
| 💎 | High Roller Salute | 2,500 | A grand gesture for a big pot won. |

**Cut from the launch catalog: "Stake Ya" (sender-picked amount).** `SEND_GIFT`'s wire shape (§4) only carries `catalogKey`, with no amount field — there was never an actual way to send a variable amount. Shipping a catalog entry that advertises "sender picks the amount" while silently charging a fixed floor is misleading, and adding a real amount-override field would reopen the arbitrary-value-transfer surface the fixed-catalog design deliberately avoided (§10). If an open-ended gift amount is wanted later, it should be a deliberate, separately-reviewed addition — an explicit `amountCents` field validated server-side against catalog-defined bounds — not a default inclusion because the UI slot was easy to add.

---

## 9. Initial Side-Bet Catalog

All hand-scoped bets lock at the start of the target hand (`lockBeforeStreet: "PREFLOP"`) unless noted, so no one can bet with information they shouldn't have. **Decided (see [§10](#10-economy-integrity--anti-abuse)/[§12](#12-open-questions--decisions)): no v1 side bet may reference a hand either bettor is dealt into.** All four bets below are rail-side wagers on a hand neither bettor is playing — this removes the misplay-incentive risk at the mechanism level rather than merely capping its size. `WINNER_IS`/`LOSER_HAND_RANK_AT_LEAST`/`FOLD_ORDER` are perfectly fine predicates; what's restricted is *who* can bet on them, not the predicates themselves.

**Phase 3 (v1 build — uses only the four implemented conditions):**

| Name | Condition | Notes |
|---|---|---|
| Coin Flip | `WINNER_IS` | Even-money bet on who wins a hand neither bettor is dealt into. The onboarding bet — pick any two seated opponents and call the winner. |
| Bad Beat Bounty | `LOSER_HAND_RANK_AT_LEAST: TWO_PAIR` | Payout if the hand's loser goes out despite reaching two pair or better. `payoutMultiplier: 3` — rare enough to deserve real odds. |
| River Rat | `REACHED_SHOWDOWN: true` | Bet on whether a hand goes the distance. |
| First to Fold | `FOLD_ORDER` | Between two other seats, who folds first. |

**Later (add only when a condition predicate exists to back them — see §7):**

| Name | Condition | Notes |
|---|---|---|
| All-In Or Bust | `ALL_IN_OCCURRED` | Will this hand see an all-in. |
| Board Blush | `BOARD_SUIT_MAJORITY` | Red or black majority on the final board. |
| Paired Board | `BOARD_HAS_PAIR` | Will the community cards pair. |
| Big Pot | `POT_SIZE_AT_LEAST` | Will the hand's final pot clear a threshold set at proposal time. |
| Stack Duel | `SESSION_STACK_RACE` | Over the next N hands, who nets more chips. Needs a session-hands counter, not a single hand-end hook — not v1. |
| Honor Bet | `MANUAL` | Freeform, player-typed wager resolved by mutual confirmation. **Not in initial launch** — see [§10](#10-economy-integrity--anti-abuse); it's a real feature (zero-backend-code path for player-invented bets) but its risk profile needs its own sign-off before it ships, not a default inclusion because it was easy to spec. |

---

## 10. Economy Integrity & Anti-Abuse

A user-to-user chip transfer feature is also, structurally, a chip-laundering vector (collusion accounts moving chips risk-free via "gifts" or pre-arranged bet outcomes). The first draft treated caps as Phase 5 polish even though it already named this risk in the same breath — that's inconsistent, and this revision fixes it: **caps ship with launch, not after.**

- **Seated-players-only, same-table requirement**: gifts and side bets are only between users currently **seated** at the same table (not rail-birds/spectators) — no arbitrary account-to-account transfer surface, and no ambiguity about who's eligible. Enforced in Phase 2 (gifts) and Phase 3 (side bets), not deferred.
- **No self-gifting**, no gifting/betting bots.
- **Side-bet stakes are capped relative to the table, not by a flat amount**: `maxStakeBigBlinds` on each catalog entry (§7), re-validated at both propose and accept time against the table's current big blind. This is the primary lever against *both* the laundering risk here and the incentive-distortion risk below — a stake sized in big blinds can never be disproportionate to the table's real stakes, on a $0.05/$0.10 table or a $5/$10 one. Enforced from Phase 3, launch scope, not Phase 5.
- **Per-pair daily aggregate ceiling**: a sender↔recipient pair has a combined daily notional cap — gifts and side-bet stakes both count against it — independent of any single interaction's size, to blunt repeated draining or wash-trading between two colluding accounts across many small interactions rather than one large one. One shared `assertWithinDailyPairCap` check called from both `sendGift` and `proposeSideBet` (this is genuinely shared logic, consistent with the "one authorization path" claim in [§2](#2-core-idea-one-interaction-model-two-features)). Enforced from launch (Phase 2 for gifts, Phase 3 for side bets) — exact numbers are still an open question ([§12](#12-open-questions--decisions)), but the mechanism and its launch timing are decided.
- **Side bets need real uncertainty**: every catalog condition except `MANUAL` resolves off actual hand outcomes the pair doesn't control in advance — this is why `lockBeforeStreet` exists (can't propose "board pairs" after seeing the flop).
- **No side-bet rake in v1** (decided — see [§12](#12-open-questions--decisions)): adds payout/accounting complexity before the feature itself is validated. Revisit only if real usage data supports it; not a default Phase 5 backlog item.
- **Full audit trail**: every *actual chip movement* is a `BalanceTransaction` with a unique `externalRef`, exactly like existing buy-ins/cash-outs — nothing new to build for after-the-fact review of settled interactions. A held-but-unresolved side bet has no `BalanceTransaction` (§5.2), so its audit trail is the `PlayerInteraction` row's own status history — reviewing "who proposed what to whom, and how it resolved" means querying that table, not the ledger.
- **Rate limiting** on `SEND_GIFT`/`PROPOSE_SIDE_BET` reuses the same per-client rate limiter `PokerRoomMessageRouter` already applies to `CHAT`/`ACTION`.
- Flag as a **future** item (not v1): automated anomaly detection on interaction patterns (e.g. two accounts gifting back and forth repeatedly) — note this in the doc so it's not silently forgotten, but don't build it before the feature ships.

**Incentive integrity when the two bettors are also the two hand participants.** This is a distinct risk from laundering, and the first draft didn't call it out. A side bet where the two bettors are also the two players in the pot layers a second, potentially larger, payout on top of the hand itself. That creates a real incentive to misplay the actual hand to win the side bet (fold a hand worth playing, or push one that isn't, because the side-bet payout dominates the pot's EV). This is a soft-play/integrity problem the poker engine's correctness can't detect, because from the engine's point of view every action is legal.

**Decided (conservative default for v1): disallow own-hand bets entirely, at the mechanism level, not just by capping stake size.** `WINNER_IS`/`LOSER_HAND_RANK_AT_LEAST`/`FOLD_ORDER` now take `subjectUserIds` (§4) — two *other* seated players' hand outcome — and the server rejects any propose/accept where a subject overlaps a bettor (§5.1). Neither bettor can influence the outcome by how they play, because neither is dealt into the hand being wagered on. `maxStakeBigBlinds` and the per-pair daily cap remain in place as complementary safeguards against this becoming a disguised transfer channel, but they're no longer load-bearing for the misplay-incentive risk specifically — the eligibility check is. This resolves what was previously [§12](#12-open-questions--decisions) item 5 conservatively, per explicit direction, rather than leaving it as a Phase 3 blocker to litigate mid-build. Revisiting to allow own-hand bets later (if ever) would be a deliberate, separately-reviewed decision, not a default.

---

## 11. Implementation Plan

**Phase 0 — Shared contract & catalog** (`packages/realtime-contract`)
Zod schemas for the 4 inbound / 4 outbound message types; `GiftCatalogEntry`/`SideBetCatalogEntry` types; initial catalog arrays from §8/§9. No behavior yet — this is the shared vocabulary both sides build on.

**Phase 1 — Data model & money movement**
Prisma migration for `PlayerInteraction` + enum + `BalanceTransaction.type` additions. `CashierService.debitUser`/`creditUser` primitives. `PlayerInteractionService.sendGift` only (simplest path, no accept/resolve flow, no lifecycle state machine) — validates the money rail end-to-end before side bets add the hold/CAS/resolution complexity from [§5.2](#52-money-movement-a-reservation-not-a-premature-transfer)–[§5.4](#54-resolution-durability).

**Phase 2 — Ship Gifts (v1)**
`PokerRoomMessageRouter` `SEND_GIFT` handler, seated-players-only authorization, and the per-pair daily aggregate cap check (§10) — all launch-scope, not deferred. Client dispatch + store + Gift tab on `PlayerHistoryPopup`. `GiftToast` atmosphere effect. Ship gifts alone first — lower risk, validates the whole pipe (contract → room → service → Cashier → broadcast → store → UI) before side bets build on top of it.

**Phase 3 — Side bets core (scope limited to the four §9 v1 entries)**
`proposeSideBet`/`respondSideBet`/`cancelSideBet` with the CAS-guarded transitions and `getSpendableCents`-based balance checks from §5.2, `maxStakeBigBlinds` enforcement, the per-pair daily cap, seated-players-only authorization, the subject-eligibility check (`subjectUserIds` disjoint from bettors and dealt into the target hand — §5.1/§10), and a 30-second offer TTL — all launch-scope. **Includes a required audit of every existing `CashierService`/`EconomyRouter` balance-check path (buy-in, cash-out, tournament register/rebuy) to route through `getSpendableCents` instead of raw `bankrollCents`** — this is what keeps the reservation model from being silently bypassed by an unrelated code path (§5.2); treat it as a blocking task for this phase, not a follow-up. `SideBetConditionEvaluator` with only the four implemented predicates (`WINNER_IS`, `LOSER_HAND_RANK_AT_LEAST`, `REACHED_SHOWDOWN`, `FOLD_ORDER`). `resolveSideBetsForHand` hooked into the hand-history persistence step, plus the reconciliation sweep from §5.4 — both required before this phase is considered done, not just the hook. `SIDE_BET_OFFER`/`SIDE_BET_UPDATE`/`SIDE_BET_RESOLVED` messages. Bet tab on `PlayerHistoryPopup`, `SideBetOfferBanner`, resolution toast.

**Phase 4 — Additional predicates & session bets, added on demand**
New `condition.kind` values (`POT_SIZE_AT_LEAST`, `BOARD_SUIT_MAJORITY`, `BOARD_HAS_PAIR`, `ALL_IN_OCCURRED`) and their catalog entries, each added only when picked up as real work, not pre-built speculatively. `SESSION_STACK_RACE` (Stack Duel) with a lightweight hands-remaining counter.

**Phase 5 — Honor Bet & polish**
`MANUAL` condition + mutual-confirm flow for Honor Bet — gated on its own risk review per §10, not bundled into the Phase 3 launch. Refined gift/bet animations in `StageAtmosphere`. (No side-bet rake planned — see §10/§12; revisit only if usage data supports it, not scheduled here by default.)

---

## 12. Open Questions & Decisions

**Decided:**

1. **Rake on side bets: no, for v1.** Adds payout/accounting complexity without validating the feature first. Revisit only if usage data supports it — not a default later phase.
2. **Offer TTL: 30 seconds**, not 60 — poker state (and thus a bet's relevant window) changes quickly, so a shorter offer window keeps `SIDE_BET_OFFER`s meaningful. Expiry runs through the same reconciliation sweep as §5.4, not just a client-side countdown, so an expired-but-unswept offer still resolves correctly.
3. **Seated players only** for both Gifts and Side Bets in v1 — no rail-bird/spectator gifting or betting. Simpler authorization surface, and removes an entire class of "is this really the same table experience" edge cases.
4. **Caps ship at launch, not Phase 5**, set conservatively as v1 starting values (tune up later from real usage, not down from an incident):
   - `maxStakeBigBlinds`: **5 BB** default across all Phase 3 catalog entries. Low enough that a side bet can't dominate a typical pot (often 10–30+ BB by showdown), so it can't rationally override hand-play incentives even before the own-hand restriction (item 5) is factored in.
   - Per-pair daily aggregate ceiling: **20 BB-equivalent** (at the relevant table's current BB, gifts valued at cost + side-bet stakes summed) combined across both features, per ordered pair, per rolling 24h. Deliberately anchored below a typical buy-in (often 40–100 BB) — no single day's gifting-plus-betting between two players should be able to functionally substitute for a buy-in transfer.
   - Both are config, not architecture — easy to raise later once the feature has real usage data behind it; starting low is the conservative default, not a permanent ceiling.
5. **Own-hand side bets: disallowed in v1, at the mechanism level.** Resolved conservatively per explicit direction rather than left as a Phase 3 blocker — see the dedicated paragraph in [§10](#10-economy-integrity--anti-abuse) and the `subjectUserIds` mechanism in [§4](#4-realtime-contract)/[§5.1](#51-message-handling). Neither bettor may be a subject of a hand-outcome bet; `maxStakeBigBlinds`/the daily cap remain as secondary safeguards, not the primary defense.

**Still open:**

- Should own-hand bets ever be allowed later (e.g. restricted to predicates neither bettor can materially influence, like a whole-hand `REACHED_SHOWDOWN`-style condition rather than `FOLD_ORDER`)? Not a launch blocker — v1 ships without them; revisit only as a deliberate, separately-reviewed follow-up if there's real demand.
