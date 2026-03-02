# Poker School System Implementation Roadmap

## Summary
Build a new `lessons` epic by reusing the replay/table rendering stack (`ActiveTableView`, snapshot-driven state, `ActionBar`) while isolating lesson logic into a new feature domain (`features/lessons`) so live/replay codepaths are not polluted with deep conditionals.

Phase 1 is DB-backed with seed/backfill data, server-authoritative grading, lobby quick-link entry + sheet UI, and a full mastery model.

## Delivery Artifact
- Create: `docs/roadmaps/POKER_SCHOOL_IMPLEMENTATION_ROADMAP.md`
- Positioning: implementation roadmap only (does not replace proposal/architecture docs)

## Current-State Baseline (Grounded)
- Replay stack is modular and stable: `ReplaySheet` -> `ReplayContent` -> `ReplaySurface` -> `ActiveTableView`.
- Replay mode is already isolated via `tableMode="replay"` and has hermetic tests.
- Lesson MVP scaffolding exists (`/lesson/[lessonId]`, `useLessonTableProvider`, `LessonPanel`, `lib/lessons/*`) but remains hardcoded/local.
- Existing docs contain mixed historical direction; this roadmap standardizes route/provider isolation and no deep branching in shared table UI.

## Architecture Decisions (Locked)
- Build on existing lesson MVP files; do not discard and rewrite from scratch.
- Phase 1 content source is DB-backed lesson schema with seeded PoC lessons.
- Phase 1 entry UX is lobby quick-link + sheet-first.
- Grading is server-authoritative.
- Progress scope includes full mastery tracking in phase 1.
- Coupling guardrail: no `if (lesson)` chains inside `ActionBar`, `ActiveTableView`, or core live-table providers/stores.

## Public Interfaces and Type/API Changes
Add lesson API contracts:
- `GET /v1/lessons`: list lessons with metadata and mastery gating.
- `GET /v1/lessons/:lessonId`: lesson payload with ordered steps and snapshots.
- `POST /v1/lessons/:lessonId/attempts`: start/resume attempt.
- `POST /v1/lessons/:lessonId/attempts/:attemptId/steps/:stepId/submit`: submit action/MCQ answer and return authoritative result.
- `GET /v1/lessons/mastery`: user concept mastery summary.

Client types to add:
- `LessonDefinition`
- `LessonStep`
- `LessonStepType`
- `LessonPrompt`
- `LessonFeedback`
- `LessonAttempt`
- `LessonMastery`

Step types in phase 1:
- `ACTION_STEP`: user answers via existing `ActionBar`.
- `MCQ_STEP`: user answers via multiple-choice UI.
- `INFO_STEP`: message-only instructional pacing node.

Standard step message envelope:
- `beforeInstructorMessage`
- `question`
- `response` (computed after submit)
- `followUpInstructorMessage`

Important boundary:
- Keep replay interfaces stable (no lesson conditionals in `ReplaySource`).
- Build separate `LessonSheet`/`LessonContent` and reuse rendering components compositionally.

## Data Model and Schema Plan (Prisma)
Add `Lesson`:
- `id`, `slug`, `title`, `description`, `difficulty`, `status`, `estimatedMinutes`, `version`, `createdAt`, `updatedAt`

Add `LessonStep`:
- `id`, `lessonId`, `sequence`, `type`, `snapshotJson`, `beforeMessage`, `questionText`, `followUpMessage`, `gradingSpecJson`, `explanationJson`

Add `LessonStepOption` (MCQ options):
- `id`, `stepId`, `optionKey`, `label`, `valueJson`, `displayOrder`, `isCorrect`

Add `LessonConcept`:
- `id`, `code`, `name`, `description`

Add `LessonStepConcept`:
- `stepId`, `conceptId`, `weight`

Add `LessonAttempt`:
- `id`, `lessonId`, `userId`, `status`, `startedAt`, `completedAt`, `scorePct`, `masteryDeltaJson`

Add `LessonAttemptStep`:
- `id`, `attemptId`, `stepId`, `submittedAnswerJson`, `isCorrect`, `feedbackJson`, `submittedAt`

Add `UserConceptMastery`:
- `id`, `userId`, `conceptId`, `masteryScore`, `confidence`, `lastUpdatedAt`

Indexing/uniques:
- Unique `(lessonId, sequence)` for deterministic ordering.
- Unique `(userId, conceptId)` for mastery lookup.
- Index `(userId, completedAt)` on attempts for progression analytics.

## Backfill and Seed Data Plan
- Seed at least 2 deterministic PoC lessons.
- Lesson 1: guided action decision hand with pre/post instruction.
- Lesson 2: poker math/situational MCQ with question -> response -> follow-up.
- Seed snapshots must conform to current `TableSnapshotPayload` schema/version.
- Validate snapshot version at seed/build time.
- Use deterministic IDs/slugs for stable fixtures and QA.
- Include concept tags (for example: `pot_odds`, `position`, `cbet_theory`).

## Client Implementation Plan
1. Create lessons feature domain:
- `apps/client/src/features/lessons`

2. Add lesson services/hooks:
- `lesson.service.ts` for API calls.
- `useLessonSession.ts` for attempt lifecycle and step transitions.
- `useLessonStepSubmit.ts` for authoritative submit and feedback state.

3. Build lesson player UI with loose coupling:
- `LessonSheet.tsx` (replay-like container ergonomics)
- `LessonContent.tsx` (source dispatcher)
- `LessonInstructorPanel.tsx` (before/response/follow-up)
- `LessonQuestionPanel.tsx` (MCQ rendering)

4. Action step wiring:
- `ACTION_STEP` uses existing `ActionBar` action payload path.
- Submit action payload to lesson step submit endpoint.
- Lock/advance based on server result.

5. MCQ step wiring:
- Render options under question.
- On submit, show response and follow-up.
- Require explicit `Next` to continue.

6. Lobby entry integration:
- Add `Poker School` quick-link adjacent to replay quick links.
- Open `LessonSheet` with default seeded lesson.
- Keep replay links unchanged.

7. Existing MVP migration:
- Move hardcoded lesson logic behind compatibility adapter and deprecate.
- Make `/lesson/[lessonId]` consume lesson APIs and shared lesson feature components.

## Server Implementation Plan
1. Add Prisma models + migration.
2. Add repository/service for lesson retrieval, attempts, grading, mastery updates.
3. Add grading engine:
- Deterministic evaluators by `step.type`.
- Canonical feedback payload: `response`, `followUp`, correctness, score delta.
4. Add mastery engine:
- Update concept mastery from `LessonStepConcept.weight`.
- Persist to `UserConceptMastery` on each graded step.
5. Add lesson HTTP controllers + auth checks.
6. Add seed script for lesson and concept graph.

## Safety and Coupling Guardrails
- Do not add lesson branches to core live table hooks/stores.
- Keep replay regression risk low by separate feature orchestration.
- Do not join realtime sockets for lessons in phase 1.
- Keep lesson runtime state local to lesson feature/provider boundary.

## Testing and Acceptance Scenarios
Schema/data:
- Migration applies and rolls back cleanly.
- Seeds create valid lesson graph and snapshots.

Services:
- Deterministic step sequence and resume behavior.
- Correct grading payload for action and MCQ.
- Mastery updates are deterministic and idempotent on retries.

Client unit:
- `useLessonSession` handles start/resume/submit/advance.
- Instructor panel order: before -> question -> response -> follow-up.

Component/integration:
- `ACTION_STEP` captures `ActionBar` payload and blocks advance until response.
- `MCQ_STEP` enforces option selection before submit.
- Lobby quick-link opens lesson sheet and loads default lesson.

Regression/hermetic:
- Replay behavior remains unchanged.
- Lessons generate zero table realtime room/socket activity.
- Lessons do not mutate live lobby/table global stores.

E2E:
- Complete mixed-step lesson (action + MCQ) end-to-end.
- Mastery score updates and is visible via mastery endpoint.

## Rollout Plan
- Gate behind feature flag `lessons_v1`.
- Internal QA against seeded lessons.
- Enable in dev/staging first, then controlled production rollout.
- Track metrics: starts, completion rate, per-step accuracy, mastery deltas, API latency, API error rate.

## Assumptions and Defaults
- Snapshot contract remains `TableSnapshotPayload` v1 in phase 1.
- Lessons remain single-player and HTTP-driven in phase 1.
- Authoring UI is out of scope; content comes from seed/backfill scripts.
- Replay UI/components are reused via composition, not deep abstraction inheritance.
- Existing lesson MVP files are migration targets, not the final architecture boundary.

