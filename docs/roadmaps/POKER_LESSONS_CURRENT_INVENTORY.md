# Poker Lessons Current Inventory (Post–Canonical Refactor)

## Snapshot

- **Date:** 2026-03-02
- **Purpose:** Current-state inventory after canonical metadata refactor (DB-driven grouping/order, single content seed, legacy V1 removed).
- **See also:** `docs/LESSONS_PAGE_INVENTORY.md` for screen behavior, data flow, step profile, and Instructor analysis plan.

## Executive summary

- **Single catalog:** 15 lessons (L01–L15) from `content/lessons/content`. Seed: `scripts/seed-lessons-content.ts` only.
- **Metadata in DB:** `Lesson` has `moduleCode`, `recommendedOrder`, `role`, `repeatable`, `curriculumVersion`. API and UI use these for grouping and ordering; no hardcoded lesson-id map.
- **Legacy:** V1 seed (`scripts/seed-lessons-v1.ts`) and `LESSON_UI_META` in the router have been removed or deprecated. Lobby "Poker School" links to `/lessons` (not a fixed lesson id).

## Current catalog (what `/api/lessons` serves)

- **Source:** `content/lessons/content/L01` … `L15` → `scripts/seed-lessons-content.ts` → DB.
- **IDs:** L01, L02, … L15.
- **Step pattern:** 2 steps per lesson: INFO_STEP then ACTION_STEP. No MCQ in canonical content.
- **Module / role / repeatable / order:** In each lesson’s `step-config.json` (`moduleCode`, `recommendedOrder`, `role`, `repeatable`) and persisted to `Lesson` by the seed.

### Lessons (15)

| # | Id  | Title                         | Module   | Role    | Repeatable |
|---|-----|-------------------------------|---------|---------|------------|
| 1 | L01 | OESD vs Half-Pot              | A       | teaches | no         |
| 2 | L02 | Flush Draw vs Pot Bet         | A       | teaches | no         |
| 3 | L03 | Combo Draw vs All-In          | A       | teaches | no         |
| 4 | L04 | Top Pair vs Pot Bet           | A       | teaches | no         |
| 5 | L05 | Two Overcards vs Min Bet      | A       | teaches | no         |
| 6 | L06 | KK SB vs BB                   | B       | teaches | no         |
| 7 | L07 | 88 vs Two All-Ins             | B       | teaches | no         |
| 8 | L08 | AK vs Two All-Ins            | B       | teaches | no         |
| 9 | L09 | AK vs Two Limpers             | B       | teaches | no         |
|10 | L10 | AA UTG 9-Handed               | B       | teaches | no         |
|11 | L11 | A7s UTG Tournament             | C       | teaches | no         |
|12 | L12 | Low Flush vs Double All-In    | C       | teaches | no         |
|13 | L13 | Middle Pair vs Half-Pot Turn  | C       | teaches | no         |
|14 | L14 | Two Pair on Flush Board       | C       | teaches | no         |
|15 | L15 | 22 Chip Leader vs Raise       | C       | teaches | no         |

(Exact role/repeatable per lesson come from step-config; above assumes current content. Module A/B/C = MODULE_A, MODULE_B, MODULE_C.)

## Scripts and references

- **Seed:** `pnpm lessons:seed:content` (option: `--replace-noncanonical` to delete non-canonical lessons from DB).
- **Content check:** `pnpm lessons:content:check` (validates `content/lessons/content`).
- **API:** `src/http/LessonsRouter.ts` — list ordered by `moduleCode`, `recommendedOrder`, `createdAt`; lesson fields from DB.
- **Client:** `apps/client/app/lessons.tsx` — catalog and module sections from API payload.

## Removed / deprecated

- **Runtime V1 catalog:** 12 lessons with ids `lesson_preflop_3bet_001`, etc. No longer seeded for production; `scripts/seed-lessons-v1.ts` is deprecated (see its top-of-file message and `scripts/guard-no-legacy-seed.mjs`).
- **LESSON_UI_META:** No longer in `LessonsRouter.ts`; module/role/order/ repeatable come from `Lesson` table.

## Next steps (from LESSONS_PAGE_INVENTORY)

- **Instructor analysis:** Add real `followUpCorrect` / `followUpIncorrect` (and `followUpReasonable` where needed) in ACTION_STEP `gradingSpecJson` in step-configs; reseed; optionally relax placeholder detection in `LessonInstructorPanel`. See section 7 of `docs/LESSONS_PAGE_INVENTORY.md`.

