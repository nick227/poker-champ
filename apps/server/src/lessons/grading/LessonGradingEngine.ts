import { asObject } from "../utils/objectHelpers.js";
import type { GradeResult, NormalizedGradingSpec } from "../types.js";

type NormalizedAction = {
  type: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amountCents?: number;
};

function toGradingActionKey(type: NormalizedAction["type"] | undefined): string {
  if (!type) return "";
  const t = type.toLowerCase();
  if (t === "bet" || t === "raise" || t === "all_in") return "raise";
  return t;
}

function normalizeLessonAction(answer: unknown): NormalizedAction | null {
  const obj = asObject(answer);
  if (!obj) return null;
  const rawType = typeof obj.type === "string" ? obj.type.toUpperCase() : "";
  const amountRaw =
    typeof obj.amount === "number" ? obj.amount : typeof obj.amountCents === "number" ? obj.amountCents : undefined;
  const amountCents =
    amountRaw != null && Number.isFinite(amountRaw) ? Math.max(0, Math.round(amountRaw)) : undefined;
  switch (rawType) {
    case "FOLD":
      return { type: "fold" };
    case "CHECK":
      return { type: "check" };
    case "CALL":
      return { type: "call" };
    case "BET":
      return { type: "bet", amountCents };
    case "RAISE":
      return { type: "raise", amountCents };
    case "ALL_IN":
      return { type: "all_in", amountCents };
    default:
      return null;
  }
}

function hasValidMcqAnswer(answer: unknown): boolean {
  const obj = asObject(answer);
  if (!obj) return false;
  return typeof obj.optionKey === "string" && obj.optionKey.trim().length > 0;
}

const REASONABLE_FALLBACK =
  "Reasonable line. Compare your assumptions against the strongest baseline.";

/**
 * Pure grading: given normalized spec and answer, returns grade result.
 * No DB, no I/O. Used by LessonAttemptService inside transaction.
 */
export function gradeStep(
  spec: NormalizedGradingSpec,
  stepType: string,
  answer: unknown,
): GradeResult {
  if (spec.type === "ACTION_STEP") {
    const normalized = normalizeLessonAction(answer);
    if (spec.gradingMode === "RUBRIC_SUBJECTIVE" && spec.rubric) {
      const submitted = toGradingActionKey(normalized?.type);
      const strong = spec.rubric.STRONG.includes(submitted);
      const reasonable = spec.rubric.REASONABLE.includes(submitted);
      const weak = spec.rubric.WEAK.includes(submitted);
      const gradeBand = strong ? "STRONG" : reasonable ? "REASONABLE" : weak ? "WEAK" : null;
      const responseReasonable = spec.responseReasonable ?? REASONABLE_FALLBACK;
      if (gradeBand === "STRONG") {
        return {
          isCorrect: true,
          response: spec.responseCorrect,
          followUp: spec.followUpContent,
          scoreDelta: 0,
          gradeBand: "STRONG",
        };
      }
      if (gradeBand === "REASONABLE") {
        return {
          isCorrect: true,
          response: responseReasonable,
          followUp: spec.followUpContent,
          scoreDelta: 0,
          gradeBand: "REASONABLE",
        };
      }
      return {
        isCorrect: true,
        response: spec.responseIncorrect,
        followUp: spec.followUpContent,
        scoreDelta: 0,
        gradeBand: gradeBand ?? "WEAK",
      };
    }
    const expected = (spec.expectedAction ?? "").toUpperCase();
    const submittedRaw = normalized?.type ? normalized.type.toUpperCase() : "";
    const submitted =
      expected === "RAISE" && (submittedRaw === "BET" || submittedRaw === "ALL_IN")
        ? "RAISE"
        : submittedRaw;
    const isCorrect = submitted === expected;
    const evBb = isCorrect ? spec.evBb : spec.evErrorBb;
    return {
      isCorrect,
      response: isCorrect ? spec.responseCorrect : spec.responseIncorrect,
      followUp: spec.followUpContent,
      scoreDelta: isCorrect ? 1 : 0,
      evBb: evBb ?? undefined,
      takeaway: !isCorrect ? spec.takeawayIncorrect ?? undefined : undefined,
      frequencyPerMonth: spec.frequencyPerMonth ?? undefined,
    };
  }

  if (spec.type === "MCQ_STEP") {
    const obj = asObject(answer);
    const expected = spec.expectedOptionKey ?? "";
    const submitted = typeof obj?.optionKey === "string" ? obj.optionKey : "";
    const isCorrect = submitted === expected;
    const evBb = isCorrect ? spec.evBb : spec.evErrorBb;
    return {
      isCorrect,
      response: isCorrect ? spec.responseCorrect : spec.responseIncorrect,
      followUp: spec.followUpContent,
      scoreDelta: isCorrect ? 1 : 0,
      evBb: evBb ?? undefined,
      takeaway: !isCorrect ? spec.takeawayIncorrect ?? undefined : undefined,
      frequencyPerMonth: spec.frequencyPerMonth ?? undefined,
    };
  }

  return {
    isCorrect: true,
    response: spec.response ?? "Continue.",
    followUp: "Continue.",
    scoreDelta: 0,
  };
}

export function validateActionAnswer(stepType: string, answer: unknown): boolean {
  if (stepType === "ACTION_STEP") return normalizeLessonAction(answer) != null;
  if (stepType === "MCQ_STEP") return hasValidMcqAnswer(answer);
  return true;
}
