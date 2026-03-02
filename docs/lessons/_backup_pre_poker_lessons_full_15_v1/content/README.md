# Lessons Content Source

This directory is the canonical source-of-truth for lesson content backfill.

Structure:
- `<lesson-id>/lesson.md` human instructional spec
- `<lesson-id>/step-config.json` machine runtime + grading config
- `<lesson-id>/snapshots/*.json` lesson-specific snapshots (optional)
- `_shared/snapshots/*.json` reusable snapshots

Validation:
- Run `pnpm lessons:content:check`
- Optional strict snapshot contract check:
  - `LESSONS_STRICT_SNAPSHOT=1 pnpm lessons:content:check`
