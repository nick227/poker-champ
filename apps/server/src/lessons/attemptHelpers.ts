/** Pure helpers for attempt/step index and score. */

export function computeCurrentStepIndex(
  lessonSteps: Array<{ id: string; sequence: number }>,
  submittedSteps: Array<{ step?: { sequence?: number | null } | null }> | null | undefined,
): number {
  if (!lessonSteps.length) return 0;
  if (!submittedSteps || submittedSteps.length === 0) return 0;
  const submittedSequences = submittedSteps
    .map((s) => (typeof s?.step?.sequence === "number" ? s.step.sequence : null))
    .filter((v): v is number => v != null);
  if (!submittedSequences.length) return 0;
  const maxSubmittedSequence = Math.max(...submittedSequences);
  const nextIdx = lessonSteps.findIndex((step) => step.sequence > maxSubmittedSequence);
  return nextIdx === -1 ? lessonSteps.length - 1 : nextIdx;
}

export function scorePctFromCounts(correctCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return Math.round((correctCount / totalCount) * 10000) / 100;
}
