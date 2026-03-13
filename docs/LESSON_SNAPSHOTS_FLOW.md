# Lesson step snapshots: where they come from and how they’re used

## Source of truth

- **Content (files):** `content/lessons/content/<lessonId>/step-config.json` and `./snapshots/step_XX.json`.
- **Pipeline:** Specs are validated and projected in `apps/server/src/lessons/` (`buildLessonFromSpec`, `projectSpecToSnapshots`). Projection produces `TableSnapshotPayload`-shaped JSON per hero decision. A separate process (seed/import) writes these into the DB as `LessonStep.snapshotJson`.
- **API:** `GET /api/lessons/:lessonId` returns the lesson; each step includes `snapshot: step.snapshotJson` from the DB (`LessonDetailService`).

So the client always receives step snapshots from the **server** (DB), not by reading content files directly. Content files are the source that gets imported into the DB.

## Client processing

1. **LessonContent** gets `step` from `useLessonSession` (which got the lesson from `lessonService.getLesson(lessonId)`).  
   `stepSnapshot = step?.snapshot ?? null`.

2. **Scene model:** `buildTableSceneModel(stepSnapshot, null, "CONNECTED")` in `useTableSceneModel.ts`:
   - Builds seat context, hero status, `isMyTurn` (from `hand.toActSeat === hero.seat`).
   - Uses `snapshot.hero.actionOptions` and optionally merges call-with-stack and **wager bounds** (see below).
   - `getActionContext({ isMyTurn, actionOptions, connectionStatus })` produces `showActions`, `allowedActions` (FOLD, CHECK, CALL, WAGER, ALL_IN), and `wager` (bounds + resolve/buildPayload).

3. **Action bar:** `allowedActions` is turned into permissions (`getActionBarPermissions`). Buttons are enabled only when the corresponding permission is true. **WAGER** (Bet/Raise) is true only when `actionContext.wager` is defined; `wager` is built in `resolveWagerContext`, which requires `minRaiseTo` and `maxRaiseTo` on `actionOptions`.

## Snapshot/processing alignment issues

- **Lesson snapshots from projection** (`projectSpecToSnapshots` → `actionOptionsForExpected`) set only capability flags and `primaryWagerAction`; they do **not** set `minRaiseTo` or `maxRaiseTo`. So lesson steps that expect BET/RAISE have no wager bounds in the snapshot.
- If the client does not derive bounds when they’re missing, `resolveWagerContext` returns `undefined`, so `allowedActions.WAGER` is false and the Bet/Raise button is **disabled** even though the snapshot says `canBet: true`. That matches “buttons visible but not responding” (they’re disabled).
- **Step index vs snapshot:** `currentStep` is `lesson.steps[resolvedStepIndex]`; that step’s `snapshot` must be the one for that decision. If the DB has the wrong snapshot on a step (e.g. step 2’s row has step 1’s snapshot), you get wrong or disabled actions. Checking recent changes to content/DB and to `buildTableSceneModel` / `getActionContext` is useful when debugging.

## Checking for recent snapshot/content changes

```powershell
git log -20 --oneline -- content/lessons/content/
git log -20 --oneline -- apps/server/src/lessons/
git diff --name-only HEAD~10 -- content/lessons/content/
```
