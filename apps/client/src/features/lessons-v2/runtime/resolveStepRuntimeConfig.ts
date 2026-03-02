import type { LessonStep } from "@/features/lessons/lesson.types";
import type { DecisionNodeStepConfig } from "./decisionNode.types";

function defaultEvaluatorByStepType(step: LessonStep): string {
  switch (step.type) {
    case "ACTION_STEP":
      return "action_rubric_eval";
    case "MCQ_STEP":
      return "mcq_option_eval";
    case "INFO_STEP":
      return "no_op_eval";
    default:
      return "action_rubric_eval";
  }
}

/**
 * Migration adapter:
 * - New content should provide capability keys directly on the step.
 * - Legacy content falls back to deterministic defaults by step input pattern.
 */
export function resolveStepRuntimeConfig(step: LessonStep): DecisionNodeStepConfig {
  return {
    stepType: step.type,
    scenarioProviderKey: step.scenarioProviderKey ?? "static_snapshot",
    evaluatorKey: step.evaluatorKey ?? defaultEvaluatorByStepType(step),
    revealLayerKeys: step.revealLayerKeys ?? [],
    continuationKey: step.continuationKey ?? null,
    runtimeConfig: step.runtimeConfigJson ?? null,
    displayCategory: step.displayCategory ?? null,
  };
}

export function isV2ConfiguredStep(step: LessonStep): boolean {
  return Boolean(
    step.scenarioProviderKey ||
    step.evaluatorKey ||
    (step.revealLayerKeys && step.revealLayerKeys.length > 0) ||
    step.continuationKey,
  );
}
