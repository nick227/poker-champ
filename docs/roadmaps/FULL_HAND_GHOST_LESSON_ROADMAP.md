# Full-Hand “Ghosting a Pro” Lesson Type — Roadmap

**Purpose:** Plan a new lesson type that runs one full hand (preflop → showdown). The user guesses the pro’s action at each hero decision; after each answer they see a response screen, then the next decision is a new question. Pro line is predefined; user’s choice is compared to the pro and to community answers. Reuse existing static seeds, schema, and lesson runtime with minimal churn and a DRY, base-snapshot + deltas approach where possible.

**Date:** 2026-03-05

---

## 0. Review: alignment with current system (2026-03-05)

- **Seed directory pattern:** `scripts/seed-lessons-content.ts` loads only directories matching `/^L\d{2}$/i` (e.g. L01–L15). A directory named `GH01` would **not** be loaded. For Phase 1, use **L21, L22, …** for full-hand lessons, or extend the seed to accept a second pattern (e.g. `(L\d{2}|GH\d{2})`).
- **Module / catalog:** The client uses `LESSONS_MODULE_META` and a fixed `grouped: Record<ModuleCode, …>` in `useLessonsPageViewModel.ts`. If you use `moduleCode === "MODULE_GHOST"`, you must: (1) add `MODULE_GHOST` to `LESSONS_MODULE_META` in `lessons.data.ts`, (2) add a branch in `normalizeModuleCode()` so `"MODULE_GHOST"` is returned, (3) add `MODULE_GHOST: []` to the initial `grouped` object so ghost lessons are not dropped. Otherwise they will be normalized to `MODULE_A` and could cause runtime errors on `grouped[moduleCode].push`.
- **Lesson type in DB:** There is no `lessonType` on `Lesson` in the current Prisma schema. Using `moduleCode` (e.g. `MODULE_GHOST`) requires no migration. Adding `lessonType` would require a migration and then exposing it from the list/detail API.
- **Step config schema:** In `lesson-step-config.schema.json`, steps require `id`, `sequence`, `type`, `gradingVersion`, `snapshotVersion`; `snapshotPath` is optional. The seed only loads a snapshot when `step.snapshotPath` is set, so Phase 1 steps must have `snapshotPath`. Phase 2 would need seed logic to compute snapshot when `proAction` is present and `snapshotPath` is omitted.
- **“Pro played” in UI:** The lesson-detail API returns steps with runtime config from `getRuntimeConfigFromGradingSpec()` (scenarioProviderKey, evaluatorKey, revealLayerKeys, etc.) but does **not** expose `expectedAction`. To show “Pro played: CHECK” in `LessonInstructorPanel`, either: (1) include `expectedAction` (and optionally `acceptedCorrectActions`) in the step payload from `LessonDetailService`, or (2) include `expectedAction` in the submit feedback payload when the step is ACTION_STEP. Prefer (1) so the panel can show the pro’s action without depending on submit response.
- **Detail payload size:** `getLesson` returns all steps with full `snapshotJson` in one response. For 10–15 steps this is acceptable; for 20+ consider step-level or lazy loading later.
- **Visible steps:** `useLessonSession` has “visible step” logic that skips INFO_STEP when it duplicates the next ACTION_STEP. Full-hand lessons with only ACTION_STEPs are unaffected; progress (“Step 3 of 11”) can use the existing step index and `steps.length`.
- **curriculum.lock.json:** Currently locks 15 lessons, 30 steps. When adding full-hand lessons, update the lock (or add a separate lock) so CI and tooling stay accurate.

---

## 1. Executive summary

- **Concept:** “Ghosting a pro” = one lesson = one full hand. At each hero-to-act moment the user picks an action; we show correct/incorrect vs the pro and (optionally) community comparison; then advance to the next decision. The “pro” line is fixed in content; benefit of clicking is feedback vs pro + community.
- **Reuse:** Same `Lesson` / `LessonStep` / `LessonAttempt` / `LessonAttemptStep`, same grading engine, same decision-node runtime and response/reveal flow. No new lesson tables.
- **Main change:** Many near-identical snapshots per lesson (one per decision). Prefer **base snapshot + per-step deltas** so content and storage stay DRY; client continues to receive one snapshot per step (unchanged). Deltas are applied at **seed/build time**, not in the client.
- **Schema/API:** Optional discriminator for lesson type (e.g. `lessonType` or reuse `moduleCode`/role); optional lesson-level base snapshot + per-step delta in content; seed script applies deltas and writes full `snapshotJson` per step. No change to attempt/submit API contract.
- **UI:** Same lesson flow (question → submit → response → continue). Optional: hand progress (e.g. “Step 3 of 11”, street strip), and “Pro played: CHECK” on response when user was wrong.

---

## 2. Current system (what we reuse)

| Area | Current behavior |
|------|-------------------|
| **Content** | `content/lessons/content/Lnn/` with `step-config.json` + `snapshots/main.json` (or per-step paths). Seed: `scripts/seed-lessons-content.ts` reads config, loads JSON snapshots, upserts `Lesson` + `LessonStep` (with `snapshotJson`) + options. |
| **Schema** | `Lesson` (id, slug, title, moduleCode, recommendedOrder, role, repeatable, difficulty, …), `LessonStep` (id, lessonId, sequence, type, snapshotJson, gradingSpecJson, …), `LessonAttempt`, `LessonAttemptStep` (submittedAnswerJson, isCorrect, feedbackJson). |
| **Step types** | INFO_STEP, MCQ_STEP, ACTION_STEP. Canonical lessons use INFO_STEP + ACTION_STEP or single ACTION_STEP. |
| **Grading** | `LessonGradingEngine`: ACTION_STEP uses `expectedAction` / `acceptedCorrectActions` or rubric (STRONG/REASONABLE/WEAK). Result: isCorrect, response, followUp, scoreDelta, gradeBand. |
| **Runtime** | Decision node: `static_snapshot` scenario provider (step.snapshot), `action_rubric_eval` (server), reveal layers (ev_impact, community_comparison). State flow: QUESTION → SUBMITTING → EVALUATED → REVEALING → CONTINUATION → ADVANCING. |
| **Response screen** | `LessonInstructorPanel`: feedback (response, followUp), community comparison (percentile, distribution), reveal cards. |
| **Navigation** | One step at a time; after response user clicks Continue → next step or lesson complete. |

All of the above stays. Full-hand ghost is “many ACTION_STEPs in sequence” with optional base+delta snapshot authoring.

---

## 3. Full-hand ghost: behavior

- One lesson = one hand. Only **hero’s** decision points are steps (we do not ask “what did villain do?”).
- **Snapshot semantics (explicit):** Each snapshot represents the state **before** the hero decision. The **next** snapshot is the state **after** the pro’s action and opponent responses (until hero is to act again). This avoids ambiguity when authoring or validating.
- At each step: show table state (hero to act), user picks an action, submit → grade vs pro’s predefined action → show response (correct/incorrect, “Pro played” / “You chose” / “You matched the pro”, community comparison, reveal layers) → Continue → next step (next snapshot).
- If user chooses a different line than the pro (e.g. user all-in, pro checked), the **next** position still follows the **pro’s** line: we advance the table state by the **pro’s** action (and any opponent actions until hero to act again), then show the next snapshot. So the sequence of table states is fixed; user’s choice only affects feedback, not the next state.
- Benefit of clicking: (1) see if it matches the pro, (2) compare with community answers.

---

## 4. Snapshot strategy: base + deltas (DRY, low churn)

**Goal:** Avoid storing N near-identical full snapshots. Prefer one base snapshot plus a compact representation of changes per step; keep client unchanged (still one snapshot per step).

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| **A. Full snapshot per step** | Works today; no seed changes. | High duplication; large content and DB payload. |
| **B. Base + JSON Patch per step** | Small storage; standard format. | Need patch authoring or tooling to generate from full snapshots; seed must apply patch. |
| **C. Base + “pro action” sequence** | Single source of truth (pro line). | Requires “apply action to snapshot” logic (deterministic). Either shared engine or precomputed snapshots at seed time. |

**Recommended: hybrid (C at authoring, A in DB).**

- **Content format:** Author can provide either (i) full `snapshotPath` per step (current), or (ii) lesson-level `baseSnapshotPath` + per-step `proAction` (and optionally intermediate opponent actions). Pro line is then explicit in content.
- **Seed script:** For each step, if `snapshotPath` is set, load and store as today. If `baseSnapshotPath` + `proAction` (and any intermediate actions) are set, run a **deterministic “apply action(s) to snapshot”** helper (see below) to produce the next snapshot, then store that in `LessonStep.snapshotJson`. Client still receives one full snapshot per step; no client-side “apply action” needed.
- **Apply-action helper:** Implement once (e.g. in `packages/realtime-contract` or `src/lessons/`): given a `TableSnapshotPayload` and an action (seat, type, amountCents, …), return a new `TableSnapshotPayload` (toActSeat updated, stacks/pot/board updated, street advance when round complete). This mirrors engine logic but pure and synchronous for seed-only use. Alternatively, seed could call a small Node script that uses the same engine, or we precompute snapshots offline and commit full JSON per step (no runtime apply). Easiest short-term: **author provides full snapshots per step** (option A); later add optional base + pro-action and a seed-time or offline “apply” step to reduce duplication.

**Pro line lock (required):**  
`expectedAction` in grading spec **MUST** be the action used to produce the next snapshot. Otherwise author mistakes could desync the lesson (e.g. step says pro checked but next snapshot shows a bet). Add a **seed validation step**: verify snapshot progression matches `expectedAction` (e.g. for each consecutive pair of steps, next snapshot’s pot/stacks/street/board are consistent with applying that action). Fail seed or run a separate `validateGhostLesson()` if the check fails.

**Concrete recommendation for v1:**

- **Phase 1:** Support full-hand lessons with **full snapshot per step** (current schema and seed). No new content format. Many steps per lesson; each step has its own `snapshotPath` → `snapshotJson`. Pro line is encoded as `gradingSpecJson.expectedAction` (and `acceptedCorrectActions` if needed) per step. Run validation so snapshot progression matches expectedAction.
- **Phase 2 (optional):** Add optional `baseSnapshotPath` at lesson level and per-step `proAction` (and optional `opponentActionsUntilHero`) in step-config. Seed: if step has `proAction`, compute next snapshot from previous step’s snapshot (or base for step 1) via a shared “apply action” utility and store in `snapshotJson`. Content authors can then author one base + N actions instead of N full JSON files.

---

## 5. Schema and content gaps

### 5.1 Schema

- **Lesson:** No `lessonType` column exists today. For v1 use a dedicated `moduleCode` (e.g. `MODULE_GHOST`) so no migration is needed; the catalog and client must then add support for that module (see §0 and §7.1). Optionally add `lessonType` later via migration and expose it from the API.
- **LessonStep:** No new columns. Pro’s action per step is already in `gradingSpecJson.expectedAction` (and options). For base+delta: step-config only needs optional `proAction` (and optional `snapshotPath` override); seed resolves to full snapshot.
- **LessonAttempt:** Optional **summaryJson** for ghost lessons. On attempt completion, store: `{ matchedProCount: number, totalDecisions: number, accuracyPercent: number }`. Becomes the key training signal for completion UI and analytics. No migration required if the column already exists as JSON; otherwise add `summaryJson Json?` to `LessonAttempt`.
- **Content schema (step-config):** Extend `lesson-step-config.schema.json` to allow optional lesson-level `baseSnapshotPath`, **lessonType: "FULL_HAND_GHOST"** (for filtering, analytics, UI badges, replay linking; seed can ignore until DB column exists), and optional per-step `proAction` (and optional `opponentActionsUntilHero`). Keep `snapshotPath` optional when base+proAction are used.

**Minimal v1:** No DB migration. Use existing `Lesson`/`LessonStep`. Differentiate full-hand lessons by `moduleCode` (e.g. `MODULE_GHOST`) or a new `lessonType` field (single migration adding a nullable string).

### 5.2 Content format (static seeds)

- **Directory:** Use **L21, L22, …** (e.g. `content/lessons/content/L21/`) so the current seed pattern `/^L\d{2}$/i` picks them up. To use `GH01`-style IDs, extend `loadCanonicalLessons()` to accept e.g. `(L\d{2}|GH\d{2})` and ensure `lessonId` in config matches the directory name.
- **lessonType in content:** Add **lessonType: "FULL_HAND_GHOST"** at lesson level in step-config. Benefits: future filtering, analytics, UI badges, replay linking. Seed can ignore for now if no DB column.
- **step-config.json:** Many steps (one per hero decision). Each step:
  - `type: "ACTION_STEP"`
  - `snapshotPath`: path to snapshot for that decision (or omit if using base + proAction in phase 2).
  - `gradingSpecJson`: same as today; `expectedAction`, `acceptedCorrectActions`, `responseCorrect`, `responseIncorrect`, `followUpContent`, optional rubric. For **community comparison**, set **distributionKey** explicitly: ghost lessons use `distributionKey: "action"` (or the existing action-bucket shape). Default rule: **ACTION_STEP → distributionKey: "action"** when not specified.
- **Snapshots:** Either one file per step under `snapshots/step_01.json`, … or (phase 2) one `base.json` and steps reference `proAction` only.
- **Pro line:** Explicit as each step’s `expectedAction`; no separate “pro line” table needed. expectedAction MUST match the action used to produce the next snapshot (enforced by seed validation).

---

## 6. UI gaps

- **Catalog:** Show full-hand lessons in a dedicated section by using `moduleCode: "MODULE_GHOST"` and adding `MODULE_GHOST` to the client’s module meta and grouping (see §0). Optional: “Full hand” chip and step count on the lesson card when `moduleCode === "MODULE_GHOST"`.
- **Street indicator:** Deterministic rule: **street = snapshot.hand.street**. UI shows: **Preflop** | **Flop** | **Turn** | **River** (and optionally SHOWDOWN). Dramatically improves clarity of where the user is in the hand.
- **In-lesson:** Reuse `LessonContent` and decision flow. Optional enhancements:
  - Progress: “Step 3 of 11” and street strip (see above).
  - **Response screen — always show pro line:** Show the pro’s action on every step for consistent learning (not only when wrong). Examples:
    - **Pro played:** CHECK · **You chose:** CHECK ✓  
    - **Pro played:** RAISE · **You chose:** CALL  
    - Or when correct: **You matched the pro** ✓  
    Consistency improves learning.
- **Completion summary (ghost progress metric):** Use **LessonAttempt.summaryJson** with `matchedProCount`, `totalDecisions`, `accuracyPercent`. Example UI:
  - **You matched the pro on 7 / 10 decisions**
  - **Accuracy: 70%**
  This becomes a key training signal. Compute on attempt completion and store in `LessonAttempt.summaryJson`; return in attempt/lesson completion API so the completion screen can render it.
- **Replay hand integration:** For ghost lessons, **always link to replay** via `Lesson.replayHandId`. After completion show **“Watch the full hand”** — huge learning reinforcement. Strong recommendation: ghost lesson content should always set `replayHandId` to the same hand.
- **Optional: reveal EV difference:** Existing reveal layer `ev_impact` can be extended for ghost lessons to show: **Pro EV: +2.1bb** · **Your EV: -0.3bb** · **Difference: -2.4bb**. Very strong training signal.
- **Optional: final reveal step (SHOWDOWN_STEP):** At the end of the lesson, an optional step type could display: villain hand, hero hand, result, EV summary. Not required but very powerful for reinforcement.

No new routes or surfaces; same `/lesson/[lessonId]` and table-in-lesson UX.

---

## 7. Implementation plan (reuse-first, DRY)

### 7.1 Phase 1 — Full-hand with full snapshots (no base+delta)

1. **Catalog**
   - **Discriminator:** Use `moduleCode: "MODULE_GHOST"` (no DB migration). If you add `Lesson.lessonType` later, add a migration and expose it from the list/detail API.
   - **Seed:** In step-config set `moduleCode: "MODULE_GHOST"` and `recommendedOrder` so ghost lessons sort with the intended section. Use lesson dirs L21+ so the existing seed regex loads them.
   - **Client:** Add `MODULE_GHOST` to `LESSONS_MODULE_META` in `apps/client/app/lessons.data.ts` (title e.g. “Full hand”, promise e.g. “Ghost a pro”). In `useLessonsPageViewModel.ts`: add `"MODULE_GHOST"` to `normalizeModuleCode()` and add `MODULE_GHOST: []` to the initial `grouped` in `moduleCards`. Optional: “Full hand” chip on lesson cards when `moduleCode === "MODULE_GHOST"`.

2. **Content**
   - Add one pilot full-hand lesson (e.g. **L21**): 6–12 steps, each with its own `snapshotPath` and `gradingSpecJson.expectedAction`. Pro line = sequence of those expectedAction values. Author snapshots so each step shows hero to act after the pro’s previous action (and opponents) have been applied.

3. **Runtime**
   - No change. Same `static_snapshot`, same grading, same submit → response → continue. Ensure multi-step navigation (session.goNext, step index) works for 10+ steps.

4. **Response screen**
   - Always show pro’s action for ghost lessons (whether user was correct or not): “Pro played: {action}”, “You chose: {action}” with ✓ when correct, or “You matched the pro” when correct. The client does not currently receive `expectedAction` on the step payload; add it in `LessonDetailService` (e.g. from `gradingSpecJson.expectedAction` when mapping steps) so the panel can display it without changing the submit API.

5. **Progress**
   - Optional: in lesson view, show “Step {current} of {total}” and, if available, street from snapshot (e.g. “Flop”) so the hand feels like a single story.

### 7.2 Phase 2 — Base snapshot + deltas (optional, reduce churn)

1. **Apply-action utility**
   - Implement pure function or small script: `applyActionToSnapshot(snapshot, action) → snapshot`. Input: `TableSnapshotPayload` + action (seat, type, amountCents, …). Output: new payload (pot, stacks, toActSeat, street, board updated). Reuse types from `realtime-contract`; no live engine dependency if we keep it pure and simple (e.g. only support the subset of state changes needed for lessons).

2. **Content schema**
   - Add optional `baseSnapshotPath` (lesson-level) and per-step `proAction` (and optional `opponentActionsUntilHero`). Schema: validate that either `snapshotPath` or (base + proAction) is present per step.

3. **Seed**
   - When processing a step: if `proAction` (and optional base) present, load previous step’s snapshot (or base for step 1), apply pro’s action (and any opponent actions), write result to `snapshotJson`. If `snapshotPath` present, keep current behavior (load file → snapshotJson).

4. **Authoring**
   - Authors can switch to base + N actions; or a build script can take N full snapshots and produce base + deltas (e.g. diff or action list) for smaller commits.

### 7.3 Ghost-lesson validation (seed)

Ghost lessons are easy to break. Add a **seed validation step**: **validateGhostLesson(lessonDir, config)**. Run for every lesson with `lessonType: "FULL_HAND_GHOST"` (or moduleCode MODULE_GHOST) after loading steps and snapshots. Checks:

| Check | Description |
|-------|-------------|
| Hero to act | Snapshot `hand.toActSeat` matches `hero.seat` (hero is the one to act). |
| Hero seat consistency | `snapshot.hero.seat === lesson.heroSeat` for every step. Optional `heroSeat` in step-config; if omitted, inferred from first snapshot and all steps must match (prevents hero seat drifting). |
| expectedAction in options | `gradingSpecJson.expectedAction` is available in `snapshot.hero.actionOptions` (e.g. canCheck for CHECK, canCall for CALL, etc.). |
| Next snapshot differs | Consecutive snapshots must differ (fingerprint: street, potCents, board, actionCount, stateHash). Prevents accidental duplicate snapshots. |
| Snapshot progression | For each consecutive pair of steps, the next snapshot’s state is consistent with applying `expectedAction`: pot, stacks, board progression, street advance as appropriate. |
| Pot / stack changes | Pot and stack deltas match the pro action (and any opponent actions implied by next snapshot). |
| Board progression | Board length and cards advance correctly across streets (e.g. flop 3, turn +1, river +1). |

This will save huge debugging time later. Fail seed or emit a clear validation error so authors fix content before publish.

### 7.4 Completion: compute and store ghost summary

On **LessonAttempt** completion (status → COMPLETED), for ghost lessons: compute `matchedProCount` (steps where `isCorrect`), `totalDecisions` (count of ACTION_STEPs in the lesson), `accuracyPercent` (matchedProCount / totalDecisions * 100). Store in **LessonAttempt.summaryJson**. Expose in completion API so the UI can show “You matched the pro on 7 / 10 decisions” and “Accuracy: 70%”.

### 7.5 Developer task list: first multi-step ghost lesson

Short, ordered checklist for rolling out the first ghost lesson.

- [ ] **Schema:** Add `LessonAttempt.summaryJson` (Json?, optional) if not present. Add `lessonType` to step-config schema (optional, string).
- [ ] **Catalog (server):** In `LessonListService`, add `MODULE_GHOST` to `normalizeModuleCode()`. Extend `ModuleCode` / list DTO if typed.
- [ ] **Catalog (client):** In `lessons.data.ts`, add `MODULE_GHOST` to `LESSONS_MODULE_META`. In `useLessonsPageViewModel.ts`, add `MODULE_GHOST` to `normalizeModuleCode()` and `MODULE_GHOST: []` to the initial `grouped` in `moduleCards`.
- [ ] **Detail API:** In `LessonDetailService`, when mapping steps, add `expectedAction` (and optionally `acceptedCorrectActions`) from `gradingSpecJson` to the step payload so the client can show “Pro played” / “You chose”.
- [ ] **Response UI:** In `LessonInstructorPanel`, for ACTION_STEP with `expectedAction`: always show “Pro played: {expectedAction}”; show “You chose: {userAction}” with ✓ when correct, or “You matched the pro” when correct. Use submitted answer from feedback/context.
- [ ] **Street + progress:** In lesson view, show street from `snapshot.hand.street` (Preflop/Flop/Turn/River) and “Step {current} of {total}”.
- [ ] **Completion backend:** On attempt completion (e.g. in `LessonAttemptService` when marking COMPLETED), for ghost lessons (e.g. `lesson.moduleCode === "MODULE_GHOST"` or `lessonType`): compute `matchedProCount`, `totalDecisions`, `accuracyPercent`; write to `LessonAttempt.summaryJson`. Expose `summaryJson` (or flattened fields) in the response used by the completion screen.
- [ ] **Completion UI:** On lesson completion, if `summaryJson` present: show “You matched the pro on {matchedProCount} / {totalDecisions} decisions” and “Accuracy: {accuracyPercent}%”. If `lesson.replayHandId` is set, show “Watch the full hand” link.
- [ ] **Seed validation:** Implement `validateGhostLesson(lessonDir, config, stepsWithSnapshots)`: hero to act, expectedAction in hero.actionOptions, snapshot progression matches expectedAction, pot/stack/board consistency. Run after loading ghost lessons (e.g. when `lessonType === "FULL_HAND_GHOST"` or `moduleCode === "MODULE_GHOST"`). Fail seed or exit with clear error.
- [ ] **Seed progression check:** Add step that verifies for each consecutive pair of steps: next snapshot is consistent with applying current step’s `expectedAction`. Call from same validation path as above.
- [ ] **Content:** Create pilot lesson (e.g. `content/lessons/content/L21/`): `step-config.json` with `lessonType: "FULL_HAND_GHOST"`, `moduleCode: "MODULE_GHOST"`, 6–12 ACTION_STEPs, each with `snapshotPath` and `gradingSpecJson.expectedAction`. Add `snapshots/step_01.json` … per step. Ensure each snapshot is state *before* hero decision; next snapshot = state *after* pro action (and opponents). Set `replayHandId` on Lesson if replay exists. Run seed; fix any validation errors.
- [ ] **Smoke test:** Start lesson L21, complete 2–3 steps (correct and wrong), then complete lesson; confirm completion shows ghost summary and “Watch the full hand” when `replayHandId` set.

---

## 8. Consistency and DRY checklist

- Reuse `Lesson`, `LessonStep`, `LessonAttempt`, `LessonAttemptStep`; no new tables for ghost lessons.
- Reuse grading (`LessonGradingEngine`, `gradeStep`), submit flow (`LessonAttemptService`), and decision node runtime (`static_snapshot`, `action_rubric_eval`, reveal layers).
- Reuse lesson API: start attempt, submit step, get lesson detail (steps with snapshots). No new endpoints for ghost.
- Pro line lives in existing fields: `gradingSpecJson.expectedAction` per step (and options). No separate “pro line” store. To show “Pro played: X” in the response panel, expose `expectedAction` from the lesson-detail step payload (e.g. in `LessonDetailService` when mapping steps).
- Snapshot: client always gets one full snapshot per step (same as today). Delta/base only in content and seed, not in API or client.
- One lesson type discriminator (v1: `moduleCode`; optional later: `lessonType`) for catalog and optional UI only; rest of pipeline is type-agnostic.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Many steps → large payload | Paginate or lazy-load step list if needed; snapshot is still one per step when loading that step. Optional base+delta reduces content size. |
| “Apply action” buggy | Phase 1 uses full snapshots only. Phase 2 apply-action can be tested against engine output or hand-verified snapshots. |
| Authoring N snapshots tedious | Phase 2: author base + pro actions; seed or tool generates full snapshots. Or build a small “replay-to-lesson” tool that exports a hand to lesson content (base + actions). |
| Ghost lessons not loaded by seed | Seed only loads dirs matching `L\d{2}`. Use L21+ for ghost lessons, or extend `loadCanonicalLessons()` regex. |
| MODULE_GHOST breaks catalog UI | Add MODULE_GHOST to LESSONS_MODULE_META, normalizeModuleCode, and the grouped object in useLessonsPageViewModel; otherwise lessons are normalized to MODULE_A or push to undefined. |

---

## 11. System improvements to consider (while reopening code)

While adding full-hand ghost support, these changes would reduce future churn and align the lesson system with a more flexible catalog and clearer API contracts.

1. **Seed: content-driven lesson discovery**  
   Replace the hardcoded `/^L\d{2}$/i` regex with “any directory that contains `step-config.json`” (or a small manifest). New lesson types (L21, GH01, etc.) then work without editing the seed. Optionally keep a blocklist or allowlist in `curriculum.lock.json` if you need to exclude draft dirs.

2. **Catalog: resilient module handling**  
   `normalizeModuleCode` and the fixed `grouped` object are duplicated (server: `LessonListService`, client: `useLessonsPageViewModel`). Adding a new module (e.g. MODULE_GHOST) requires touching both plus `LESSONS_MODULE_META`, the `ModuleCode` type, and the initial `grouped`. Consider: (a) API returns `moduleCode` as string; (b) client treats `ModuleCode` as string and uses `LESSONS_MODULE_META[code] ?? DEFAULT_MODULE_META` so unknown modules get a default section; (c) build `grouped` from `catalog.map(c => c.moduleCode)` and unique so new modules appear without code changes. That way new lesson types only need content + optional meta entry.

3. **Lesson detail: expose a small “display” slice from grading spec**  
   Detail steps today expose runtime config but not `expectedAction`, `responseCorrect`, or `responseIncorrect`. Adding a single `gradingDisplay?: { expectedAction?: string; acceptedCorrectActions?: string[] }` (or full slice) to the step payload gives the client one place for “Pro played”, tooltips, and optional comparison UI without parsing grading spec. Keeps grading spec as source of truth; display is a view.

4. **Single normalizeModuleCode**  
   Server and client both define `normalizeModuleCode` with the same mapping. Consider a shared package or API contract: e.g. API returns normalized `moduleCode` so the client doesn’t re-normalize, or a tiny shared util used by seed, server, and client so new modules are added in one place.

5. **Optional `lessonType` in content and DB**  
   Add optional `lessonType: "STANDALONE" | "FULL_HAND_GHOST"` to `lesson-step-config.schema.json` (top-level) so content is self-describing. Seed can ignore it until a DB column exists, then persist it. Enables filtering and badges without overloading `moduleCode` (e.g. “Full hand” chip from `lessonType` even if module is MODULE_GHOST or MODULE_C).

6. **List API already has `totalSteps`**  
   Catalog can show “11 decisions” for full-hand lessons using existing `lesson.totalSteps`; no API change. Optional: add `lessonType` to list response when present so the client can show a “Full hand” chip without loading detail.

7. **Replay link for ghost lessons**  
   `Lesson.replayHandId` already exists. For ghost lessons, point it at a replay of the same hand so users can “Watch the full hand” after the lesson. Document in content authoring; no schema change.

8. **Source of truth for correct action**  
   Grading uses `gradingSpecJson.expectedAction`; options can have `isCorrect`. For ACTION_STEP the action bar is driven by snapshot `hero.actionOptions`, not step.options. Document that grading spec is the source of truth for correctness; step.options are for MCQ and optional display. Reduces risk of options and spec drifting out of sync.

9. **Future: auto-generate ghost lessons from real hands**  
   Not required now, but worth noting. Eventually you could build a **replay → lesson exporter**. Pipeline: hand history → detect hero decision points → generate snapshots → produce `step-config.json`. Then content generation becomes extremely fast. Document as a future improvement.

---

## 10. Summary

- **Full-hand “ghosting a pro”** = one lesson, many ACTION_STEPs (one per hero decision). User guesses pro’s action at each step; we show match vs pro and community; next state always follows the pro’s line.
- **Snapshot semantics:** Each snapshot = state **before** hero decision; next snapshot = state **after** pro action + opponent responses. **Pro line lock:** expectedAction MUST match the action used to produce the next snapshot; seed validates.
- **Reuse:** Existing static seeds, Lesson/LessonStep/Attempt schema, grading, decision runtime, response screen. No new lesson tables or submit API.
- **Progress metric:** Store in **LessonAttempt.summaryJson**: `matchedProCount`, `totalDecisions`, `accuracyPercent`. Completion UI: “You matched the pro on 7 / 10 decisions”, “Accuracy: 70%”.
- **Content:** Add **lessonType: "FULL_HAND_GHOST"** and optional **heroSeat** in step-config. **validateGhostLesson()** in seed: hero to act, **snapshot.hero.seat === lesson.heroSeat** (or consistent across steps), expectedAction in actionOptions, **next snapshot must differ from previous**, pot/stack/board consistency.
- **UI:** Street from `snapshot.hand.street` (Preflop/Flop/Turn/River). Response: always show “Pro played” / “You chose” / “You matched the pro”. Completion: ghost summary + “Watch the full hand” when `replayHandId` set. Optional: SHOWDOWN_STEP, EV difference reveal.
- **Schema:** v1 use `moduleCode: "MODULE_GHOST"` (no migration); optional **LessonAttempt.summaryJson** for ghost summary. Optional later: `Lesson.lessonType`; baseSnapshotPath + proAction in content/seed.
- **Future:** Replay → lesson exporter (hand history → decision points → snapshots → step-config) for fast content generation. See **§0** for alignment notes with the current system.
