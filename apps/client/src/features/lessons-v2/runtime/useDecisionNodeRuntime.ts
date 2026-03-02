import { useCallback, useMemo, useState } from "react";
import type { LessonStep } from "@/features/lessons/lesson.types";
import type {
  ContinuationPayload,
  DecisionNodeRuntimeContext,
  DecisionRuntimeState,
  DecisionScenario,
  EvaluationResult,
  RevealLayerResult,
} from "./decisionNode.types";
import { DecisionNodeRegistry } from "./decisionNodeRegistry";
import { getDecisionNodeRegistry } from "./decisionNodeRegistry.singleton";
import { resolveStepRuntimeConfig } from "./resolveStepRuntimeConfig";
import { emitDecisionNodeRuntimeEvent } from "./decisionNode.analytics";
import type { DecisionNodeRuntimeEvent } from "./decisionNode.types";

export function useDecisionNodeRuntime(params: {
  step: LessonStep | null;
  lessonId?: string;
  attemptId?: string;
  registry?: DecisionNodeRegistry;
  onEvent?: (event: DecisionNodeRuntimeEvent) => void;
}) {
  const registry = useMemo(() => params.registry ?? getDecisionNodeRegistry(), [params.registry]);
  const onEvent = params.onEvent;
  const [state, setState] = useState<DecisionRuntimeState>("BEFORE");
  const [scenario, setScenario] = useState<DecisionScenario | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [revealResults, setRevealResults] = useState<RevealLayerResult[]>([]);
  const [continuation, setContinuation] = useState<ContinuationPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo<DecisionNodeRuntimeContext | null>(() => {
    if (!params.step) return null;
    return {
      lessonId: params.lessonId,
      attemptId: params.attemptId,
      stepId: params.step.id,
      step: params.step,
    };
  }, [params.lessonId, params.attemptId, params.step]);

  const load = useCallback(async () => {
    if (!context) return;
    setState("BEFORE");
    setError(null);
    setEvaluation(null);
    setRevealResults([]);
    setContinuation(null);
    try {
      const cfg = resolveStepRuntimeConfig(context.step);
      const event: DecisionNodeRuntimeEvent = {
        name: "step_started",
        context,
        scenarioProviderKey: cfg.scenarioProviderKey,
      };
      emitDecisionNodeRuntimeEvent(event);
      onEvent?.(event);
      const nextScenario = await registry.loadScenario(cfg.scenarioProviderKey, context);
      setScenario(nextScenario);
      setState("QUESTION");
    } catch (err) {
      setScenario(null);
      setState("ERROR");
      setError(err instanceof Error ? err.message : "Failed to load scenario");
    }
  }, [context, registry, onEvent]);

  const submit = useCallback(
    async (answer: unknown) => {
      if (!context) return;
      const cfg = resolveStepRuntimeConfig(context.step);
      setState("SUBMITTING");
      setError(null);
      try {
        const submitEvent: DecisionNodeRuntimeEvent = {
          name: "step_submitted",
          context,
          evaluatorKey: cfg.evaluatorKey,
        };
        emitDecisionNodeRuntimeEvent(submitEvent);
      onEvent?.(submitEvent);
        const evalResult = await registry.evaluate(cfg.evaluatorKey, { answer }, context);
        setEvaluation(evalResult);
        setState("EVALUATED");

        const reveals: RevealLayerResult[] = [];
        if (cfg.revealLayerKeys.length > 0) {
          setState("REVEALING");
          for (const [index, layerKey] of cfg.revealLayerKeys.entries()) {
            const reveal = await registry.reveal(layerKey, evalResult, context);
            reveals.push(reveal);
            const revealEvent: DecisionNodeRuntimeEvent = {
              name: "reveal_shown",
              context,
              layerKey,
              index,
              total: cfg.revealLayerKeys.length,
            };
            emitDecisionNodeRuntimeEvent(revealEvent);
            onEvent?.(revealEvent);
          }
        }
        setRevealResults(reveals);

        if (cfg.continuationKey) {
          const continuationEvent: DecisionNodeRuntimeEvent = {
            name: "continuation_started",
            context,
            continuationKey: cfg.continuationKey,
          };
          emitDecisionNodeRuntimeEvent(continuationEvent);
          onEvent?.(continuationEvent);
          setState("CONTINUATION");
          const continuationPayload = await registry.continue(cfg.continuationKey, evalResult, context);
          setContinuation(continuationPayload);
        }

        setState("COMPLETE");
      } catch (err) {
        setState("ERROR");
        setError(err instanceof Error ? err.message : "Failed to evaluate step");
      }
    },
    [context, registry, onEvent],
  );

  const reset = useCallback(() => {
    setState("BEFORE");
    setScenario(null);
    setEvaluation(null);
    setRevealResults([]);
    setContinuation(null);
    setError(null);
  }, []);

  return {
    state,
    scenario,
    evaluation,
    revealResults,
    continuation,
    error,
    load,
    submit,
    reset,
  };
}
