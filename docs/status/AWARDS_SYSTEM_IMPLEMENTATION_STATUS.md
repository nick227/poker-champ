# Awards System Implementation Status

Phase 1 (Foundation and lessons) and Phase 2 (in-game and lifetime hand awards) are **complete**. Aligns with [AWARDS_SYSTEM_IMPLEMENTATION_PLAN.md](../roadmaps/AWARDS_SYSTEM_IMPLEMENTATION_PLAN.md) and [AWARDS_INVENTORY.md](../roadmaps/AWARDS_INVENTORY.md).

## Phase 1 — Complete

### Backend

| Item | Status | Location |
|------|--------|----------|
| Award catalog (lesson awards only) | Done | `src/awards/awardCatalog.ts` |
| AwardGrant / BulkGrantResult types | Done | `src/awards/types.ts` |
| AwardService (bulkGrant, getUserAwards, getEarnedAwardIds) | Done | `src/awards/AwardService.ts` |
| AwardGrantEvent (trigger-scoped idempotency) | Done | Prisma + AwardService |
| UserCurriculumProgress | Done | Prisma + LessonsRouter upsert on completion |
| evaluateLessonAwards (pure) | Done | `src/awards/evaluateLessonAwards.ts` |
| Lesson completion grant + awardsGranted in response | Done | `src/http/LessonsRouter.ts` (step submit) |
| GET /api/awards/catalog | Done | `src/http/AwardsRouter.ts` |
| GET /api/awards/me (join catalog, sort, missing → log.warn) | Done | `src/http/AwardsRouter.ts` |

### Client

| Item | Status | Location |
|------|--------|----------|
| AwardToaster (two-column; first full, "+N more") | Done | `apps/client/src/components/domain/awards/AwardToaster.tsx` |
| Sort by tierWeight → priorityWeight → awardId | Done | AwardToaster + GET /me |
| Lesson submit → read awardsGranted → show toaster | Done | useLessonSession + LessonContent (completion view) |
| Settings > Awards (group by category, empty state) | Done | `apps/client/src/components/domain/settings/AwardsSection.tsx` + settings.tsx |
| AwardGrant type + parseGraphic | Done | `apps/client/src/types/awards.ts`, `apps/client/src/services/awards.service.ts` |

### Data

| Item | Status |
|------|--------|
| UserAward (userId, awardId, catalogVersion, earnedAt, lastEarnedAt, count, reason, contextType, contextId) | Done |
| AwardGrantEvent (userId, awardId, triggerKey) unique | Done |
| UserCurriculumProgress (userId, completedLessonsCount) | Done |
| Migration applied | Done (`20260301120000_add_awards_and_curriculum_progress`) |

### Phase 1 acceptance criteria (§9 of plan)

- [x] User completes a lesson → lesson_complete_* and possibly first_lesson_ever / module / curriculum / lesson_perfect / lesson_first_try granted.
- [x] GET /api/awards/me returns user's awards with reason, earnedAt, lastEarnedAt, count, contextType, contextId (catalog joined in memory).
- [x] bulkGrant returns BulkGrantResult (granted, skipped); LessonsRouter returns only result.granted as awardsGranted[].
- [x] Client shows two-column toaster from granted set only, sorted by tierWeight → priorityWeight (→ awardId). First full; "+N more awards earned" when multiple.
- [x] Settings > Awards grouped by category, sort by tierWeight within category. Missing awardId in catalog → skip display and log.warn.
- [x] ONE_TIME: single row per (userId, awardId), count=1. REPEATABLE: single row, count and lastEarnedAt updated; AwardGrantEvent for trigger-scoped idempotency.

---

## Phase 2 — Complete (in-game and lifetime hand awards)

### Backend

| Item | Status | Location |
|------|--------|----------|
| UserHandCount model + migration | Done | `prisma/schema.prisma`, `prisma/migrations/20260301180000_add_user_hand_count` |
| Hand/session/lifetime awards in catalog (source TABLE, category VOLUME) | Done | `src/awards/awardCatalog.ts` (HAND_CATALOG) |
| evaluateHandAwards (pure) | Done | `src/awards/evaluateHandAwards.ts` |
| UserHandCount atomic increment (inside bulkGrant tx) | Done | `AwardService.bulkGrant` when `incrementHandCount: true` |
| getEarnedAwardIdsAndHandCounts (single tx snapshot) | Done | `AwardService.getEarnedAwardIdsAndHandCounts` |
| processHandEndAwards (batch load, evaluate, bulkGrant with increment) | Done | `AwardService.processHandEndAwards` |
| SessionPlayerStatsTracker: sessionId (per-user, rotate on rejoin), consecutiveWins, getSessionId | Done | `src/engine/dealer/services/SessionPlayerStatsTracker.ts` |
| Hand-end hook in Dealer (HAND_ENDED → runHandEndedAwards) | Done | `src/engine/Dealer.ts` |
| PokerRoom wires onHandEndedAwards → awardService.processHandEndAwards | Done | `src/rooms/PokerRoom.ts` |

### Client

| Item | Status | Location |
|------|--------|----------|
| useTableAwardsToast (poll 45s, watermark, new awards) | Done | `apps/client/src/hooks/useTableAwardsToast.ts` |
| Table page shows AwardToaster for new awards | Done | `apps/client/src/features/table-page/TablePage.tsx` |

### Data

| Item | Status |
|------|--------|
| UserHandCount (userId, handsDealt, updatedAt) | Done; apply migration `20260301180000_add_user_hand_count` for production/tests with hand-end awards |
| Hand-end awards no-op if UserHandCount table missing | Done (P2010/P2021/1146 caught; tests pass without migration) |

### Phase 2 acceptance

- [x] first_hand_played, first_win, hands_10/50/100 (session), hands_100_life…hands_5000_life, win_streak_2, showdown_win, all_in_win, big_pot_win in catalog and evaluator.
- [x] Hand end: batch load earned + hand counts, atomic increment, evaluateHandAwards per user, bulkGrant.
- [x] Client: at table, poll GET /api/awards/me; show new awards in AwardToaster.

### Tests

- [x] `src/tests/evaluateHandAwards.test.ts` — unit tests for pure evaluator (10 cases).
- [x] Server core tests (test:server:core) pass; hand-end awards skip gracefully when UserHandCount table is missing.

---

## Deferred (later phases)

- **Phase 3:** Clutch/discipline, replay-viewed awards (triggerKey = handId), async grant.
- **Phase 4:** Concept tier awards, engagement (first_week_streak, return_after_7_days, five_sessions_week).
- **Phase 5:** Realtime AWARD_GRANTED, sound/confetti, image pack for graphics, locked awards in Settings.

---

## Notable implementation details

- **lesson_first_try:** REPEATABLE with triggerKey = lessonId (one per lesson).
- **Curriculum progress:** Upsert with current completed count (not increment); backfill-safe.
- **bulkGrant:** Single transaction; preload awardId+id; cap 10 with full-context log; AwardGrantEvent insert-first for REPEATABLE+triggerKey.
- **Observability:** Comment in AwardService for future counters (awards.granted.count, awards.skipped.count, awards.bulk.capped).
- **Phase 2 hand awards:** Session milestones use triggerKey `session_${sessionId}_${threshold}` where sessionId is per-user UUID from SessionPlayerStatsTracker (new id when user (re)joins; resetUser clears). Hand-scoped REPEATABLE use triggerKey = handId. Hand count increment runs inside same bulkGrant transaction (no drift). bulkGrant: dedupe ONE_TIME already earned, then cap to 10, then grant. getEarnedAwardIdsAndHandCounts runs in one transaction (consistent snapshot). Client watermark = max(lastEarnedAt); new = items where lastEarnedAt > watermark. processHandEndAwards catches P2010/P2021/1146 (missing UserHandCount table) and no-ops so tests pass without migration.
