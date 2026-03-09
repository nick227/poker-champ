import type { ActionPayload } from "@poker-champ/api-types";
import type { BotActionContext, BotBrain } from "../../BotBrain.js";
import { computeDerived, getLegalActions, type LegalActionDescriptor } from "../../utils/decision.js";
import { nextRandom } from "../../rng.js";

type PassiveProfile = "TIGHT_PASSIVE" | "LOOSE_PASSIVE";

export class TightPassiveBrain implements BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload {
    return pickPassiveAction(ctx, "TIGHT_PASSIVE");
  }
}

export class LoosePassiveBrain implements BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload {
    return pickPassiveAction(ctx, "LOOSE_PASSIVE");
  }
}

function pickPassiveAction(ctx: BotActionContext, profile: PassiveProfile): ActionPayload {
  const legal = getLegalActions(ctx.heroActionOptions);
  if (legal.length === 0) return { action: "FOLD" };

  const derived = computeDerived(ctx);
  const facingBet = derived.isFacingBet;

  const baseWeights = facingBet ? facingBetWeights(profile) : unopenedWeights(profile);
  const candidates = legal.map((entry) => ({
    entry,
    weight: Math.max(0, baseWeights[entry.action] ?? 0),
  }));

  const chosen = weightedPick(candidates, () => nextRandom(ctx)) ?? legal[0];
  if ((chosen.action === "BET" || chosen.action === "RAISE") && chosen.minAmountCents != null && chosen.maxAmountCents != null) {
    return { action: chosen.action, amountCents: choosePassiveWagerAmount(chosen, profile, () => nextRandom(ctx)) };
  }
  return { action: chosen.action };
}

function facingBetWeights(profile: PassiveProfile): Record<ActionPayload["action"], number> {
  if (profile === "TIGHT_PASSIVE") {
    return {
      FOLD: 8,
      CHECK: 0,
      CALL: 3.5,
      BET: 0,
      RAISE: 0.4,
      ALL_IN: 0.1,
    };
  }
  return {
    FOLD: 2.5,
    CHECK: 0,
    CALL: 8,
    BET: 0,
    RAISE: 0.7,
    ALL_IN: 0.1,
  };
}

function unopenedWeights(profile: PassiveProfile): Record<ActionPayload["action"], number> {
  if (profile === "TIGHT_PASSIVE") {
    return {
      FOLD: 1,
      CHECK: 8,
      CALL: 2,
      BET: 0.8,
      RAISE: 0.6,
      ALL_IN: 0.05,
    };
  }
  return {
    FOLD: 0.8,
    CHECK: 5,
    CALL: 5,
    BET: 0.8,
    RAISE: 0.5,
    ALL_IN: 0.05,
  };
}

function choosePassiveWagerAmount(legal: LegalActionDescriptor, profile: PassiveProfile, rng: () => number): number {
  const min = Math.min(legal.minAmountCents ?? 0, legal.maxAmountCents ?? 0);
  const max = Math.max(legal.minAmountCents ?? 0, legal.maxAmountCents ?? 0);
  if (max <= min) return min;
  // Passive profiles bias toward smaller legal sizing.
  const band = profile === "TIGHT_PASSIVE" ? 0.2 : 0.3;
  const targetMax = Math.max(min, Math.floor(min + (max - min) * band));
  if (targetMax <= min) return min;
  return Math.floor(min + rng() * (targetMax - min + 1));
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
