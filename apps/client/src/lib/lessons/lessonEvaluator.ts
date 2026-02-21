import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";

export interface LessonEvaluation {
  correct: boolean;
  explanation: string;
  expected?: string;
}

export interface EvaluateLessonAnswerParams {
  lessonId: string;
  snapshot: TableSnapshotPayload;
  answer: Parameters<ActionBarOnAction>[0];
}

/**
 * Pure lesson evaluator function.
 * 
 * Evaluates student answers against lesson expectations.
 * Never touches React state, never mutates snapshot, fully testable.
 */
export function evaluateLessonAnswer({
  lessonId,
  snapshot,
  answer,
}: EvaluateLessonAnswerParams): LessonEvaluation {
  switch (lessonId) {
    case "preflop-raise-decision":
      return evaluatePreflopRaiseDecision(snapshot, answer);
    case "continuation-bet-spot":
      return evaluateContinuationBet(snapshot, answer);
    default:
      return {
        correct: false,
        explanation: "Unknown lesson",
      };
  }
}

/**
 * Evaluates preflop raise decision lesson.
 * 
 * Correct answer: RAISE (3-bet)
 * Reason: Hero has AK, strong hand worth re-raising
 */
function evaluatePreflopRaiseDecision(
  snapshot: TableSnapshotPayload,
  answer: Parameters<ActionBarOnAction>[0]
): LessonEvaluation {
  const { type } = answer;

  if (type === "RAISE") {
    return {
      correct: true,
      explanation: "Correct! AK is a premium hand that plays well for a 3-bet. You have 65% equity vs typical calling ranges and can fold out weaker hands.",
    };
  }

  if (type === "CALL") {
    return {
      correct: false,
      explanation: "Calling is passive here. While not terrible, you're missing value by not 3-betting. AK plays better as the aggressor preflop.",
      expected: "RAISE",
    };
  }

  if (type === "FOLD") {
    return {
      correct: false,
      explanation: "Folding AK here is too tight. AK is a top 5% starting hand that should be played aggressively, especially against a single raiser.",
      expected: "RAISE",
    };
  }

  return {
    correct: false,
    explanation: "Invalid action for this situation.",
    expected: "RAISE",
  };
}

/**
 * Evaluates continuation bet lesson.
 * 
 * Correct answer: BET (continuation bet)
 * Reason: Hero raised preflop, should continue aggression on favorable flop
 */
function evaluateContinuationBet(
  snapshot: TableSnapshotPayload,
  answer: Parameters<ActionBarOnAction>[0]
): LessonEvaluation {
  const { type } = answer;

  if (type === "BET") {
    return {
      correct: true,
      explanation: "Perfect! Continuation betting is the standard play here. You raised preflop, got one caller, and hit top pair on a favorable board. Betting extracts value from worse hands and protects against draws.",
    };
  }

  if (type === "CHECK") {
    return {
      correct: false,
      explanation: "Checking here is too passive. You have top pair with AK on A-7-2 rainbow board. By checking, you give free cards to hands that might draw out on you and miss value from worse pairs.",
      expected: "BET",
    };
  }

  return {
    correct: false,
    explanation: "Invalid action for this situation.",
    expected: "BET",
  };
}
