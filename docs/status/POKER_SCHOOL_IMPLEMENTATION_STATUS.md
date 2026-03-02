# Poker School Implementation Status

Status as of the latest implementation pass. Aligns with [POKER_SCHOOL_UPGRADE_PROPOSAL.md](../proposals/POKER_SCHOOL_UPGRADE_PROPOSAL.md).

## Four critical components (done)

| Component | Status | Notes |
|-----------|--------|--------|
| **1. Server-driven Boot Camp progress** | Done | List API returns `progressState`, `completedAttempts`, `bestScorePct`; index and progress bar are server-driven. |
| **2. Lesson completion moment** | Done | Score, disciplines practiced, lesson-specific apply CTA (`applyCtaText` from DB), "Back to Boot Camp." |
| **3. EV in bb** | Done | Optional `evBb` / `evErrorBb` in step grading; shown as e.g. "+1.8 bb EV" in feedback. |
| **4. Same-table transition** | Done | Apply CTA → `/lobby`; `fromLesson` query shows one-line nudge. |

## Tier 1 foundation (done)

- List API progress: per-lesson state, last/best score, attempt count.
- Index uses real progress: Resume, Completed, Run again, completion counts from API.
- Boot Camp identity: Cash Game Boot Camp, server-driven progress bar (X/total), Phase grouping (Module A/B/C).
- Lesson completion screen: score, disciplines, **lesson-specific** apply CTA (from `Lesson.applyCtaText`), primary CTA to lobby, secondary Back to Boot Camp.

## Tier 2 value and habit (done)

- **Cadence:** `GET /api/lessons` returns `cadence.completedAttemptsLast7Days`. Boot Camp section shows "Trained X times in the last 7 days."
- **Recommended next lesson:** First incomplete Boot Camp lesson surfaced as "Next: [title]" in Recommended focus.
- **Soft premium badging:** `Lesson.tier` (free/pro/elite); Pro/Elite chip on lesson cards; "Included in: Pro" (or Elite) on lesson page; "Boot Camp Certified" when all Boot Camp lessons completed.
- **One-line takeaway for wrong answers:** Optional `takeawayIncorrect` in step `gradingSpecJson`; returned in feedback and shown as "Takeaway: …" in LessonInstructorPanel when answer is incorrect.
- **Boot Camp graduation in completion view:** When completion is shown, client fetches list; if all lessons are completed, shows "Boot Camp Certified" and "Continue with Advanced Drills" (navigates back to index).

## Tier 3 and optional (done)

- **Blog/replay links in completion:** `Lesson.blogPostSlug` and `Lesson.replayHandId` (optional). GET lesson returns them; completion view shows "Related" with "Read blog post" → `/blog/[slug]` and "Replay hand" → `/replay/[handId]` when set. Migration: `20260228200000_lesson_blog_replay_links`.
- **Frequency line in feedback:** Optional `frequencyPerMonth` (number) in step `gradingSpecJson`; returned in feedback; LessonInstructorPanel shows "You'll see this node ~N times per month." when present.

## Schema and API changes

- **Lesson:** `tier` (optional, default `pro`), `applyCtaText` (optional). Migration: `20260228180000_lesson_tier_apply_cta`. `blogPostSlug`, `replayHandId` (optional). Migration: `20260228200000_lesson_blog_replay_links`.
- **List response:** `cadence: { completedAttemptsLast7Days }`, per-lesson `tier`, `applyCtaText`.
- **GET lesson:** `tier`, `applyCtaText`, `blogPostSlug`, `replayHandId` on lesson object.
- **Step grading / feedback:** Optional `takeawayIncorrect` (string), `frequencyPerMonth` (number) in `gradingSpecJson`; included in submit feedback when relevant. Client shows takeaway for wrong answers and frequency line when present.

## Tests

- `pnpm test:server:lessons` — LessonsRouter (list, attempt, submit, progress, idempotent, etc.).
- `pnpm test:client:lessons` — useLessonSession.

## Remaining (optional / future)

- **Reveal stack polish:** Further UI polish for EV/solver reveal (current reveal is functional).
- **Value-proof:** One credible recoverable-edge example when we have data; avoid overpromising until then.
- **Module graduation:** Dedicated "Module A complete" screen (Boot Camp graduation is in completion view).
