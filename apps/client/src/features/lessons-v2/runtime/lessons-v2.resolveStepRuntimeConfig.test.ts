import { describe, expect, it } from "vitest";
import { resolveStepRuntimeConfig } from "@/features/lessons-v2/runtime";
import type { LessonStep } from "@/features/lessons/lesson.types";

function makeStep(overrides: Partial<LessonStep>): LessonStep {
  return {
    id: "step_1",
    sequence: 1,
    type: "ACTION_STEP",
    snapshot: null,
    options: [],
    ...overrides,
  };
}

describe("resolveStepRuntimeConfig", () => {
  it("uses explicit capability keys when present", () => {
    const config = resolveStepRuntimeConfig(
      makeStep({
        scenarioProviderKey: "historic_timeline_node",
        evaluatorKey: "action_rubric_eval",
        revealLayerKeys: ["historic_compare", "solver_reference"],
        continuationKey: "historic_timeline_continue",
        runtimeConfigJson: { foo: "bar" },
        displayCategory: "Play As",
      }),
    );

    expect(config.scenarioProviderKey).toBe("historic_timeline_node");
    expect(config.evaluatorKey).toBe("action_rubric_eval");
    expect(config.revealLayerKeys).toEqual(["historic_compare", "solver_reference"]);
    expect(config.continuationKey).toBe("historic_timeline_continue");
    expect(config.runtimeConfig).toEqual({ foo: "bar" });
    expect(config.displayCategory).toBe("Play As");
  });

  it("falls back to deterministic defaults for legacy steps", () => {
    const infoCfg = resolveStepRuntimeConfig(makeStep({ type: "INFO_STEP" }));
    const mcqCfg = resolveStepRuntimeConfig(makeStep({ type: "MCQ_STEP" }));
    const actionCfg = resolveStepRuntimeConfig(makeStep({ type: "ACTION_STEP" }));

    expect(infoCfg.scenarioProviderKey).toBe("static_snapshot");
    expect(infoCfg.evaluatorKey).toBe("no_op_eval");

    expect(mcqCfg.scenarioProviderKey).toBe("static_snapshot");
    expect(mcqCfg.evaluatorKey).toBe("mcq_option_eval");

    expect(actionCfg.scenarioProviderKey).toBe("static_snapshot");
    expect(actionCfg.evaluatorKey).toBe("action_rubric_eval");
  });
});

