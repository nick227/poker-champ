import type { ActionPayload } from "../../../../messages/schemas.js";
import { logger } from "../../../../lib/logger.js";
import type { BotActionContext, BotBrain } from "../../BotBrain.js";
import type { TightAggressiveCompiledConfig } from "./types.js";
import { deriveFeatures } from "./classifiers/deriveFeatures.js";
import { resolvePreflopNode } from "./lookup/resolvePreflopNode.js";
import { resolvePostflopNode } from "./lookup/resolvePostflopNode.js";
import { resolveActionWeights } from "./transforms/resolveActionWeights.js";
import { applyAxes, type AxisTraceEntry } from "./transforms/applyAxes.js";
import { resolveSizingRecipe, resolveWagerAmount } from "./transforms/resolveSizingRecipe.js";
import { weightedPick } from "./transforms/weightedPick.js";

const WAGER_ACTIONS = new Set<ActionPayload["action"]>(["BET", "RAISE"]);
type DecisionWeights = Partial<Record<ActionPayload["action"], number>>;
type BotDecisionTrace = {
  brainId: "tight_aggressive_v1";
  nodeId: string;
  baseWeights: DecisionWeights;
  axesApplied: AxisTraceEntry[];
  finalWeights: DecisionWeights;
  chosenAction: ActionPayload["action"];
  chosenSizingRecipe?: string;
};

export class TightAggressiveBrain implements BotBrain {
  constructor(private readonly compiled: TightAggressiveCompiledConfig) {}

  pickAction(ctx: BotActionContext): ActionPayload {
    const features = deriveFeatures(ctx, this.compiled.preflop.handTierByComboIndex);
    let nodeId = "unknown";
    let sizingWeights;
    let actionWeights: Partial<Record<ActionPayload["action"], number>>;
    let axesApplied: AxisTraceEntry[] = [];
    let baseWeights: DecisionWeights | undefined;
    if (features.street === "PREFLOP") {
      const preflopNode = resolvePreflopNode(this.compiled.preflop, features);
      nodeId = preflopNode.id;
      sizingWeights = preflopNode.sizingWeights;
      baseWeights = resolveActionWeights(preflopNode, features, ctx.heroActionOptions);
      const axesResult = applyAxes(baseWeights, this.compiled.axes, features);
      axesApplied = axesResult.axesApplied;
      actionWeights = axesResult.weights;
    } else {
      const postflopNode = resolvePostflopNode(this.compiled.postflop, features);
      nodeId = postflopNode.id;
      sizingWeights = postflopNode.sizingWeights;
      baseWeights = resolveActionWeights(postflopNode, features, ctx.heroActionOptions);
      const axesResult = applyAxes(baseWeights, this.compiled.axes, features);
      axesApplied = axesResult.axesApplied;
      actionWeights = axesResult.weights;
    }
    if (!baseWeights) baseWeights = { ...actionWeights };

    const action = weightedPick(actionWeights, ctx.rng) ?? "FOLD";
    let chosenSizingRecipe: string | undefined;

    if (WAGER_ACTIONS.has(action)) {
      const recipe = resolveSizingRecipe(sizingWeights, ctx.rng);
      chosenSizingRecipe = recipe;
      const amountCents = resolveWagerAmount(recipe, ctx, ctx.heroActionOptions);
      emitDecisionTraceIfEnabled(this.compiled, {
        brainId: "tight_aggressive_v1",
        nodeId,
        baseWeights,
        axesApplied,
        finalWeights: actionWeights,
        chosenAction: action,
        chosenSizingRecipe,
      });
      if (amountCents != null) return { action, amountCents };
      return { action };
    }
    emitDecisionTraceIfEnabled(this.compiled, {
      brainId: "tight_aggressive_v1",
      nodeId,
      baseWeights,
      axesApplied,
      finalWeights: actionWeights,
      chosenAction: action,
    });

    return { action };
  }
}

function emitDecisionTraceIfEnabled(config: TightAggressiveCompiledConfig, trace: BotDecisionTrace): void {
  if (!config.debug?.emitDecisionTrace) return;
  logger.debug({ trace }, "BOT_DECISION_TRACE");
}
