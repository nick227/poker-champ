# Lessons Page Inventory

**Purpose:** Inventory of the lessons screen: what lessons we offer, how they are grouped, where data comes from, and step/question profile. Updated after canonical-metadata refactor (DB-driven grouping, single content seed).

**Date:** 2026-03-02

---

## 1. Lessons screen overview

**File:** `apps/client/app/lessons.tsx`

The screen shows:

1. **Masthead + top nav** (shared with app)
2. **Poker School card**
   - Progress: `completedCount / catalog.length` lessons completed
   - Cadence: completed attempts in last 7 days (from API)
   - Primary CTA: "Continue Training" (if in-progress lesson) or "Start First Lesson"
3. **Continue / Recently Completed** (conditional)
   - One "continue" card for the single in-progress lesson
   - Up to 3 recently completed lessons (by `lastAttemptedAt`)
4. **Live Drills** (conditional)
   - Lessons where `enabled && (repeatable || role === "drills")`
   - Sorted: in_progress first, then by title
5. **Module sections** (one block per non-empty module)
   - Modules: A → B → C (by `moduleCode`)
   - Per module: title, promise, progress bar (done/total), then list of lessons
   - Each lesson: title, outcome (description), state chip, difficulty, role, estimated min, first 2 concept tags, action button (Start / Resume Step N / Review / Locked)

**Sorting of full catalog:** `moduleCode` (string) then `recommendedOrder` then `title`. Client receives lessons already ordered by API (`orderBy: moduleCode, recommendedOrder, createdAt`) and preserves that order when building `moduleSections`.

---

## 2. Where the data comes from

| Layer | Source |
|-------|--------|
| **Client** | `lessonService.listLessons()` → `GET /api/lessons` |
| **API** | `src/http/LessonsRouter.ts` → Prisma `Lesson.findMany({ status: "PUBLISHED" }, orderBy: [moduleCode, recommendedOrder, createdAt])` + user attempts + `ContentAccessService` |
| **DB** | `Lesson` (with canonical fields), `LessonStep`, `LessonAttempt`, etc. Populated by **content seed only**. |
| **Module / role / order** | **In DB.** `Lesson.moduleCode`, `Lesson.recommendedOrder`, `Lesson.role`, `Lesson.repeatable` are persisted by `scripts/seed-lessons-content.ts` from each lesson's `step-config.json`. API returns these from the lesson row; no hardcoded map. |

Single source of truth: canonical content in `content/lessons/content/L01`–`L15` and the content seed. Legacy V1 seed and `LESSON_UI_META` have been removed.

---

## 3. Catalog: canonical content only

- **Source:** `content/lessons/content/L01` … `L15` (one directory per lesson).
- **Seed:** `scripts/seed-lessons-content.ts` — reads each `step-config.json`, upserts `Lesson` by `config.lessonId` (e.g. `L01`), and persists **moduleCode**, **recommendedOrder**, **role**, **repeatable**, **curriculumVersion**, plus title, description, difficulty, estimatedMinutes, steps, etc.
- **Lock:** `content/lessons/content/curriculum.lock.json` — 15 lessons, 30 steps, gradingVersion 1.
- **Step-config requirements (lesson-level):** `lessonId`, `title`, `moduleCode`, `recommendedOrder`, `role`, `repeatable`, `steps`; optional `version`, `difficulty`, `estimatedMinutes`, `curriculumVersion`.

All 15 lessons (L01–L15) are listed in section 4. Module/role/order are defined in content and stored in the DB; the API does not use any lesson-id–keyed metadata map.

---

## 4. Canonical lessons inventory (L01–L15)

All have the same step shape: **2 steps** — `INFO_STEP` (intro) then `ACTION_STEP` (decision). No MCQ_STEP in canonical content. Estimated minutes: 8 for all. Curriculum tag: `poker_lessons_full_15_v1`.

| # | Id | Title | Module | Difficulty | Expected action / grading |
|---|----|-------|--------|------------|----------------------------|
| 1 | L01 | OESD vs Half-Pot | MODULE_A | BEGINNER | CALL (OBJECTIVE_SINGLE) |
| 2 | L02 | Flush Draw vs Pot Bet | MODULE_A | BEGINNER | CALL (OBJECTIVE_SINGLE) |
| 3 | L03 | Combo Draw vs All-In | MODULE_A | BEGINNER | CALL / ALL_IN (OBJECTIVE_SINGLE) |
| 4 | L04 | Top Pair vs Pot Bet | MODULE_A | BEGINNER | CALL (OBJECTIVE_SINGLE) |
| 5 | L05 | Two Overcards vs Min Bet | MODULE_A | BEGINNER | CALL (OBJECTIVE_SINGLE) |
| 6 | L06 | KK SB vs BB | MODULE_B | CORE | ALL_IN (OBJECTIVE_SINGLE) |
| 7 | L07 | 88 vs Two All-Ins | MODULE_B | CORE | FOLD (OBJECTIVE_SINGLE) |
| 8 | L08 | AK vs Two All-Ins | MODULE_B | CORE | FOLD (OBJECTIVE_SINGLE) |
| 9 | L09 | AK vs Two Limpers | MODULE_B | CORE | RAISE (OBJECTIVE_SINGLE) |
| 10 | L10 | AA UTG 9-Handed | MODULE_B | CORE | RAISE (OBJECTIVE_SINGLE) |
| 11 | L11 | A7s UTG Tournament | MODULE_C | ADVANCED | RUBRIC: STRONG=fold, REASONABLE=raise, WEAK=call |
| 12 | L12 | Low Flush vs Double All-In | MODULE_C | ADVANCED | RUBRIC: STRONG=fold, REASONABLE=call, WEAK=raise |
| 13 | L13 | Middle Pair vs Half-Pot Turn | MODULE_C | ADVANCED | RUBRIC: STRONG=call, REASONABLE=fold, WEAK=raise |
| 14 | L14 | Two Pair on Flush Board | MODULE_C | ADVANCED | RUBRIC: STRONG=call, REASONABLE=fold, WEAK=raise |
| 15 | L15 | 22 Chip Leader vs Raise | MODULE_C | ADVANCED | RUBRIC: STRONG=call, REASONABLE=fold, WEAK=raise |

**Module distribution:** A (L01–L05), B (L06–L10), C (L11–L15).

---

## 5. Question / step profile

### 5.1 Step types (canonical content)

- **INFO_STEP:** Intro; shows snapshot, beforeMessage, question, followUpMessage. Grading: non-scored, auto "Continue" (or custom `gradingSpecJson.response`).
- **ACTION_STEP:** User chooses a table action (fold/check/call/bet/raise/all_in). Grading from `gradingSpecJson`: either one correct action or a rubric (STRONG / REASONABLE / WEAK). No MCQ_STEP in L01–L15.

### 5.2 Grading modes (ACTION_STEP)

- **OBJECTIVE_SINGLE:** Single expected action (e.g. `expectedAction: "CALL"`). Some steps allow multiple correct (e.g. L03 `acceptedCorrectActions: ["call", "all_in"]`).
- **RUBRIC_SUBJECTIVE:** `gradingMode: "RUBRIC_SUBJECTIVE"` with `rubric.acceptedAnswers`: STRONG, REASONABLE, WEAK arrays of action strings. Used in L11–L15.

### 5.3 Shared patterns (canonical)

- **Action buckets:** All ACTION_STEP use `distributionKey.type: "action_bucket"`, `buckets: ["fold", "call", "raise", "all_in"]`.
- **Runtime:** `scenarioProviderKey: "static_snapshot"`, `evaluatorKey: "action_rubric_eval"`, `revealLayerKeys: ["ev_impact", "community_comparison"]`, `displayCategory: "WWYD_COMPARE"`.
- **Question text:** Template "Lesson N: &lt;title&gt;. What is your best action?" (same for intro and decision step in each lesson).
- **Copy:** beforeMessage / followUpMessage are generic ("Review the situation…", "Take your best line…", "Instructor analysis and community comparison placeholder."). Real Instructor analysis can be added via gradingSpec followUpCorrect / followUpIncorrect (see section 7).

---

## 6. Refactor summary (canonical metadata)

- **Lesson schema:** `moduleCode`, `recommendedOrder`, `role`, `repeatable`, `curriculumVersion` added and used as the source for list response and ordering.
- **Seed:** `seed-lessons-content.ts` reads `step-config.json` (including `moduleCode`, `recommendedOrder`, `role`, `repeatable`) and writes them to `Lesson`; no second seed for lessons.
- **API:** GET `/api/lessons` uses `lesson.moduleCode`, `lesson.role`, `lesson.repeatable`, `lesson.recommendedOrder` from DB; `orderBy: [{ moduleCode: "asc" }, { recommendedOrder: "asc" }, { createdAt: "asc" }]`. Concept tags still derived from step–concept links.
- **Client:** Unchanged contract; expects `moduleCode`, `role`, `repeatable`, `recommendedOrder` and `conceptTags` on each lesson. No client changes required for grouping/order.
- **Removed:** Legacy V1 seed usage and `LESSON_UI_META` in `LessonsRouter.ts`. `scripts/seed-lessons-v1.ts` exists only as deprecated (guard script and package script point to content seed). Lobby "Poker School" link now goes to `/lessons` (not a hardcoded lesson id).

---

## 7. Plan: safely add Instructor analysis to question data

**Goal:** Replace placeholder follow-up copy ("Instructor analysis and community comparison placeholder.") with real, step-specific Instructor analysis after the user answers.

**Current flow:**

- **Step content:** `beforeMessage`, `question`, `followUpMessage` (and in ACTION_STEP `gradingSpecJson`: `responseCorrect`, `responseIncorrect`, `followUpCorrect`, `followUpIncorrect`; for rubric, `followUpReasonable`).
- **Grading:** `LessonsRouter.getStepResponseEnvelope()` chooses `followUp` from `gradingSpec.followUpCorrect` / `followUpIncorrect` (and `followUpReasonable` for rubric), falling back to `step.followUpMessage`.
- **Response:** Submit returns `feedback.followUpInstructorMessage = grade.followUp`; client `LessonInstructorPanel` shows it. If that value looks like a placeholder, the panel falls back to `step.followUpInstructorMessage`.

**Safe approach (no schema change):**

1. **Author in content:** In each ACTION_STEP (and any graded step) in `step-config.json`, set real strings in `gradingSpecJson`:
   - `followUpCorrect` — short analysis for correct answer (why it’s good, key takeaway).
   - `followUpIncorrect` — short analysis for wrong answer (why the chosen line is worse, what to do instead).
   - For RUBRIC steps: also `followUpReasonable` if you want distinct copy for REASONABLE vs STRONG.
2. **Seed:** No change. Seed already persists `gradingSpecJson` from step-config.
3. **API:** No change. `getStepResponseEnvelope` already uses these fields and returns `followUp` → `feedback.followUpInstructorMessage`.
4. **Client:** No change. Panel already shows `feedback.followUpInstructorMessage`; once placeholders are replaced in content, real analysis appears. Optional: relax or remove the "placeholder" detection in `LessonInstructorPanel` once all steps have real copy.
5. **Rollout:** Add copy to one lesson (e.g. L01), reseed, verify in UI; then roll out to remaining lessons. Keeps changes content-only and reversible.

**Optional later (structured Instructor analysis):**

- Add an optional `instructorAnalysisJson` (or markdown) on `LessonStep` for longer or multi-section analysis (e.g. "why call", "why not raise", "common mistake").
- Or extend reveal layers so a step can attach an "instructor" reveal with structured blocks. Requires schema/API/UI and content-authoring conventions; can be a follow-up after the quick path above.

**Checklist:**

- [ ] Add `followUpCorrect` / `followUpIncorrect` (and `followUpReasonable` where needed) to ACTION_STEP `gradingSpecJson` in step-configs.
- [ ] Reseed with `pnpm lessons:seed:content` (and `--replace-noncanonical` if desired).
- [ ] Verify one lesson end-to-end; then backfill remaining lessons.
- [ ] Optionally remove or narrow `isPlaceholderInstructorMessage()` in `LessonInstructorPanel` once placeholders are gone.

