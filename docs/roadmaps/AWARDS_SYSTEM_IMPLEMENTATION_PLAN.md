# Awards System Implementation Plan

Implementation plan for the reward system epic. Reference: [AWARDS_INVENTORY.md](./AWARDS_INVENTORY.md).

## 1. Goals and scope

**Outcomes**
- Users earn awards for completing lessons and in-game accomplishments.
- **Toaster**: Mobile toaster on grant — two columns (graphic | name + reason), tier-based styling (color/glow, optional sound/confetti).
- **Settings**: Awards section grouped by type, sorted by tier (Legendary → Rare → Uncommon → Common).

**In scope**
- Full stack: catalog, grant pipeline, persistence, API, client toaster and Settings UI.
- Graphics: unicode first; design for future image-pack swap.

**Out of scope (for this epic)**
- Leaderboards or social sharing of awards.
- Award-gated content or paywalls.

---

## Critical decisions (locked)

These are fixed before implementation; do not ship without them.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repeatable awards storage | Single row per (userId, awardId) with `count` and `lastEarnedAt` | No unbounded row growth; cleaner queries and Settings UI; simpler idempotency. |
| Toaster when multiple awards at once | **Option A**: Show first award in full; collapse rest into “+N more awards earned” (single follow-up toaster) | Prevents 4–5 toasters in a row (e.g. curriculum + perfect + first try); one primary moment, one summary. |
| Session definition | Session = contiguous play; **starts** at first hand (or table join); **ends** after **30 minutes inactivity** or **explicit table leave** | Engagement awards (streak, active week) depend on this; avoids ambiguity and bugs. |
| Hand-end grant strategy | **Single evaluation pass** → `evaluateHandAwards(handSummary): AwardGrant[]` → `awardService.bulkGrant(userId, awards[])` | One load of user’s earned awards, in-memory evaluation, minimal writes; no 15 separate grant calls per user per hand. |
| Source vs category | **Two axes**: `source: LESSON \| TABLE \| REPLAY \| SYSTEM` and `category: PROGRESSION \| DISCIPLINE \| VOLUME \| CLUTCH \| MASTERY \| …` | Source = where it was earned; category = conceptual group for UI. Future-proofs refactors. |
| Grant endpoints | **Do not expose** grant or bulkGrant publicly; internal only (LessonsRouter, hand-end, replay, cron). | Security and consistency. |

---

## 2. Data model

### 2.1 Award (catalog)

Server-side catalog only (no DB table at first). Define in code/config and optionally seed a table later.

**Versioning**  
Catalog entries include `version: number` (e.g. `1`). Stored in `UserAward.catalogVersion` at grant time for migration and audit. **Display**: UI **always** uses **current** catalog metadata (tier, name, graphic, category) for display. Do not branch on catalogVersion in the UI — otherwise complexity explodes. catalogVersion is for migration tooling only (e.g. backfill or re-tier historical awards).

**Fields**
- `id`: string (e.g. `lesson_complete_L1`, `hands_100_life`).
- `name`: string (display name, e.g. "Position Pin").
- `reasonTemplate`: string with placeholders (e.g. "Completed {lessonTitle}").
- `graphic`: string — **prefixed** so client can resolve without refactor: `emoji:📍` for unicode, `asset:trophy_position_pin` for image packs. Client branches on prefix (e.g. `graphic.startsWith("emoji:")` → render char; `asset:` → load from pack).
- `tier`: `COMMON` | `UNCOMMON` | `RARE` | `LEGENDARY`.
- `tierWeight`: number — **1 | 2 | 3 | 4** (COMMON=1, UNCOMMON=2, RARE=3, LEGENDARY=4). Use for deterministic sort.
- `priorityWeight`: number — **numeric priority for toaster “first award” ordering**. Stored in catalog, not implicit string logic. Example scale: curriculum_done 100, module_*_done 90, lesson_complete_* 80, milestone repeatable 50, minor repeatable 10. Sort: tierWeight desc → priorityWeight desc → sourceWeight (optional). Prevents bikeshedding when new awards are added.
- `earnType`: `ONE_TIME` | `REPEATABLE`.
- `source`: `LESSON` | `TABLE` | `REPLAY` | `SYSTEM` — where the award is earned (trigger origin).
- `category`: conceptual group for Settings (e.g. `PROGRESSION`, `DISCIPLINE`, `VOLUME`, `CLUTCH`, `MASTERY`, `ENGAGEMENT`). Distinct from source so UI can group by category and later filter by source.

Client can receive a minimal catalog from API (id, name, graphic, tier, tierWeight, priorityWeight, source, category, version).

### 2.1.1 AwardGrant shape (cross-layer contract)

**Locked type** — used by bulkGrant result.granted, LessonsRouter awardsGranted[], and client toaster. Do not have the client reconstruct from catalog (avoids double lookup and drift).

```ts
type AwardGrant = {
  awardId: string
  name: string
  graphic: string
  tier: 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY'
  tierWeight: number
  priorityWeight: number
  reason: string
  contextType?: 'LESSON' | 'HAND' | 'REPLAY' | 'SESSION'
  contextId?: string
}
```

**Rules**
- This is what **bulkGrant** returns in `result.granted`.
- This is what **LessonsRouter** returns as `awardsGranted`.
- **Client toaster** consumes this directly (sort by tierWeight → priorityWeight, render graphic | name + reason). Do not make the client look up name/graphic/tier from catalog again.

### 2.2 UserAward (persistence)

**Table: `UserAward`**  
Single row per (userId, awardId). For ONE_TIME awards, `count` stays 1. For REPEATABLE, increment `count` and update `lastEarnedAt` on each grant.

- `id`: CUID.
- `userId`: FK → User.
- `awardId`: string (references catalog id).
- `catalogVersion`: number — catalog version at time of first grant. Used for safe migration when catalog changes (rename, tier, category).
- `earnedAt`: DateTime — **first** earned (for display and sort).
- `lastEarnedAt`: DateTime — last time earned (for repeatable; equal to earnedAt for one-time).
- `count`: int, default 1. ONE_TIME → always 1; REPEATABLE → incremented each grant. **Overflow**: Prisma `Int` (32-bit signed, max ~2.1e9) is sufficient for repeatables (e.g. showdown_win, hands_10); no change needed, just confirm column type.
- `reason`: string — resolved reason at **last** grant (for toaster/history). For **repeatable milestone** awards (e.g. replays_5, replays_25), the evaluator must compute reason per increment (“Watched 5 replays”, “Watched 25 replays”); do not rely on a single static template.
- `contextType`: `LESSON` | `HAND` | `REPLAY` | `SESSION` | null — type of context for “View lesson” / “View hand” links.
- `contextId`: string | null — e.g. lessonId, handId, so client can link award → replay or lesson.
- `contextJson`: optional JSON — extra payload (e.g. potBb, snapshotId) for debugging or future features.

**Unique index**: `(userId, awardId)`.

**Indexes**
- `(userId, awardId)` for “has user earned this” and upsert-by-award.
- `(userId, earnedAt)` and/or `(userId, lastEarnedAt)` for Settings list and “recent” queries.

**Grant semantics**
- **ONE_TIME**: If no row exists, insert with count=1, earnedAt=now, lastEarnedAt=now, reason, contextType, contextId. If row exists, no-op.
- **REPEATABLE**: If no row exists, insert with count=1. If row exists, **atomic increment only**: `prisma.userAward.update({ data: { count: { increment: 1 }, lastEarnedAt: now, reason, ... } })`. **Never** read count in JS, add 1, then write — that causes race conditions when two triggers fire near-simultaneously (replay + session flow). Prisma’s `{ increment: 1 }` is a single atomic UPDATE.

### 2.3 Replay (and other trigger-scoped) idempotency

For awards that are granted “per hand” or “per replay view,” **do not** create multiple UserAward rows. Use a separate idempotency store so the same hand/replay does not grant twice.

**Option A — AwardGrantEvent table (recommended)**  
- `userId`, `awardId`, `triggerKey` (e.g. `hand:${handId}` or `replay:${handId}`), `earnedAt`.
- **Compound unique index: (userId, awardId, triggerKey)** — in that order.
- **Concurrency-safe pattern (locked)**: Do **not** “check AwardGrantEvent in JS, then insert.” Two concurrent triggers (hand-end, replay, session cron) can race. Instead: **attempt insert AwardGrantEvent first**; if insert succeeds, then increment UserAward; if insert fails with **unique violation**, skip (treat as already granted for this trigger). Use explicit error classification: `try { await tx.awardGrantEvent.create(...) } catch (e) { if (isUniqueViolation(e)) skip; else throw }`. Do not rely on catching “any” Prisma error without classifying. This makes replay idempotency truly safe under concurrency.

**Replay awards — required**  
For replay awards, **triggerKey must include handId**. Unique constraint effectively (userId, awardId, handId). Prevents rapid open/close replay spam and duplicate grants.

**AwardGrantEvent scope and growth**  
Use AwardGrantEvent **only for trigger-scoped idempotency** (replay handId, handId-based clutch if any). **Do not** log events for session milestones or non-trigger awards (e.g. hands_100_life, first_week_streak). That keeps the table from exploding. **Enforcement**: This rule will get violated in practice if only documented — enforce at **code review** (e.g. checklist: “AwardGrantEvent used only for triggerKey-based idempotency”). Optionally add a TTL or retention policy later. Lesson completion is already idempotent per attempt/step; no triggerKey there.

---

## 3. Backend

### 3.0 Implementation rules (critical)

Before coding, enforce:

| Rule | Requirement |
|------|-------------|
| **Repeatable increment** | Use Prisma `update({ data: { count: { increment: 1 } } })`. Never read count in JS, add 1, then write. |
| **bulkGrant transaction** | All writes (UserAward upserts, AwardGrantEvent inserts) inside `prisma.$transaction(async (tx) => { ... })` per user. |
| **Lesson evaluation order** | Call evaluateLessonAwards only **after** attempt + mastery + lesson completion are committed in LessonsRouter. |
| **evaluateHandAwards pure** | No DB inside evaluator. Caller passes earnedAwardIds, lifetimeHands, sessionHands, streak state; returns AwardGrant[]. |
| **Replay non-blocking** | Send replay response first; then fire award grant asynchronously. Do not await grant. |
| **AwardGrantEvent scope** | Only for trigger-scoped idempotency (replay handId, handId clutch). Not for session or volume milestones. |
| **bulkGrant minimal read** | Inside transaction load only `select: { awardId: true }` (and count if needed). Do not load reason, contextJson, timestamps. Keeps hand-end cheap. |
| **Hand-end no N+1** | Preload earnedAwardIds for all users in the hand **once** at start of HAND_ENDED loop (e.g. batch query or Map<userId, Set<awardId>>), or let bulkGrant do **one** read per userId inside its transaction. Never read per award. |
| **Curriculum completion** | Do not query “all lessons completed?” with 12 row checks in evaluator. Precompute **total completed lessons count** for user or maintain **UserCurriculumProgress** aggregate (e.g. one row per user). Evaluator reads that. |
| **Engagement day = UTC** | Use **UTC** explicitly for “calendar day.” `new Date().toISOString().slice(0,10)` or proper UTC day. Never server local time — infra region change would break. |
| **AwardGrantEvent index order** | Index **(userId, awardId, triggerKey)** — lookup is “for this user + awardId + triggerKey, does it exist?” Order matters for performance. |
| **Repeatable reason** | For milestone repeatables (e.g. 5, 25, 50 replays), evaluator must **compute reason per increment** (“Watched 5 replays”, “Watched 25 replays”). Do not rely on static template alone. |
| **bulkGrant guard** | If `awards.length > 10`: log.error with **full context** (userId, handId if applicable, originalCount, cappedTo: 10, awardIds: awards.map(a => a.awardId)), then **hard cap** `awards = awards.slice(0, 10)`. Otherwise debugging is impossible. |
| **Toaster first-award order** | Sort by **catalog fields**: tierWeight desc → **priorityWeight** desc → source (e.g. LESSON before TABLE). Use numeric priorityWeight in catalog; do not hardcode “curriculum_done before lesson_complete” in app logic. |
| **bulkGrant return contract** | Return **only actually granted** awards. Type: `BulkGrantResult = { granted: AwardGrant[]; skipped: string[] }`. Each item in `granted` is full **AwardGrant** shape (§2.1.1). LessonsRouter and client use result.granted only; client does not reconstruct from catalog. |
| **bulkGrant concurrency** | For REPEATABLE + triggerKey: **attempt insert AwardGrantEvent first**; on unique violation skip; else increment UserAward. Do **not** check AwardGrantEvent in JS then insert. Use try/catch and `isUniqueViolation(e)` so hand-end, replay, and cron can run concurrently without double-grant. |
| **Hand-end preload** | One query: `findMany({ where: { userId: { in: userIds } }, select: { userId: true, awardId: true } })`; build Map<userId, Set<awardId>>. Do **not** call getEarnedAwardIds per user. |
| **/me sorting** | Do **not** store tier or priorityWeight in UserAward; do **not** sort by tier in DB. Always join with catalog in memory; catalog is source of truth for tier and priorityWeight. |
| **Display catalog** | UI always uses **current** catalog (tier, name, graphic). catalogVersion is for migration only. |

### 3.1 Award catalog

- **Location**: e.g. `src/awards/awardCatalog.ts` (or `packages/shared` if client needs same list).
- **Content**: Array or map of award definitions from [AWARDS_INVENTORY.md](./AWARDS_INVENTORY.md); each entry includes `version`, `tierWeight`, `priorityWeight`, `source`, `category`. Export by id and by category/source.
- **Reason resolution**: Helper `resolveReason(template, params)` (e.g. `{ lessonTitle }`, `{ conceptName }`) — can live in catalog module or a small util; not inside AwardService.

### 3.2 Award service (catalog + persistence only)

- **Location**: e.g. `src/awards/AwardService.ts`.
- **Rule**: AwardService **must not** contain poker logic, lesson logic, or “should we grant this?” logic. It only: reads catalog, writes/reads UserAward (and AwardGrantEvent), and performs bulkGrant. All evaluation logic lives **outside** (e.g. `evaluateLessonAwards`, `evaluateHandAwards`).

**Dependencies**: Prisma (UserAward, AwardGrantEvent), catalog, logger.

**Methods**
- `grant(userId, awardId, params?)`: resolve reason from catalog, check one-time already earned (or triggerKey for repeatable); insert/update UserAward (use `count: { increment: 1 }` for repeatable); optionally insert AwardGrantEvent for triggerKey; return `{ granted, reason }`. Uses catalog version at grant time for `catalogVersion`.
- `bulkGrant(userId, awards[], context?: { handId?: string })`: **Transactional.** Returns **`BulkGrantResult`**:
  - **Type**: `{ granted: AwardGrant[], skipped: string[] }` — `granted` = actually inserted/incremented in this call; `skipped` = awardIds skipped (already earned or duplicate trigger). LessonsRouter and client use **only** `result.granted` for awardsGranted[] and toaster; do not rely on evaluator list.
  - All writes inside `prisma.$transaction(async (tx) => { ... })`. **Minimal read**: load only `select: { awardId: true }` (and count if needed). Do not load reason, contextJson, timestamps.
  - **Guard**: If `awards.length > 10`, log.error with full context (userId, handId, originalCount, cappedTo: 10, awardIds); then `awards = awards.slice(0, 10)`.
  - **Per-candidate (deterministic under concurrency)**: Load earnedAwardIds (minimal select) once inside transaction. For each candidate: **ONE_TIME** and already exists → skip. **REPEATABLE + triggerKey**: **attempt insert AwardGrantEvent first**; if insert fails with **unique violation** (use `isUniqueViolation(e)`), skip; else insert/update UserAward (atomic increment) and push full **AwardGrant** (awardId, name, graphic, tier, tierWeight, priorityWeight, reason, contextType?, contextId?) to `granted`. Do **not** “check AwardGrantEvent in JS, then insert” — that races with concurrent triggers. Rely on unique constraint and catch only unique violation; rethrow other errors.
- `getUserAwards(userId, options?)`: list UserAward for user (optional: by category/source, limit, cursor). **Do not sort by tier in DB** — UserAward does not store tier. Join with catalog in memory and sort by catalog tierWeight desc → priorityWeight desc → lastEarnedAt desc.
- `getEarnedAwardIds(userId)`: set of awardIds user has earned (for evaluators to avoid redundant checks).

**Idempotency**: ONE_TIME = unique (userId, awardId). REPEATABLE with trigger (e.g. replay) = AwardGrantEvent unique (userId, awardId, triggerKey); only then upsert UserAward (atomic increment, update lastEarnedAt).

**Observability (counters)**  
Emit simple counters so you can see if evaluators are noisy, the hard cap is firing, or something is broken. Cost is negligible; signal is high.

- **awards.granted.count** — increment per award actually granted (each push to `granted` in bulkGrant, or single grant).
- **awards.skipped.count** — increment per award skipped (already earned or duplicate trigger).
- **awards.bulk.capped** — increment when bulkGrant applies the hard cap (awards.length > 10).

Use your existing metrics pipeline (e.g. statsd, OpenTelemetry, or logger that aggregates). These will show evaluator noise, cap frequency, and grant health at a glance. **If the team does not have a clearly established pattern** for emitting or aggregating counters, **define one as part of this epic** (e.g. where counters are emitted, how they are exported or queried) so implementation is not ambiguous and the counters are actually usable.

### 3.3 Grant triggers (evaluators call AwardService)

| Trigger | When | Where | Evaluator | Awards |
|--------|------|--------|-----------|--------|
| Lesson step submit (completion) | **After** attempt persisted, mastery updated, lesson completion committed | `LessonsRouter` POST submit step handler — **after** attempt + mastery committed | `evaluateLessonAwards(userId, attempt, lesson, completedLessonCount?)` → list; then bulkGrant. Use **precomputed completed-lesson count** (or UserCurriculumProgress) for curriculum_done; do not query “all 12 completed?” with 12 row checks. Return `awardsGranted[]` in response. | Lesson completion (L1–L12), first_lesson_ever, module_A/B/C_done, curriculum_done, lesson_sharp, lesson_perfect, lesson_clinician, lesson_first_try |
| Hand end | After hand finalized, payouts and hand history written | After HAND_ENDED; one evaluation pass per user in hand | **Pure**: `evaluateHandAwards(handSummary, sessionState, earnedAwardIds, lifetimeHands, sessionHands, streakState)` → AwardGrant[]; no DB in evaluator. Then `bulkGrant(userId, list)`. | first_hand_played, first_win, win_streak_2, showdown_win, all_in_win, big_pot_win, session hands (10/50/100), session_vpip_tight, session_pfr_aggressive, clutch, discipline, lifetime hands (100/500/1000/5000) |
| Replay viewed | When user opens replay for a hand | Replay API or “replay viewed” endpoint; idempotent by (userId, awardId, handId) | Evaluator + triggerKey=handId. **Non-blocking**: fire grant after sending replay (do not await before response). | first_replay, replays_5, replays_25, replay_self_loss, replay_big_pot |
| Session / engagement | On login or daily job; uses **session** definition below | Cron or session-start hook | Evaluate last played, consecutive days, sessions in 7 days | first_week_streak, return_after_7_days, five_sessions_week |
| Concept mastery | After mastery update from lesson step | After `updateMasteryForStep` in LessonsRouter | Query UserConceptMastery; evaluate tiers; grant | concept_first_mastery, concept_aware, concept_student, concept_thinker, concept_strategist, biggest_leak_viewed |

**Hand-end: no grant explosion; pure evaluator; no N+1**  
Do **not** call `grant` 15 times per user per hand. Flow:

1. **Preload once — explicit (avoid N+1)**: At start of HAND_ENDED loop, **one query** for all users in the hand:
   - `const rows = await prisma.userAward.findMany({ where: { userId: { in: userIds } }, select: { userId: true, awardId: true } })`
   - Build **`Map<userId, Set<awardId>>`** from rows (group by userId, collect awardIds). Also load lifetimeHands, sessionHands, streak state per user in batch. Build `handSummary` and per-user `sessionState`.
   - **Do not** call `getEarnedAwardIds(userId)` inside the per-user loop — that would reintroduce N+1.
2. For each user: `evaluateHandAwards(handSummary, sessionState, earnedAwardIds, lifetimeHands, sessionHands, streakState)` → **pure** `AwardGrant[]`. No DB inside evaluator.
3. For each user: **one** call `awardService.bulkGrant(userId, awards)` (transactional; minimal read inside; atomic increment).

**Implementation order**  
1. Lesson completion: UserCurriculumProgress increment on first completion (LessonsRouter); then evaluateLessonAwards + bulkGrant; return result.granted as awardsGranted.  
2. Lifetime hand count (atomic increment; §3.5).  
3. Hand-end (evaluateHandAwards + bulkGrant with BulkGrantResult).  
4. Replay (idempotent by handId; void bulkGrant().catch with alert or retry).  
5. Engagement (session definition, UTC days, return_after_7_days triggerKey per gap; cron/on-login).  
6. Concept tiers (after mastery update).

### 3.4 UserCurriculumProgress (completed-lesson count)

- **Purpose**: curriculum_done and module_*_done evaluators need “how many lessons has this user completed?” without 12 row checks. Precompute.
- **Table**: `UserCurriculumProgress` — `userId`, `completedLessonsCount` (int), `updatedAt`.
- **Write path (locked)**: **Increment inside LessonsRouter** when a lesson is completed **for the first time** (i.e. first COMPLETED attempt for that lessonId for this user). After attempt status is set to COMPLETED and persisted, check if this is the user’s first completion for this lesson; if yes, atomic `UPDATE UserCurriculumProgress SET completedLessonsCount = completedLessonsCount + 1 WHERE userId = ?` (with insert-if-missing). Do **not** derive count on read from LessonAttempt (that would re-introduce N queries). Evaluator reads `completedLessonsCount` (or a single row) to decide curriculum_done / module_A/B/C_done.
- **Backfill (if data exists pre-launch)**: If users already completed lessons before this system launches, **on first lesson completion post-launch** detect missing `UserCurriculumProgress` row and **initialize count from historical LessonAttempt** (one-time backfill: e.g. `COUNT(DISTINCT lessonId) WHERE userId = ? AND status = 'COMPLETED'`). Then apply the increment for the current lesson. Otherwise curriculum_done could misfire (e.g. user had 12 completed, no row, first new completion would set count=1). Not required for MVP if the system is brand new with no prior LessonAttempt data; document and implement when historical data exists.

### 3.5 Lifetime hand count

- **Requirement**: Grinder I/II/III, Iron Volume need “lifetime hands dealt” per user.
- **Storage**: Table `UserHandCount` (userId, handsDealt). Single row per user.
- **Update**: **Atomic increment only.** On hand end (after finalizePersistedHand), for each user dealt in the hand:
  - `UPDATE UserHandCount SET handsDealt = handsDealt + 1 WHERE userId = ?` (with insert-if-missing, e.g. upsert or raw increment).
- **Do not**: read count, add 1, then write. That causes race conditions across multiple rooms or concurrent hands.

### 3.6 Session definition (for engagement awards)

**Session** = contiguous play.

- **Starts**: At first hand (or table join with intent to play).
- **Ends**: After **30 minutes of inactivity** (no hand played, no action), or on **explicit table leave**.

Use this definition for “sessions in 7 days” and “consecutive days played.” **Implementation note**: “Persist last activity timestamp” is underspecified — the server does not know 30 minutes passed if the user just closes the tab. You likely need a **heartbeat** (e.g. periodic ping while in table) or **session-closed inference** from next login (e.g. “last session ended at lastHandAt or disconnect”). Define that when implementing engagement awards; it affects accuracy.

**Reader note — engagement phase risk**: This is a **documented deferral**, not a small detail. **Engagement award accuracy is genuinely unknown** until the session-end/heartbeat work is scoped and implemented. The engagement phase may surface a **non-trivial implementation problem** (e.g. new heartbeat contract, storage for session boundaries, or backfill of historical “last activity” from existing tables). Anyone reading this plan should treat the engagement phase as potentially scope-changing, not just “fill in the blanks.”

**Engagement edge rules (locked)**  
- **Day boundary = UTC only.** Use **UTC** explicitly. Never server local time. Use `new Date().toISOString().slice(0,10)` for “today” or proper UTC day calculation. **Consecutive days / streak**, **active week**: UTC calendar dates only. Never client time.
- **return_after_7_days — exact rule**: Triggers when **(today_utc - lastActivityDate_utc) ≥ 7 days**. ONE_TIME per return gap; does not stack; does not grant repeatedly within the same gap. **Concrete triggerKey (locked)**:
  - `triggerKey = "return:" + lastActivityDateUTC` (e.g. `return:2025-02-15`)
  - where **lastActivityDateUTC** = UTC date string of **last session start** (e.g. `new Date(lastSessionStart).toISOString().slice(0,10)`).
  - Same gap (same lastActivityDate) won’t grant twice; a **different** future gap (different lastActivityDate after next return) can grant again. Without this, the award would effectively become permanent ONE_TIME and never fire again after the first return.
  - **Edge**: User plays Day 1, then Day 9 → grant return_after_7_days and that return **breaks** any “consecutive days” streak (streak = consecutive UTC calendar days with activity).

### 3.7 Notifying the client (toaster)

- **Lesson submit**: Return `awardsGranted[]` in the submit response (see §4.1). Client shows toaster from that; no extra round-trip. Still support polling `/me` for table and Settings.
- **Option B (later)**: Realtime `AWARD_GRANTED` on user channel for instant table/replay toaster.

---

## 4. API

### 4.1 Routes

- `GET /api/awards/catalog` — list award definitions (id, name, graphic, tier, tierWeight, source, category, version) for Settings and toaster. Optional: auth for future gating.
- `GET /api/awards/me` — list user’s earned awards. **Sorting**: Do **not** store tier (or priorityWeight) in UserAward; do **not** sort by tier in DB. **Always join with catalog in memory** (server-side when building response, or client-side when rendering). Catalog is source of truth for tier and priorityWeight. Return rows with earnedAt, lastEarnedAt, count, reason, contextType, contextId; server or client merges with catalog and sorts by tierWeight desc → priorityWeight desc → lastEarnedAt desc. **Scale**: Join-in-memory is fine for typical users; if a user has **hundreds** of earned awards and the catalog is large, re-evaluate when adding pagination (e.g. avoid loading full catalog per request or paginate before join). Optional `?category=`, `?source=`, plus **pagination** (see §4.2).
- **LessonsRouter submit response**: Return `awardsGranted: AwardGrant[]` in the lesson step submit response. Use **bulkGrant result.granted** only (not the evaluator candidate list). Client sorts by tierWeight → priorityWeight and shows toaster from granted set. Polling /me still supported for table and Settings.
- **Do not expose** grant or bulkGrant. All grants are internal only (LessonsRouter, hand-end, replay API, engagement job).

### 4.2 OpenAPI

- **Schemas**: `Award` (id, name, graphic, tier, tierWeight, priorityWeight, source, category, version); `UserAward` (…); **`AwardGrant`** per §2.1.1 (awardId, name, graphic, tier, tierWeight, priorityWeight, reason, contextType?, contextId?); `BulkGrantResult` (granted: AwardGrant[], skipped: string[]).
- **GET /awards/catalog**: Response envelope (e.g. `{ awards: Award[] }`). Document.
- **GET /awards/me**: Response envelope, **pagination**, and **error shapes** (401, 500). Document so frontend/backend stay aligned.
  - **Pagination shape (locked)** — avoid frontend/backend friction: use **cursor-based** pagination (not offset). **Request**: `?limit=50&cursor=<opaque>`. **Response**: `{ items: UserAwardEnriched[], nextCursor: string | null }`. **Cursor**: opaque token encoding the position (e.g. based on sort key: `lastEarnedAt` + `awardId` for stable ordering). Server: apply sort (tierWeight → priorityWeight → lastEarnedAt desc → awardId), then take `limit` items after cursor; return nextCursor if more exist. Specify cursor format in OpenAPI (e.g. base64-encoded or opaquely generated) so both sides agree.
- Do not document grant endpoints.
- **Future /me guard**: When rendering /me, if an awardId is not in the current catalog (e.g. award removed or renamed), **skip that row in display** and log.warn. Prevents Settings page break if catalog is soft-changed later. No need to solve soft-delete fully now — just handle missing awardId gracefully.

---

## 5. Client

### 5.1 Toaster (two-column, tier-aware)

- **Component**: e.g. `AwardToaster` or extend existing toast component with an “award” variant.
- **Layout**: Graphic (left) | Name + reason (right). Name bold; reason smaller or muted.
- **Tier styling**: Map tier (or tierWeight) to style — Common: subtle border; Uncommon: accent border; Rare: glow + optional sound; Legendary: strong glow + sound + optional confetti. Sort by tierWeight for consistent order.
- **Trigger**: Prefer **awardsGranted[] in lesson submit response** (see §4.1) — fewer network calls, deterministic toaster. Fallback: poll `GET /api/awards/me` and show new since lastSeenEarnedAt. Realtime later.
- **Batching rule (locked)**: When **multiple** awards are granted at once, use **only the granted set** (from bulkGrant result.granted). **Sort** by catalog: **tierWeight** desc → **priorityWeight** desc → source. Use numeric priorityWeight from catalog; do not hardcode award ids in sort logic.
  - Show **first award** (after sort) in full (graphic | name + reason), tier-styled.
  - Show **one** follow-up toaster: “+N more awards earned” with no per-award detail. Do **not** show 4–5 separate toasters in a row.
- **Placement**: Reuse existing toast container (e.g. top or bottom); ensure it doesn’t block lesson half-sheet or table actions.

### 5.2 Settings > Awards section

- **Location**: New section in `apps/client/app/settings.tsx` (or a dedicated `AwardsSection` component).
- **Data**: `GET /api/awards/me` (and optionally catalog from same API or static).
- **Exact sort order**: **First group by category** (from catalog, joined in memory). **Within each category**, sort by **tierWeight** desc → **priorityWeight** desc → lastEarnedAt desc. **Do not** sort by tier in DB or store tier in UserAward; catalog is source of truth. **Not** global sort then group — that would reshuffle across categories and look wrong.
- **UI**: Group headers; per award show graphic, name, reason (or “Earned on {date}”). Locked/not-earned awards optional later (grayed with “Locked” or hidden).
- **Empty state**: “Earn awards by completing lessons and playing hands.”

### 5.3 Award catalog on client

- Either fetch catalog from API or import shared constants so client can resolve name/graphic/tier for any awardId. Prefer one source of truth (server); client can cache.

---

## 6. Phased rollout

### Phase 1 — Foundation and lessons (MVP)

**Backend**
- Award catalog (all awards from inventory; only lesson-related grants implemented).
- **Curriculum**: UserCurriculumProgress table; atomic increment in LessonsRouter when a lesson is completed **first time** (see §3.4). evaluateLessonAwards reads completedLessonsCount (or single row).
- `UserAward` table + AwardService (grant, bulkGrant returning BulkGrantResult, getUserAwards, getEarnedAwardIds).
- Grant on lesson completion in LessonsRouter **after** attempt + mastery committed; return `awardsGranted: result.granted` from bulkGrant in submit response.
- `GET /api/awards/catalog`, `GET /api/awards/me`.

**Client**
- Award toaster (two-column, tier styling; sort candidates by tierWeight then priority before showing first).
- Settings > Awards section (grouped by category, sort by tierWeight within category).
- After lesson step submit: read `awardsGranted` from response and show toaster(s); optionally poll `/me` on focus.

**Deliverable**: Completing lessons grants awards and shows toaster; user can see awards in Settings.

### Phase 2 — In-game and lifetime

**Backend**
- UserHandCount: atomic `UPDATE ... SET handsDealt = handsDealt + 1 WHERE userId = ?` on hand end (no read-then-write).
- evaluateHandAwards(userId, handSummary, sessionState) → AwardGrant[]; then awardService.bulkGrant(userId, awards) per user. No per-award grant calls on hand end.
- Hand-end hook: after HAND_ENDED, build handSummary and sessionState; for each user in hand run evaluator + bulkGrant. Awards: first_hand_played, first_win, hands_10/50/100 (session), hands_100_life through hands_5000_life, win_streak_2, showdown_win, all_in_win, big_pot_win.
- Session stats (VPIP/PFR) from room; include in sessionState for session_vpip_tight, session_pfr_aggressive (20+ hands).

**Client**
- After leaving table or on interval, call `GET /api/awards/me` and show any new awards (toaster). Optional: realtime AWARD_GRANTED for immediate table toaster.

**Deliverable**: Playing hands and hitting volume milestones grants awards; toaster works for table flow.

### Phase 3 — Clutch, discipline, replay

**Backend**
- Hand-end: extend handSummary for clutch/discipline (pot in bb, hero behind on turn, hero won/lost, villain bluff, hero folded overpair, hero checked back TP). Add rivered_win, cooler_survivor, hero_call, comeback_session; fold_big_pair, check_back_tp; no_tilt_session (session-level: consecutive losses + no all-in after).
- Replay: when user loads replay, record with **triggerKey = handId**. AwardGrantEvent unique (userId, awardId, handId). Grant first_replay, replays_5, replays_25, replay_self_loss, replay_big_pot.

**Client**
- Replay screen: after loading replay, call replay-viewed endpoint with handId so server can grant (idempotent per hand).

**Backend (replay)**  
Replay response must not wait on award grant. Send replay data first; then fire grant asynchronously. Use **`void awardService.bulkGrant(...).catch(...)`** so the promise does not crash the request lifecycle or emit unhandled rejection. **Error handling**: `.catch(log)` alone means **silently dropped awards** in production; add at minimum an **alert** on that error path, or a dead-letter queue / retry mechanism, so missed grants are observable and recoverable.

**Deliverable**: Clutch and discipline awards; replay analytics awards.

### Phase 4 — Concept and engagement

**Backend**
- After mastery update (lesson step): evaluate concept tiers; grant concept_first_mastery, concept_aware (≥1.0), concept_student (≥2.0), concept_thinker (≥3.0), concept_strategist (≥5.0). Biggest_leak_viewed when user hits “biggest leak” API or front-end event.
- Engagement: use **session definition** (30 min inactivity or table leave). Persist last played date and session boundaries. On login or daily job: grant first_week_streak, return_after_7_days, five_sessions_week. **Risk**: Session-end detection (heartbeat vs next-login inference) is deferred; engagement phase may require **non-trivial** work before accuracy is acceptable (see §3.6).

**Client**
- Optional: track “biggest leak viewed” and send event; otherwise grant when user opens lesson dashboard that shows leak.

**Deliverable**: Concept tier and engagement awards; full inventory covered. Engagement accuracy depends on resolving session-end implementation.

### Phase 5 — Polish

- Realtime AWARD_GRANTED for instant toaster in table/replay.
- Sound and confetti for Rare/Legendary. **User preference**: store in existing preferences (e.g. soundEnabled) or add awardToasterSound / awardConfetti flags if not already covered; document data model when implementing.
- Image pack support: graphic as asset key, client resolves to image or unicode fallback.
- Optional: “locked” awards in Settings (grayed, show trigger hint).

---

## 7. Dependencies and risks

| Dependency | Notes |
|------------|--------|
| Prisma schema | Add `UserAward` (with catalogVersion, count, lastEarnedAt, contextType, contextId); add `AwardGrantEvent` (userId, awardId, triggerKey) with compound unique (userId, awardId, triggerKey); add `UserHandCount` in Phase 2; add **UserCurriculumProgress** (userId, completedLessonsCount, updatedAt) — write path: atomic increment in LessonsRouter on first lesson completion. |
| Hand-end context | Phase 3 clutch/discipline need rich hand summary (pot size, street-by-street state, hero/villain actions). May require snapshot or HandAction replay. |
| Replay “viewed” | **Required**: idempotent per (userId, awardId, handId). Use AwardGrantEvent with triggerKey = handId; unique index (userId, awardId, triggerKey). Prevents replay open/close spam and duplicate grants. |
| Engagement data | Session definition is **locked**: session ends after 30 min inactivity or explicit table leave. “7 consecutive days” and “5 sessions in 7 days” depend on last-played and session boundaries derived from this. |

**Concerns and enforcement**  
- **AwardGrantEvent scope**: Documented “only for trigger-scoped idempotency” — enforce in **code review**; the pattern will otherwise be reused for session/volume and table growth will follow.
- **Replay async grant**: Fire-and-forget keeps latency low but `.catch(log)` = silently dropped awards; add **alert** on error path or retry/dead-letter so production misses are visible.
- **Session 30 min**: “Persist last activity timestamp” is vague; implementation may need heartbeat or next-login inference for accuracy (see §3.6).

**Risks**
- **Double grant**: ONE_TIME = unique (userId, awardId). REPEATABLE with trigger = AwardGrantEvent (userId, awardId, triggerKey) before incrementing UserAward.
- **Multiple awards at once**: Handled by toaster batching; use bulkGrant result.granted and sort by tierWeight → priorityWeight.
- **Performance**: Hand-end uses single evaluateHandAwards pass + bulkGrant (minimal read, transactional). Lifetime hand count and UserCurriculumProgress use atomic UPDATE only.
- **Mass award storm**: Hard cap at 10 with **full-context log** (userId, handId, originalCount, awardIds) so debugging is possible.

---

## 8. File and module map (suggested)

| Area | Path |
|------|------|
| Catalog | `src/awards/awardCatalog.ts` (version, tierWeight, source, category) |
| Service | `src/awards/AwardService.ts` (catalog + persistence only; grant, bulkGrant, getUserAwards, getEarnedAwardIds) |
| Lesson evaluator | `src/awards/evaluateLessonAwards.ts` (or in LessonsRouter); calls AwardService.grant/bulkGrant |
| Hand-end evaluator | `src/awards/evaluateHandAwards.ts`; returns AwardGrant[]; hand-end hook calls bulkGrant |
| Hand-end hook | `src/engine/dealer/` or `src/rooms/PokerRoom.ts` (after HAND_ENDED). Optional later: in-memory Set of earnedAwardIds per user in room, refreshed when bulkGrant writes; avoids DB read each hand (not required for MVP). |
| Replay grant | `src/http/HandHistoryRouter.ts` or ReplayRouter; idempotent by handId (AwardGrantEvent triggerKey) |
| Engagement | `src/awards/engagementAwards.ts` + cron or session-start; uses session definition (30 min / table leave) |
| API routes | `src/http/AwardsRouter.ts` (catalog, me only; no grant endpoints) |
| Client toaster | `apps/client/src/components/base/AwardToaster.tsx` (batching: first full, “+N more”) |
| Client Settings | `apps/client/src/components/domain/settings/AwardsSection.tsx` (group by category, sort by tierWeight) |
| Prisma | `prisma/schema.prisma` (UserAward, AwardGrantEvent, UserHandCount, UserCurriculumProgress) |

---

## 9. Acceptance criteria (Phase 1)

- [x] User completes a lesson → at least one lesson_complete_* and possibly first_lesson_ever / module / curriculum / lesson_perfect / lesson_first_try granted.
- [x] `GET /api/awards/me` returns user’s awards with reason, earnedAt, lastEarnedAt, count, catalogVersion, contextType, contextId.
- [x] bulkGrant returns BulkGrantResult (granted, skipped); LessonsRouter returns only result.granted as awardsGranted[].
- [x] Client shows two-column toaster from **granted** set only, sorted by tierWeight → priorityWeight. When multiple: first full; second “+N more awards earned.”
- [x] Settings > Awards shows earned awards grouped by category, sorted by tierWeight then lastEarnedAt. If an awardId from /me is missing in catalog, skip display and log.warn (safe guard for future catalog changes).
- [x] One-time awards are not granted twice (single row per userId+awardId, count=1). Repeatable awards use single row with count and lastEarnedAt updated.

**Phase 1 complete.** See [AWARDS_SYSTEM_IMPLEMENTATION_STATUS.md](../status/AWARDS_SYSTEM_IMPLEMENTATION_STATUS.md).
