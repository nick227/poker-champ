# Lessons Content Source

This directory is the canonical source-of-truth for lesson content.

**Structure:**
- `<lesson-id>/lesson.md` — human instructional spec
- `<lesson-id>/step-config.json` — machine runtime + grading config
- `<lesson-id>/snapshots/*.json` — lesson-specific snapshots (optional)
- `_shared/snapshots/*.json` — reusable snapshots

**Ghost lessons (full-hand):** Step-config may include `replayHandId` (links to hand replay for “Watch the full hand”). Steps can include optional metadata: `street`, `board`, `proActionSeat`, `proActionAmountCents` for debugging and analytics.

**Export from replay:** To create a ghost lesson from a played hand (requires replay frames):

```bash
pnpm lessons:export:replay --handId=<id> --heroSeat=<0-8> [--lessonId=L22] [--maxSteps=10]
```

See `docs/plans/LESSON_EXPORT_SYSTEM.md` for details.

**Validation:**
- Run `pnpm lessons:content:check`
- Seed runs ghost validation: `pnpm lessons:seed:content`
- Optional strict snapshot contract: `LESSONS_STRICT_SNAPSHOT=1 pnpm lessons:content:check`
