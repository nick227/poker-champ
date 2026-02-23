import type { ActionPayload } from "../../messages/schemas.js";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { Street } from "../../state/PokerState.js";
import { getLegalActions } from "./utils/decision.js";

export interface BotActionContext {
  heroActionOptions: HeroActionOptions;
  handSnapshot: {
    street: Street;
    potCents: number;
    roundCurrentBetCents: number;
    board: string[];
  };
  seatSnapshot: {
    stackCents: number;
    roundBetCents: number;
    seat: number;
  };
  activePlayersInHand?: number;
  heroHoleCards?: string[];
}

export interface BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload;
}

function pickAmount(min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  const step = 100;
  const steps = Math.floor(range / step) || 1;
  const idx = Math.floor(Math.random() * (steps + 1));
  const amt = min + idx * step;
  return Math.min(amt, max);
}

/** MVP: picks a random valid action from options. */
export class RandomBotBrain implements BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload {
    const legalActions = getLegalActions(ctx.heroActionOptions);
    if (legalActions.length === 0) return { action: "FOLD" };
    const chosen = legalActions[Math.floor(Math.random() * legalActions.length)];
    if ((chosen.action === "BET" || chosen.action === "RAISE") && chosen.minAmountCents != null && chosen.maxAmountCents != null) {
      const amountCents = pickAmount(chosen.minAmountCents, chosen.maxAmountCents);
      return { action: chosen.action, amountCents };
    }
    return { action: chosen.action };
  }
}
