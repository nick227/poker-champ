# Tournament Bust-Out & Lifecycle UX — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correctly handle tournament bust-outs (freezeout and rebuy), winner resolution UX, lobby visibility, and an accessible rules/status sheet.

**Architecture:** Fix the status-strip stale-state bug first, then extend server reconciler + snapshot `tournamentViewer` for elimination/rebuy/winner states, expose player-aware fields on `TournamentSummary`, and wire client overlays, lobby CTAs, and a rules sheet modal.

**Tech Stack:** TypeScript, React Native (Expo), Colyseus/PokerRoom, Prisma, Vitest integration tests

**Design doc:** `docs/plans/2026-05-23-tournament-bust-out-design.md`

---

## Phase 1 — Fix stuck "DEALING NEXT HAND…" (critical bug)

### Task 1: Status strip tournamentStatus deps

**Files:**
- Modify: `apps/client/src/features/table-page/useLiveTableStatusStripState.ts`
- Test: `apps/client/src/features/table-page/useLiveTableStatusStripState.test.ts` (create if missing)

**Step 1:** Add failing test — when `tournamentStatus` changes from `RUNNING` to `FINISHED` while phase is `betweenHands`, message becomes `TOURNAMENT_FINISHED_COPY`.

**Step 2:** Add `rawInputs.tournamentStatus` to the `useMemo` deps array (line ~503).

**Step 3:** In `resolveDerivedState`, when `tournamentViewer`-style elimination is not yet available, also treat `tournamentStatus` terminal states as **no spinner**.

**Step 4:** Run client tests, commit.

---

### Task 2: Terminal status strip messages for elimination

**Files:**
- Modify: `apps/client/src/features/table-page/useLiveTableStatusStripState.ts`
- Modify: `apps/client/src/features/table-page/useTableSceneSlots.tsx` — pass `tournamentViewer` from snapshot into status strip inputs

**Step 1:** Extend `LiveTableStatusInputs` with optional `tournamentViewer`.

**Step 2:** Message priority in `betweenHands`:
1. Terminal tournament status → "Tournament complete"
2. `tournamentViewer.isEliminated` → "You were eliminated"
3. `tournamentViewer.rebuyPending` → "Rebuy available"
4. Default → "Dealing next hand…"

**Step 3:** Tests + commit.

---

### Task 3: Snapshot tournamentViewer for seated winner

**Files:**
- Modify: `apps/server/src/engine/dealer/hand/SnapshotService.ts`
- Modify: `packages/realtime-contract/src/table.ts` — add optional `isWinner`, `rebuyPending`, `rebuysRemaining`, `rebuyWindowClosesAtTs`
- Test: server snapshot unit test or extend integration test

**Step 1:** When building hero section for tournament tables, query registration regardless of seated state.

**Step 2:** Set `isEliminated: finishPlace != null && finishPlace > 1`, `isWinner: finishPlace === 1 && overlay.status === "FINISHED"`.

**Step 3:** Regenerate SDK types if needed (`pnpm sdk:generate` or project equivalent).

**Step 4:** Run server tests, commit.

---

## Phase 2 — Freezeout elimination UX polish

### Task 4: TournamentResultBanner freezeout copy

**Files:**
- Modify: `apps/client/src/features/table/components/table/TournamentResultBanner.tsx`
- Modify: `apps/client/src/features/table/components/table/tournament-result.utils.ts`
- Test: `TournamentResultBanner.test.tsx`

**Step 1:** Add `playFormat` prop (from overlay or parent).

**Step 2:** Freezeout eliminated copy: "You were eliminated. This is a freezeout — you cannot re-enter."

**Step 3:** Winner seated path: show overlay when `isWinner` or tournament `FINISHED`.

**Step 4:** Tests + commit.

---

### Task 5: Extend tournament overlay with playFormat

**Files:**
- Modify: `apps/server/src/tournaments/tournament-overlay.ts`
- Modify: `apps/server/src/tournaments/TournamentTableReconciler.ts` — include `playFormat` in overlay
- Modify: `packages/realtime-contract/src/table.ts`

**Step 1:** Add `playFormat`, `maxRebuysPerPlayer`, `rebuyPeriodMinutes` to overlay shape.

**Step 2:** Pass through on overlay updates.

**Step 3:** Commit.

---

## Phase 3 — Rebuy tournament bust handling

### Task 6: Reconciler rebuy-aware bust

**Files:**
- Modify: `apps/server/src/tournaments/TournamentTableReconciler.ts`
- Modify: `apps/server/src/tournaments/tournament-schedule.ts` — helper to compute rebuy window close ts
- Test: `apps/server/src/tests/integration/tournaments-rebuy.integration.test.ts` (new)

**Step 1:** Write failing integration test: REBUY format, player busts within window → no `finishPlace`, player removed from table, tournament stays `RUNNING`.

**Step 2:** In bust loop, if `canRebuyTournament(tournament, { rebuyCount })` → skip `finishPlace` assignment, still remove from table and forfeit chips (or keep balance at 0 — match existing forfeit behavior).

**Step 3:** Test: rebuy via `/buy-in` re-seats player.

**Step 4:** Test: bust after rebuy window → `finishPlace` assigned.

**Step 5:** Commit.

---

### Task 7: Rebuy count helper

**Files:**
- Create: `apps/server/src/tournaments/tournament-rebuy-count.ts`
- Modify: `apps/server/src/engine/economy/CashierService.ts` — use shared helper

**Step 1:** `countTournamentRebuys(tournamentId, userId)` = BUYIN tx count for table (registration uses separate tx type).

**Step 2:** Use in `canRebuyTournament` calls.

**Step 3:** Unit test + commit.

---

### Task 8: Tournament rebuy client UI

**Files:**
- Create: `apps/client/src/features/table/components/table/hooks/useTournamentRebuySheet.ts`
- Modify: `apps/client/src/features/table/components/table/views/useActiveTableSlots.tsx`
- Modify: `apps/client/src/constants/copy.ts`

**Step 1:** Show rebuy sheet when `tournamentViewer.rebuyPending === true`.

**Step 2:** Wire to existing `/buy-in` economy endpoint (same as `EconomyRouter` tournament path).

**Step 3:** On success, rely on snapshot re-seat / join flow.

**Step 4:** Manual QA + commit.

---

### Task 9: Snapshot rebuy pending fields

**Files:**
- Modify: `apps/server/src/engine/dealer/hand/SnapshotService.ts`

**Step 1:** When player has 0 chips / not seated, no `finishPlace`, `canRebuyTournament` true → set `rebuyPending: true`, `rebuysRemaining`, `rebuyWindowClosesAtTs`.

**Step 2:** Integration test assertion + commit.

---

## Phase 4 — Lobby & API

### Task 10: TournamentSummary player-aware fields

**Files:**
- Modify: `apps/server/src/http/openapi.ts` — extend `TournamentSummary`
- Modify: `apps/server/src/http/TournamentsRouter.ts` — map fields in list/detail serializers
- Modify: `apps/client/src/lib/tournament.utils.ts`

**Step 1:** Add `playFormat`, `maxRebuysPerPlayer`, `rebuyPeriodMinutes`, `playerStatus` to schema.

**Step 2:** Compute `playerStatus` from registration `finishPlace` + rebuy eligibility for authenticated user.

**Step 3:** Regenerate SDK types.

**Step 4:** Commit.

---

### Task 11: Lobby CTAs and joined section

**Files:**
- Modify: `apps/client/src/lib/tournament.utils.ts` — `resolveTournamentCta`, `JOINED_VISIBLE_STATUSES`, `formatJoinedTournamentHint`
- Modify: `apps/client/src/features/lobby/components/lobby/JoinedTournamentsSection.tsx`

**Step 1:** Include `FINISHED` in joined section for registered users.

**Step 2:** CTAs:
- `ELIMINATED` + RUNNING → "Spectate" (join as readonly)
- `REBUY_PENDING` → "Rebuy" or "Spectate"
- `FINISHED` → "View Standings"

**Step 3:** Hint text: "Eliminated · freezeout" / "Rebuy available · {countdown}".

**Step 4:** Unit tests in `tournament.utils.test.ts` + commit.

---

## Phase 5 — Rules & status sheet

### Task 12: TournamentRulesSheet component

**Files:**
- Create: `apps/client/src/features/tournaments/components/TournamentRulesSheet.tsx`
- Modify: `apps/client/src/features/table/components/table/TournamentTableBanner.tsx` — info button
- Modify: `apps/client/src/features/tournaments/components/TournamentDetailBody.tsx` — reuse sections

**Step 1:** Bottom sheet / modal with format, status timeline, blinds, payouts, winner rule copy.

**Step 2:** Wire from table banner and detail page.

**Step 3:** Commit.

---

## Phase 6 — Verification

### Task 13: End-to-end verification

**Commands:**
```powershell
pnpm --filter @poker-champ/server test tournaments-m5
pnpm --filter @poker-champ/server test tournaments-rebuy
pnpm --filter @poker-champ/client test tournament
```

**Manual QA checklist:**
- [ ] 2-player freezeout: busted sees elimination overlay; winner sees champion; no eternal "DEALING NEXT HAND…"
- [ ] Busted player lobby: "Spectate" while RUNNING; "View Standings" after FINISHED
- [ ] Rebuy: bust → rebuy prompt → re-enter; after window → elimination
- [ ] Rules sheet accessible from table and detail page

**Commit milestone** (do not push unless instructed).

---

## Execution Order Summary

| Phase | Priority | Delivers |
|-------|----------|----------|
| 1 | P0 | Fixes reported bug |
| 2 | P0 | Clear freezeout messaging |
| 3 | P1 | Rebuy tournaments playable |
| 4 | P1 | Lobby correctness |
| 5 | P2 | Rules transparency |
| 6 | — | Verification |

Phases 1–2 can ship as first milestone (~1 session). Phases 3–5 follow.
