import type { DecisionNodeRuntimeEvent } from "./decisionNode.types";

export function emitDecisionNodeRuntimeEvent(event: DecisionNodeRuntimeEvent) {
  // Centralized runtime analytics hook. Replace with production telemetry sink.
  const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  if (isDev) {
    console.info("[lessons-v2]", event.name, {
      stepId: event.context.stepId,
      lessonId: event.context.lessonId,
      ...("layerKey" in event ? { layerKey: event.layerKey } : {}),
    });
  }
}
