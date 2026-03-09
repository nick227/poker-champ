import { asObject } from "../utils/objectHelpers.js";
import type { NormalizedGradingSpec } from "../types.js";

const DEFAULT_RESPONSE_CORRECT = "Correct.";
const DEFAULT_RESPONSE_INCORRECT = "Not quite. Review the spot and try again.";
const DEFAULT_FOLLOW_UP = "Review the explanation and continue.";

function stringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((v): v is string => typeof v === "string").map((s) => s.toLowerCase());
}

/**
 * Normalize grading spec once from raw JSON. Call at submit when loading step;
 * engine receives NormalizedGradingSpec only (no JSON walking in hot path).
 */
export function normalizeGradingSpec(
  gradingSpecJson: unknown,
  stepFollowUpMessage: string | null,
): NormalizedGradingSpec {
  const spec = asObject(gradingSpecJson);
  const type = typeof spec?.type === "string" ? spec.type : "";
  const rubric = asObject(spec?.rubric);
  const acceptedAnswers = asObject(rubric?.acceptedAnswers);

  return {
    type,
    responseCorrect:
      typeof spec?.responseCorrect === "string" ? spec.responseCorrect : DEFAULT_RESPONSE_CORRECT,
    responseIncorrect:
      typeof spec?.responseIncorrect === "string"
        ? spec.responseIncorrect
        : DEFAULT_RESPONSE_INCORRECT,
    followUpContent:
      typeof spec?.followUpContent === "string"
        ? spec.followUpContent
        : typeof spec?.followUpCorrect === "string"
          ? spec.followUpCorrect
          : (stepFollowUpMessage ?? DEFAULT_FOLLOW_UP),
    responseReasonable:
      typeof spec?.responseReasonable === "string" ? spec.responseReasonable : undefined,
    evBb:
      typeof spec?.evBb === "number" && Number.isFinite(spec.evBb) ? spec.evBb : null,
    evErrorBb:
      typeof spec?.evErrorBb === "number" && Number.isFinite(spec.evErrorBb) ? spec.evErrorBb : null,
    takeawayIncorrect:
      typeof spec?.takeawayIncorrect === "string" && spec.takeawayIncorrect.trim().length > 0
        ? spec.takeawayIncorrect.trim()
        : null,
    frequencyPerMonth:
      typeof spec?.frequencyPerMonth === "number" &&
      Number.isFinite(spec.frequencyPerMonth) &&
      spec.frequencyPerMonth >= 0
        ? spec.frequencyPerMonth
        : null,
    gradingMode: typeof spec?.gradingMode === "string" ? spec.gradingMode : null,
    expectedAction: typeof spec?.expectedAction === "string" ? spec.expectedAction : undefined,
    expectedOptionKey:
      typeof spec?.expectedOptionKey === "string" ? spec.expectedOptionKey : undefined,
    rubric: acceptedAnswers
      ? {
          STRONG: stringArray(acceptedAnswers.STRONG),
          REASONABLE: stringArray(acceptedAnswers.REASONABLE),
          WEAK: stringArray(acceptedAnswers.WEAK),
        }
      : null,
    response: typeof spec?.response === "string" ? spec.response : undefined,
  };
}
