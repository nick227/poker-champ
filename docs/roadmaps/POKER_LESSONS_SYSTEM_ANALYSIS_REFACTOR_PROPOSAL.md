# Poker Lessons System Analysis And Major Refactor Proposal

## Document Intent
Define a technical redesign for lessons so the experience is board-first, event-driven, and ready for full curriculum reseed.

## Code And Feature Status (As Of 2026-03-02)
- Status summary: core interaction refactor is partially implemented; reseed/source-of-truth unification is still pending.
- Implemented: lobby lesson entry now routes to full lesson screen (`/lesson/[lessonId]`).
- Implemented: legacy lesson modal runtime path removed from active flow (`LessonSheet` deleted).
- Implemented: MCQ is now immediate-submit on option click (no submit button).
- Implemented: unified answer-event behavior in session logic for MCQ and ActionBar actions.
- Implemented: lesson runtime is board-first with instructor/question/response overlay panel anchored over table.
- Implemented: action-step lock/evaluate/result loop remains server-graded and idempotent.
- Implemented: community comparison now accompanies instructor response using existing `utilities/overview` endpoint.
- Implemented: utilities endpoint now returns `responseDistribution` for both action and MCQ answers.
- Implemented: utilities endpoint now computes step-scoped percentile when `stepId` is provided.
- Pending: router metadata hardcoding (`LESSON_UI_META`) migration to canonical content source.
- Pending: canonical-content-driven seed compiler cutover and full reseed migration plan.
- Pending: broader e2e coverage for full board-overlay lesson flow and community-comparison rendering.

## Lesson Schema (Current)

### Quick Points
- One lesson can mix `INFO_STEP`, `MCQ_STEP`, and `ACTION_STEP` in any order.
- Every graded step is server-authoritative (`gradingSpecJson` + `gradingVersion`).
- Every step can carry a table snapshot (`snapshotJson`) so lessons run in real table context.
- MCQ and action answers are stored the same way (`LessonAttemptStep.submittedAnswerJson`), enabling one grading pipeline.
- Step submissions are idempotent per `(attemptId, stepId)` to prevent double grading/mastery inflation.
- Step-level concept links (`LessonStepConcept`) drive mastery updates and recommendation signals.
- Lesson-level metadata (`tier`, `applyCtaText`, module/order tags) supports product packaging without changing grading runtime.
- Community comparison is derived from submitted answers, not hardcoded stats.

### Runtime Lesson Model (DB/API)
- `Lesson`: lesson identity and catalog metadata (`id`, `slug`, `title`, `description`, `difficulty`, `tier`, `applyCtaText`, `version`, status).
- `LessonStep`: ordered step records per lesson (`sequence`, `type`, `snapshotVersion`, `snapshotJson`, `gradingVersion`, question/instructor copy, `gradingSpecJson`).
- `LessonStepOption`: MCQ options keyed by `optionKey` + display order.
- `LessonAttempt`: per-user attempt lifecycle (`IN_PROGRESS`/`COMPLETED`, `scorePct`, completion timestamps).
- `LessonAttemptStep`: per-step submitted answer + grading feedback envelope, idempotent by `(attemptId, stepId)`.
- `LessonConcept`, `LessonStepConcept`, `UserConceptMastery`: concept tagging and mastery deltas from graded responses.
- `UserCurriculumProgress`: aggregate completed-lesson count for curriculum tracking.

### Step Types And Answer Shapes
- `INFO_STEP`: no user answer required for correctness; response is instructional.
- `MCQ_STEP`: answer shape `{ optionKey }`; now submitted immediately on option click.
- `ACTION_STEP`: answer shape `{ type, amountCents? }` normalized from real ActionBar actions.

### Community Comparison Payload
- Endpoint: `GET /api/lessons/utilities/overview?lessonId=<id>&stepId=<id>`.
- `communityComparison.responseDistribution`: aggregated answer distribution for any step type.
- `communityComparison.actionDistribution`: action-only distribution (compatibility field).
- `communityComparison.userPercentile`: lesson-level percentile by default; step-level percentile when `stepId` is present.
- `communityComparison.sampleSize` + `minimumSampleSize`: supports low-sample fallback messaging.

## Lesson Interface (Flexible Runtime Interface)
- Core model: real poker table is the primary surface; lesson UI is an overlay guidance layer.
- Per-step interface composition:
- `INFO_STEP`: instructor prompt + response flow only.
- `MCQ_STEP`: instructor prompt + dynamic option buttons; tap-to-submit.
- `ACTION_STEP`: instructor prompt + real ActionBar actions (`fold/check/call/bet/raise/all_in`).
- Shared response contract:
- Any user answer event (MCQ tap or action click) triggers the same submit->grade->response loop.
- Response rendering is unified: correctness, short explanation, optional EV/frequency/takeaway, optional community comparison.
- Progression contract:
- Explicit user acknowledgement (`Next`/`Finish`) advances step sequence after response.
- Action safety contract:
- During grading/result states, action controls are locked to prevent duplicate submissions.
- Extensibility:
- Runtime capability keys (`scenarioProviderKey`, `evaluatorKey`, `revealLayerKeys`, `continuationKey`) allow richer step behavior without changing base interface.

## Lesson Grading Policy (Right/Wrong vs Seen/Not-Seen)

### Recommendation
- Keep explicit grading outcomes (`isCorrect`) in the system.
- Add grading modes so not every step is forced into strict binary correctness.
- Reason: keeping distinction preserves product flexibility for mastery, recommendations, analytics, and premium features.

### Proposed Grading Modes
- `OBJECTIVE_SINGLE`: one best answer (classic right/wrong).
- `OBJECTIVE_MULTI`: multiple valid answers (set of accepted answers).
- `RUBRIC_SUBJECTIVE`: graded by rubric bands (e.g., best / acceptable / weak).
- `INSTRUCTIONAL`: seen/not-seen progression step (no correctness penalty).

### Why not only seen/not-seen
- Seen/not-seen is useful for progression but too weak for decision-quality measurement.
- It reduces our ability to:
- identify leaks precisely
- compute meaningful mastery deltas
- rank weak concepts for next-lesson recommendation
- power community percentile by answer quality

### Practical Runtime Shape
- Keep `LessonFeedback.isCorrect` for compatibility.
- Add optional fields for non-binary steps:
- `gradeBand`: `best | acceptable | weak`
- `scoreDelta`: numeric impact already supported
- `evaluationMode`: mirrors grading mode for analytics/debug
- For `INSTRUCTIONAL`, set `scoreDelta=0` and treat as completion event.

### Product Guidance
- Use strict right/wrong where there is a clear highest-EV baseline.
- Use rubric mode for subjective or pool-dependent spots.
- Use instructional mode for framing/setup steps where correctness is not the point.
- Continue showing explanatory response for all modes; correctness is one signal, coaching is always required.

## High-Level System Design (Short)
- Client: `LessonContent` orchestrates table + overlay; `useLessonSession` manages attempt lifecycle, answer submission, and community comparison fetch-after-feedback.
- Table surface: `ActiveTableView` remains the real poker interaction surface, including ActionBar for `ACTION_STEP`.
- Instructor surface: `LessonInstructorPanel` + `LessonQuestionPanel` render question, grading response, and compact community summary.
- Server: `LessonsRouter` is the single lessons API surface (catalog, detail, attempts, submit, mastery, utilities overview).
- Data path: content is seeded into lesson tables, runtime is server-authoritative for grading, client is presentation/state orchestration only.

## Current-State Analysis

### 1) Interaction model today
- Lesson steps support `INFO_STEP`, `MCQ_STEP`, and `ACTION_STEP`.
- Both MCQ and action steps already submit to the same backend endpoint:
- `POST /api/lessons/:lessonId/attempts/:attemptId/steps/:stepId/submit`
- Backend returns a unified feedback envelope (`response`, correctness, follow-up, optional EV fields).

### 2) Can action button clicks be used as the lesson answer event?
Yes. This is already technically wired.
- `useLessonSession.submitAction()` maps ActionBar payloads to lesson answer payload.
- `LessonContent` passes `onAction={handleAction}` to `ActiveTableView`.
- On action click (`fold/check/call/bet/raise/all_in`), answer is submitted and graded.

Conclusion:
- The desired question style "What action would you take here?" is fully compatible with current architecture.
- We only need UX/state cleanup and unification, not a fundamental backend rewrite.

### 3) MCQ flow today (problem)
- MCQ options are selectable, but grading waits for a separate `Submit answer` button.
- This adds unnecessary interaction friction.

### 4) Layout/surface state (problem)
Two lesson launch surfaces currently coexist:
1. Full-screen route: `apps/client/app/lesson/[lessonId].tsx` (correct direction).
2. Modal sheet launch from lobby: `LessonSheet` wraps full lesson content in `ModalSheet` (legacy path).

This causes product inconsistency and reinforces the wrong mental model (lesson inside sheet).

### 5) Board/sheet composition today
- Current `LessonContent` already renders actual `ActiveTableView` and separate instructor/question panels.
- However, the legacy `LessonSheet` path still places full lesson flow in a modal container.

Product direction to lock:
- Not "game in sheet".
- "Sheet over game".

## Refactor Goals
1. One interaction contract:
- Any learner event (MCQ click or poker action) is an answer event.

2. One visual architecture:
- Full normal game board is the base layer.
- Instructor + question + answer options live in a lesson sheet overlay.

3. One source of lesson truth for reseed:
- Canonical curriculum and step configs become authoritative for seed output.

## Proposed Interaction Architecture

### Unified Answer Event Model
Represent all graded user input as `LessonAnswerEvent`:
- `answerType: "mcq" | "action"`
- `payload`: option key or normalized poker action
- `stepId`, `attemptId`, `lessonId`

Behavior:
- `MCQ_STEP`: first option click immediately submits.
- `ACTION_STEP`: first valid ActionBar click immediately submits.
- Both transition into same grading state and same response rendering path.

### Step State Machine (locked)
- `QUESTION`: waiting for user event
- `SUBMITTING`: input locked, grading pending
- `RESULT`: response shown (correct/incorrect + explanation + EV line)
- `ADVANCE_READY`: next enabled

Rules:
- No separate MCQ submit state.
- No duplicate action controls in sheet.
- `ACTION_STEP` uses only real ActionBar.

## Proposed UI/UX Architecture

### Board-First Surface
- Base: full `ActiveTableView` in normal lesson route.
- Overlay: `LessonHalfSheet` attached to board view.
- Sheet content includes:
- instructor lead-in
- question
- MCQ buttons (if MCQ)
- grading response + short explanation
- next/finish control

### Explicit layout policy
- The board never moves into a modal lesson container.
- The lesson sheet is always an overlay component hosted by lesson screen.
- Remove/deprecate lobby `LessonSheet` full-flow modal path.

### Immediate MCQ grading behavior
- User taps option -> lock options -> show `Evaluating...` -> show result.
- Remove `Submit answer` button entirely.

### Action-step behavior
- User clicks fold/call/raise/etc in ActionBar.
- ActionBar locks immediately.
- Sheet shows evaluation + highest-EV explanation.
- User advances via `Next` in sheet.

## Backend/Contract Notes

### Existing API sufficiency
Current submit endpoint already supports this design.
No endpoint split required.

### Optional response enhancements (recommended)
Add/standardize optional grading fields for richer sheet output:
- `bestAction` (normalized action label)
- `evDeltaBb`
- `whyShort` (1-2 sentence explanation)
- `whyLong` (optional expanded coaching)

### Idempotency
Keep existing `(attemptId, stepId)` idempotent semantics unchanged.
This is critical for immediate-submit UX and retry-safe clients.

## Reseed Preparation Strategy

### Problem to resolve before reseed
Current system has split lesson sources:
- runtime 12-lesson seed script (`lesson_*_001` IDs)
- canonical content-backfill files (`L1_*`, `L2_*`, `L3_*` IDs)

### Reseed design decisions (required)
1. Pick one ID convention for all lessons.
2. Make `docs/lessons/content/*` canonical source for seed generation.
3. Generate module/order/role metadata from canonical config (not hardcoded router map).
4. Define per-step authoring support for both `MCQ_STEP` and `ACTION_STEP` under same grading envelope.

### Migration path
1. Build new seed generator from canonical lesson files.
2. Add dry-run validator report (lessons, steps, IDs, metadata).
3. Reseed into staging.
4. Run smoke + e2e (including immediate MCQ grading and action grading).
5. Cutover production seed path and remove legacy template seed.

## High-Level System Design Notes

### Client layers
- `LessonScreen`: board-first orchestration container.
- `LessonSessionStore/Hook`: attempt state, step state machine, submit lifecycle.
- `LessonHalfSheet`: presenter for question + result.
- `ActiveTableView`: unchanged game surface; receives lesson action override.

### Server layers
- `LessonsRouter`: list/detail/attempt/submit.
- `StepEvaluator`: deterministic grading by step type and grading version.
- `MasteryUpdater`: concept deltas from graded events.
- `ProgressProjector`: lesson/module completion and next-step recommendation.

### Authoring/seed layers
- Canonical lesson content (`lesson.md`, `step-config.json`, snapshots).
- Validation pipeline (`lessons:content:check` + strict snapshot mode).
- Seed compiler (canonical -> DB schema).

## Major Refactor Workstreams

### Workstream A: Interaction unification
- Remove MCQ submit button.
- Auto-submit on option click.
- Reuse same feedback rendering path for MCQ/action.

### Workstream B: Surface architecture cleanup
- Retire `LessonSheet` full-flow modal usage from lobby entry.
- Route lobby "Poker School" CTA to full lesson screen.
- Keep sheet only as overlay content panel in lesson screen.

### Workstream C: Seed/curriculum unification
- Replace legacy template seed ownership with canonical content source.
- Align IDs, module order, role metadata, and tier strategy.

### Workstream D: QA and rollout safety
- Update smoke tests for new submit behavior (no MCQ submit button assumption).
- Add regression coverage for action-step immediate grading and lock states.
- Verify idempotent replay responses and mastery stability.

## Actual Refactor Steps (Execution Plan)

1. Lock lesson entry surface to full-screen route only.
- Update `apps/client/app/lobby.tsx` to route Poker School CTA to `/lesson/<lessonId>` instead of opening `LessonSheet`.
- Remove `LessonSheet` usage from lobby flow.
- Keep `apps/client/app/lesson/[lessonId].tsx` as the canonical entrypoint.
- Status: DONE.

2. Remove legacy full-lesson modal container path.
- Deprecate `apps/client/src/features/lessons/LessonSheet.tsx` from lesson runtime flow.
- If retained temporarily for compatibility, make it a thin redirect wrapper to route-based lesson screen, not a full runtime host.
- Status: DONE (component removed).

3. Convert MCQ to immediate submit.
- Update `apps/client/src/features/lessons/LessonQuestionPanel.tsx`:
- remove `Submit answer` button
- on option click, call submit immediately
- lock options during `SUBMITTING` and after `RESULT`
- Update `apps/client/src/features/lessons/useLessonSession.ts`:
- replace `submitSelectedMcq()` flow with immediate event submit on option click
- preserve idempotent-safe behavior by guarding on `submitting` and existing feedback
- Status: DONE.

4. Unify learner event handling for MCQ and action.
- In `apps/client/src/features/lessons/useLessonSession.ts`, introduce a single answer-event submit path used by both:
- MCQ answer (`{ optionKey }`)
- Action answer (`{ type, amountCents? }`)
- Keep `toLessonActionPayload()` normalization as the action adapter.
- Status: DONE.

5. Enforce board-first + sheet-overlay composition.
- Refactor `apps/client/src/features/lessons/LessonContent.tsx` layout so:
- `ActiveTableView` is the base visual surface
- instructor/question/response UI is rendered in a half-sheet overlay component (`LessonHalfSheet`/equivalent)
- Ensure no duplicated action controls appear in the sheet.
- Status: PARTIAL (overlay implemented in `LessonContent`; dedicated `LessonHalfSheet` component extraction still pending).

6. Keep ACTION_STEP grading loop strict.
- Preserve current behavior where ActionBar click triggers submit and immediate lock.
- In `LessonContent.tsx`, keep `forceDisableActions` true during submit/result transitions.
- Show evaluating and graded feedback in instructor overlay only.
- Status: DONE.

7. Standardize step progression controls.
- Replace mixed `Prev/Next` placement with overlay-owned progression action for lesson flow consistency.
- Maintain explicit user acknowledgement (`OK`/`Next`) after result before advancing.
- Status: PARTIAL (explicit advance exists; naming/placement harmonization still pending).

8. Move lesson metadata ownership out of hardcoded router map.
- Replace or minimize `LESSON_UI_META` in `src/http/LessonsRouter.ts`.
- Source module/order/role/repeatable/tags from canonical lesson content during seed generation.
- Status: PENDING.

9. Implement canonical-content-driven seed compiler.
- Add script to read `docs/lessons/content/*/step-config.json` and upsert lessons/steps/options/concepts.
- Keep `scripts/check-lessons-content.ts` as mandatory pre-seed gate.
- Replace dependency on template-only seed logic in `scripts/seed-lessons-v1.ts`.
- Status: PENDING.

10. Define reseed migration and compatibility policy.
- Choose final lesson ID scheme and produce ID mapping for existing attempt/progress data.
- Add staging reseed dry-run report: lesson count, IDs, step counts, module ordering, repeatable flags.
- Status: PENDING.

11. Update automated tests.
- Client: update/add tests for no-submit MCQ behavior and board-overlay flow.
- Server: keep/extend lessons router tests for idempotent submit and grading envelope.
- E2E: update lessons flow spec to validate:
- MCQ tap -> immediate result
- action click -> immediate result
- explicit `OK/Next` advancement
- Status: PARTIAL (unit/integration updates done for session + utilities; broader e2e expansion pending).

12. Run rollout gates and cutover.
- Execute: content check, seed, smoke, server lessons tests, client tests, e2e lessons flow.
- Remove legacy modal lesson launch path after route-based flow is verified in staging.
- Status: PARTIAL (local tests/typechecks pass; full lessons gate + staged cutover pending).

## Risks And Mitigations
- Risk: duplicate lesson entry surfaces linger.
- Mitigation: remove modal launch path in same release as board-first cutover.

- Risk: accidental double-submit on rapid taps.
- Mitigation: strict `SUBMITTING` lock on client + existing server idempotency.

- Risk: reseed breaks progress continuity.
- Mitigation: define ID migration map before production reseed.

## Proposed Implementation Sequence
1. Lock product rules in this doc.
2. Implement MCQ immediate submit + remove submit button.
3. Remove lobby modal full-lesson path; route to lesson screen.
4. Introduce/normalize `LessonHalfSheet` overlay over full board.
5. Build canonical-content-driven seed compiler.
6. Reseed staged curriculum and run full lessons gate.

## Expected Outcome
- Lessons feel like real-table training, not quiz-in-modal content.
- MCQ and action questions behave consistently as event-driven graded decisions.
- Curriculum/seed pipeline is coherent and ready for full rewrite + reseed.
