import { awardCatalog, resolveReason } from "./awardCatalog.js";
import type { GrantCandidate } from "./types.js";

/** Module boundaries: A = L1–L4, B = L5–L8, C = L9–L12 (inventory). */
const MODULE_A_COUNT = 4;
const MODULE_B_COUNT = 8;
const MODULE_C_COUNT = 12;

export type LessonForAwards = { id: string; title: string };
export type AttemptForAwards = {
  id: string;
  lessonId: string;
  scorePct: number | null;
};
export type LessonAwardInput = {
  attempt: AttemptForAwards;
  lesson: LessonForAwards;
  completedLessonCount: number;
  firstTry: boolean;
};

/**
 * Pure: returns candidates for bulkGrant. Does not touch DB.
 * Caller must resolve lesson title and firstTry (no incorrect steps in this attempt).
 */
export function evaluateLessonAwards(input: LessonAwardInput): GrantCandidate[] {
  const { attempt, lesson, completedLessonCount, firstTry } = input;
  const scorePct = attempt.scorePct ?? 0;
  const lessonTitle = lesson.title;
  const params = { lessonTitle };
  const candidates: GrantCandidate[] = [];

  const add = (awardId: string, fallbackReason: string, triggerKey?: string) => {
    const entry = awardCatalog.getById(awardId);
    const resolved = entry ? resolveReason(entry.reasonTemplate, params) : fallbackReason;
    candidates.push({
      awardId,
      reason: resolved,
      contextType: "LESSON",
      contextId: lesson.id,
      ...(triggerKey && { triggerKey }),
    });
  };

  if (completedLessonCount >= 1) add("first_lesson_ever", "");
  const lessonCompleteId = awardCatalog.getLessonCompletionAwardId(lesson.id);
  const lessonCompleteEntry = awardCatalog.getById(lessonCompleteId);
  if (lessonCompleteEntry) add(lessonCompleteId, "");
  if (completedLessonCount >= MODULE_A_COUNT) add("module_A_done", "");
  if (completedLessonCount >= MODULE_B_COUNT) add("module_B_done", "");
  if (completedLessonCount >= MODULE_C_COUNT) {
    add("module_C_done", "");
    add("curriculum_done", "");
  }

  if (scorePct >= 95 && scorePct < 100) add("lesson_sharp", "", `sharp_${lesson.id}_${attempt.id}`);
  if (scorePct >= 100) add("lesson_perfect", "", `perfect_${lesson.id}_${attempt.id}`);
  if (firstTry) add("lesson_first_try", "", lesson.id);

  return candidates;
}
