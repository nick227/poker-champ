import type { ActionPayload } from "@poker-champ/realtime-contract";
import { getLegalActions } from "./utils/decision.js";
import type { BotActionContext } from "./botContext.js";
import { nextRandom } from "./rng.js";

export type { BotActionContext } from "./botContext.js";
export type { BrainRng } from "./rng.js";
export { SeededRng } from "./rng.js";

export interface BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload;
}

function pickAmount(min: number, max: number, rng: () => number): number {
  const range = max - min;
  if (range <= 0) return min;
  const step = 100;
  const steps = Math.floor(range / step) || 1;
  const idx = Math.floor(rng() * (steps + 1));
  const amt = min + idx * step;
  return Math.min(amt, max);
}

/** MVP: picks a random valid action from options. */
export class RandomBotBrain implements BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload {
    const legalActions = getLegalActions(ctx.heroActionOptions);
    if (legalActions.length === 0) return { action: "FOLD" };
    const chosen = legalActions[Math.floor(nextRandom(ctx) * legalActions.length)];
    if ((chosen.action === "BET" || chosen.action === "RAISE") && chosen.minAmountCents != null && chosen.maxAmountCents != null) {
      const amountCents = pickAmount(chosen.minAmountCents, chosen.maxAmountCents, () => nextRandom(ctx));
      return { action: chosen.action, amountCents };
    }
    return { action: chosen.action };
  }
}
