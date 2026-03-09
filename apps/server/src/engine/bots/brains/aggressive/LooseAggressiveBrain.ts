import type { ActionPayload } from "@poker-champ/api-types";
import type { BotActionContext, BotBrain } from "../../BotBrain.js";
import { computeDerived, getLegalActions, type LegalActionDescriptor } from "../../utils/decision.js";
import { nextRandom } from "../../rng.js";

export class LooseAggressiveBrain implements BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload {
    const legal = getLegalActions(ctx.heroActionOptions);
    if (legal.length === 0) return { action: "FOLD" };

    const derived = computeDerived(ctx);
    const weights = derived.isFacingBet ? facingBetWeights(derived.toCallCents, ctx.handSnapshot.potCents) : unopenedWeights();

    const candidates = legal.map((entry) => ({
      entry,
      weight: Math.max(0, weights[entry.action] ?? 0),
    }));
    const chosen = weightedPick(candidates, () => nextRandom(ctx)) ?? legal[0];

    if ((chosen.action === "BET" || chosen.action === "RAISE") && chosen.minAmountCents != null && chosen.maxAmountCents != null) {
      return { action: chosen.action, amountCents: chooseAggressiveWagerAmount(chosen, () => nextRandom(ctx)) };
    }
    return { action: chosen.action };
  }
}

function unopenedWeights(): Record<ActionPayload["action"], number> {
  return {
    FOLD: 0.5,
    CHECK: 1.5,
    CALL: 2,
    BET: 3.5,
    RAISE: 4,
    ALL_IN: 0.3,
  };
}

function facingBetWeights(toCallCents: number, potCents: number): Record<ActionPayload["action"], number> {
  const potOdds = toCallCents / Math.max(potCents + toCallCents, 1);
  if (potOdds > 0.45) {
    return {
      FOLD: 2,
      CHECK: 0,
      CALL: 2.5,
      BET: 0,
      RAISE: 3.5,
      ALL_IN: 0.8,
    };
  }
  return {
    FOLD: 0.9,
    CHECK: 0,
    CALL: 2.5,
    BET: 0,
    RAISE: 4.5,
    ALL_IN: 1,
  };
}

function chooseAggressiveWagerAmount(legal: LegalActionDescriptor, rng: () => number): number {
  const min = Math.min(legal.minAmountCents ?? 0, legal.maxAmountCents ?? 0);
  const max = Math.max(legal.minAmountCents ?? 0, legal.maxAmountCents ?? 0);
  if (max <= min) return min;
  // LAG profile prefers larger legal sizings.
  const floor = Math.max(min, Math.floor(min + (max - min) * 0.55));
  if (floor >= max) return max;
  return Math.floor(floor + rng() * (max - floor + 1));
}

function weightedPick(
  candidates: Array<{ entry: LegalActionDescriptor; weight: number }>,
  rng: () => number,
): LegalActionDescriptor | undefined {
  const positive = candidates.filter((candidate) => candidate.weight > 0);
  if (positive.length === 0) return undefined;
  const total = positive.reduce((sum, candidate) => sum + candidate.weight, 0);
  let r = rng() * total;
  for (const candidate of positive) {
    r -= candidate.weight;
    if (r <= 0) return candidate.entry;
  }
  return positive[positive.length - 1]?.entry;
}
