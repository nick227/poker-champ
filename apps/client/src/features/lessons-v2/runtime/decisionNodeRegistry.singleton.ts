import { createDefaultDecisionNodeRegistry } from "./createDefaultDecisionNodeRegistry";
import type { DecisionNodeRegistry } from "./decisionNodeRegistry";

let singletonRegistry: DecisionNodeRegistry | null = null;

export function getDecisionNodeRegistry(): DecisionNodeRegistry {
  if (!singletonRegistry) {
    singletonRegistry = createDefaultDecisionNodeRegistry();
  }
  return singletonRegistry;
}

