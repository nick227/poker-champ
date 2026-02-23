import type { ActionPayload } from "../../../messages/schemas.js";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { BotActionContext } from "../BotBrain.js";

export type LegalActionDescriptor = {
  action: ActionPayload["action"];
  minAmountCents?: number;
  maxAmountCents?: number;
};

export type ClampToLegalResult = {
  payload: ActionPayload;
  clamped: boolean;
  reason?: string;
};

export function getLegalActions(options: HeroActionOptions): LegalActionDescriptor[] {
  const actions: LegalActionDescriptor[] = [];
  if (options.canFold) actions.push({ action: "FOLD" });
  if (options.canCheck) actions.push({ action: "CHECK" });
  if (options.canCall) actions.push({ action: "CALL" });
  if (options.canBet && options.minRaiseTo != null && options.maxRaiseTo != null) {
    actions.push({ action: "BET", minAmountCents: options.minRaiseTo, maxAmountCents: options.maxRaiseTo });
  }
  if (options.canRaise && options.minRaiseTo != null && options.maxRaiseTo != null) {
    actions.push({ action: "RAISE", minAmountCents: options.minRaiseTo, maxAmountCents: options.maxRaiseTo });
  }
  if (options.canAllIn) actions.push({ action: "ALL_IN" });
  return actions;
}

export function clampToLegalAction(proposed: ActionPayload, options: HeroActionOptions): ClampToLegalResult {
  const legal = getLegalActions(options);
  const proposedDescriptor = legal.find((entry) => entry.action === proposed.action);

  if (proposedDescriptor) {
    if (proposed.action === "BET" || proposed.action === "RAISE") {
      if (proposedDescriptor.minAmountCents == null || proposedDescriptor.maxAmountCents == null) {
        return fallbackLegalAction(legal, "WAGER_BOUNDS_MISSING");
      }
      const minAmount = Math.min(proposedDescriptor.minAmountCents, proposedDescriptor.maxAmountCents);
      const maxAmount = Math.max(proposedDescriptor.minAmountCents, proposedDescriptor.maxAmountCents);
      const requested = proposed.amountCents ?? minAmount;
      const amountCents = clampNumber(requested, minAmount, maxAmount);
      const clamped = amountCents !== requested;
      return {
        payload: { action: proposed.action, amountCents },
        clamped,
        reason: clamped ? "WAGER_AMOUNT_CLAMPED" : undefined,
      };
    }
    if (proposed.amountCents != null && proposed.amountCents !== 0) {
      return { payload: { action: proposed.action }, clamped: true, reason: "REMOVED_UNEXPECTED_AMOUNT" };
    }
    return { payload: { action: proposed.action }, clamped: false };
  }

  return fallbackLegalAction(legal, "ACTION_NOT_LEGAL");
}

export function computeDerived(ctx: BotActionContext): {
  street: BotActionContext["handSnapshot"]["street"];
  toCallCents: number;
  effectiveStackCents: number;
  isFacingBet: boolean;
} {
  const toCallCents = Math.max(0, ctx.handSnapshot.roundCurrentBetCents - ctx.seatSnapshot.roundBetCents);
  return {
    street: ctx.handSnapshot.street,
    toCallCents,
    effectiveStackCents: Math.max(0, ctx.seatSnapshot.stackCents),
    isFacingBet: toCallCents > 0,
  };
}

function fallbackLegalAction(legal: LegalActionDescriptor[], reason: string): ClampToLegalResult {
  const check = legal.find((entry) => entry.action === "CHECK");
  if (check) return { payload: { action: "CHECK" }, clamped: true, reason };

  const fold = legal.find((entry) => entry.action === "FOLD");
  if (fold) return { payload: { action: "FOLD" }, clamped: true, reason };

  const call = legal.find((entry) => entry.action === "CALL");
  if (call) return { payload: { action: "CALL" }, clamped: true, reason };

  const allIn = legal.find((entry) => entry.action === "ALL_IN");
  if (allIn) return { payload: { action: "ALL_IN" }, clamped: true, reason };

  const wager = legal.find((entry) => entry.action === "BET" || entry.action === "RAISE");
  if (wager && wager.minAmountCents != null) {
    return {
      payload: { action: wager.action, amountCents: wager.minAmountCents },
      clamped: true,
      reason,
    };
  }

  return { payload: { action: "FOLD" }, clamped: true, reason };
}

function clampNumber(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}
