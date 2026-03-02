import type {
  ContinuationPayload,
  DecisionNodeRuntimeContext,
  DecisionScenario,
  DecisionSubmission,
  EvaluationResult,
  RevealLayerResult,
} from "./decisionNode.types";

export type ScenarioProvider = (context: DecisionNodeRuntimeContext) => Promise<DecisionScenario>;
export type EvaluatorProvider = (
  submission: DecisionSubmission,
  context: DecisionNodeRuntimeContext,
) => Promise<EvaluationResult>;
export type RevealLayerProvider = (
  evaluation: EvaluationResult,
  context: DecisionNodeRuntimeContext,
) => Promise<RevealLayerResult>;
export type ContinuationProvider = (
  evaluation: EvaluationResult,
  context: DecisionNodeRuntimeContext,
) => Promise<ContinuationPayload>;

export class DecisionNodeRegistry {
  private readonly scenarios = new Map<string, ScenarioProvider>();
  private readonly evaluators = new Map<string, EvaluatorProvider>();
  private readonly reveals = new Map<string, RevealLayerProvider>();
  private readonly continuations = new Map<string, ContinuationProvider>();

  registerScenario(key: string, provider: ScenarioProvider) {
    this.scenarios.set(key, provider);
  }

  registerEvaluator(key: string, provider: EvaluatorProvider) {
    this.evaluators.set(key, provider);
  }

  registerRevealLayer(key: string, provider: RevealLayerProvider) {
    this.reveals.set(key, provider);
  }

  registerContinuation(key: string, provider: ContinuationProvider) {
    this.continuations.set(key, provider);
  }

  async loadScenario(key: string, context: DecisionNodeRuntimeContext) {
    const provider = this.scenarios.get(key);
    if (!provider) {
      throw new Error(`Scenario provider not found: ${key}`);
    }
    return provider(context);
  }

  async evaluate(key: string, submission: DecisionSubmission, context: DecisionNodeRuntimeContext) {
    const provider = this.evaluators.get(key);
    if (!provider) {
      throw new Error(`Evaluator provider not found: ${key}`);
    }
    return provider(submission, context);
  }

  async reveal(key: string, evaluation: EvaluationResult, context: DecisionNodeRuntimeContext) {
    const provider = this.reveals.get(key);
    if (!provider) {
      throw new Error(`Reveal layer provider not found: ${key}`);
    }
    return provider(evaluation, context);
  }

  async continue(key: string, evaluation: EvaluationResult, context: DecisionNodeRuntimeContext) {
    const provider = this.continuations.get(key);
    if (!provider) {
      throw new Error(`Continuation provider not found: ${key}`);
    }
    return provider(evaluation, context);
  }
}

