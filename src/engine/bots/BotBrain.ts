import type { ActionPayload } from "../../messages/schemas.js";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { Street } from "../../state/PokerState.js";

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
}

export interface BotBrain {
  pickAction(ctx: BotActionContext): ActionPayload;
}

function collectLegalActions(options: HeroActionOptions): Array<{ action: ActionPayload["action"]; amountCents?: number }> {
  const actions: Array<{ action: ActionPayload["action"]; amountCents?: number }> = [];
  if (options.canFold) actions.push({ action: "FOLD" });
  if (options.canCheck) actions.push({ action: "CHECK" });
  if (options.canCall) actions.push({ action: "CALL" });
  if (options.canBet && options.minRaiseTo != null && options.maxRaiseTo != null) {
    const amt = pickAmount(options.minRaiseTo, options.maxRaiseTo);
    actions.push({ action: "BET", amountCents: amt });
  }
  if (options.canRaise && options.minRaiseTo != null && options.maxRaiseTo != null) {
    const amt = pickAmount(options.minRaiseTo, options.maxRaiseTo);
    actions.push({ action: "RAISE", amountCents: amt });
  }
  if (options.canAllIn) actions.push({ action: "ALL_IN" });
  return actions;
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
    const actions = collectLegalActions(ctx.heroActionOptions);
    if (actions.length === 0) return { action: "FOLD" };
    const chosen = actions[Math.floor(Math.random() * actions.length)];
    if (chosen.amountCents != null) {
      return { action: chosen.action, amountCents: chosen.amountCents };
    }
    return { action: chosen.action };
  }
}
