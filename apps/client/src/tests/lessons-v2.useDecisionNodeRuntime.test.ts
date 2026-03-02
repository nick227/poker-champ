/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DecisionNodeRegistry, useDecisionNodeRuntime } from "@/features/lessons-v2/runtime";
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

describe("useDecisionNodeRuntime", () => {
  it("executes load -> submit -> reveal -> continuation in order", async () => {
    const registry = new DecisionNodeRegistry();
    const callOrder: string[] = [];

    registry.registerScenario("static_snapshot", async () => {
      callOrder.push("scenario");
      return { metadata: { ok: true } };
    });
    registry.registerEvaluator("action_rubric_eval", async () => {
      callOrder.push("evaluator");
      return {
        gradeType: "binary",
        isCorrect: true,
        explanation: "good",
        gradingVersion: 1,
      };
    });
    registry.registerRevealLayer("ev_impact", async () => {
      callOrder.push("reveal");
      return { key: "ev_impact", payload: { score: 1 } };
    });
    registry.registerContinuation("replay_continue", async () => {
      callOrder.push("continuation");
      return { timelinePointer: 2 };
    });

    const step = makeStep({
      revealLayerKeys: ["ev_impact"],
      continuationKey: "replay_continue",
    });

    const events: string[] = [];
    const { result } = renderHook(() =>
      useDecisionNodeRuntime({
        step,
        lessonId: "lesson_1",
        attemptId: "attempt_1",
        registry,
        onEvent: (event) => events.push(event.name),
      }),
    );

    await act(async () => {
      await result.current.load();
    });
    expect(result.current.state).toBe("QUESTION");

    await act(async () => {
      await result.current.submit({ type: "raise" });
    });

    expect(callOrder).toEqual(["scenario", "evaluator", "reveal", "continuation"]);
    expect(events).toEqual([
      "step_started",
      "step_submitted",
      "reveal_shown",
      "continuation_started",
    ]);
    expect(result.current.state).toBe("COMPLETE");
    expect(result.current.evaluation?.isCorrect).toBe(true);
    expect(result.current.revealResults).toHaveLength(1);
    expect(result.current.continuation?.timelinePointer).toBe(2);
  });
});
