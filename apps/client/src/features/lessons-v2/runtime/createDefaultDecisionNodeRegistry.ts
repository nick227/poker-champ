import { DecisionNodeRegistry } from "./decisionNodeRegistry";

export function createDefaultDecisionNodeRegistry() {
  const registry = new DecisionNodeRegistry();

  // Legacy-compatible static scenario loader from step payload.
  registry.registerScenario("static_snapshot", async (context) => ({
    snapshot: context.step.snapshot,
    mcqOptions: context.step.options,
    metadata: {
      source: "step",
    },
  }));

  // Temporary evaluator placeholders while authoritative grading remains server-side.
  registry.registerEvaluator("no_op_eval", async () => ({
    gradeType: "binary",
    isCorrect: true,
    explanation: "No evaluation required.",
    gradingVersion: 1,
  }));

  registry.registerEvaluator("action_rubric_eval", async () => ({
    gradeType: "binary",
    explanation: "Server-authoritative action evaluation required.",
    gradingVersion: 1,
    metadata: { delegated: "server" },
  }));

  registry.registerEvaluator("mcq_option_eval", async () => ({
    gradeType: "binary",
    explanation: "Server-authoritative MCQ evaluation required.",
    gradingVersion: 1,
    metadata: { delegated: "server" },
  }));

  // Default reveal layer that emits structured EV summary card payload.
  registry.registerRevealLayer("ev_impact", async (evaluation) => ({
    key: "ev_impact",
    title: "Edge Impact",
    payload: {
      evDelta: evaluation.evDelta ?? null,
      explanation: evaluation.explanation,
    },
  }));

  // Content currently references this key widely; runtime should not hard-fail if the
  // detailed community block is rendered via the lesson panel service fetch instead.
  registry.registerRevealLayer("community_comparison", async () => ({
    key: "community_comparison",
    title: "Community",
    payload: { delegated: "lesson_utilities_overview" },
  }));

  return registry;
}
