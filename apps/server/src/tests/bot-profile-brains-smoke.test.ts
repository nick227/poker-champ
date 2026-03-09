import { describe, expect, it } from "vitest";
import type { BotActionContext } from "../engine/bots/BotBrain.js";
import { TightPassiveBrain, LoosePassiveBrain } from "../engine/bots/brains/passive/PassiveProfileBrains.js";
import { LooseAggressiveBrain } from "../engine/bots/brains/aggressive/LooseAggressiveBrain.js";

function makeCtx(args: {
  street?: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  potCents: number;
  roundCurrentBetCents: number;
  roundBetCents: number;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  canAllIn?: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
}): BotActionContext {
  return {
    heroActionOptions: {
      canFold: true,
      canCheck: args.canCheck,
      canCall: args.canCall,
      canBet: args.canBet,
      canRaise: args.canRaise,
      canAllIn: args.canAllIn ?? false,
      primaryWagerAction: args.canRaise ? "RAISE" : args.canBet ? "BET" : "NONE",
      callAmount: args.canCall ? Math.max(0, args.roundCurrentBetCents - args.roundBetCents) : 0,
      minRaiseTo: args.minRaiseTo,
      maxRaiseTo: args.maxRaiseTo,
    },
    handSnapshot: {
      street: args.street ?? "PREFLOP",
      potCents: args.potCents,
      roundCurrentBetCents: args.roundCurrentBetCents,
      board: [],
    },
    seatSnapshot: {
      stackCents: 5000,
      roundBetCents: args.roundBetCents,
      seat: 2,
    },
  };
}

function sampleActions(brain: { pickAction(ctx: BotActionContext): { action: string } }, ctx: BotActionContext, n = 2000): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(brain.pickAction(ctx).action);
  return out;
}

function count(actions: string[], target: string): number {
  return actions.filter((action) => action === target).length;
}

describe("profile brains smoke behavior", () => {
  it("tight passive is call/fold heavy when facing a bet", () => {
    const brain = new TightPassiveBrain();
    const ctx = makeCtx({
      street: "FLOP",
      potCents: 1000,
      roundCurrentBetCents: 300,
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: true,
      minRaiseTo: 600,
      maxRaiseTo: 1200,
    });

    const actions = sampleActions(brain, ctx);
    const folds = count(actions, "FOLD");
    const calls = count(actions, "CALL");
    const raises = count(actions, "RAISE");

    expect(calls + folds).toBeGreaterThan(raises * 5);
    expect(folds).toBeGreaterThan(raises);
  });

  it("loose passive calls more than it folds or raises when facing a bet", () => {
    const brain = new LoosePassiveBrain();
    const ctx = makeCtx({
      street: "TURN",
      potCents: 1200,
      roundCurrentBetCents: 300,
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: true,
      minRaiseTo: 600,
      maxRaiseTo: 1200,
    });

    const actions = sampleActions(brain, ctx);
    const folds = count(actions, "FOLD");
    const calls = count(actions, "CALL");
    const raises = count(actions, "RAISE");

    expect(calls).toBeGreaterThan(folds);
    expect(calls).toBeGreaterThan(raises);
  });

  it("loose aggressive raises most often in unopened spots", () => {
    const brain = new LooseAggressiveBrain();
    const ctx = makeCtx({
      street: "PREFLOP",
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canBet: false,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 700,
    });

    const actions = sampleActions(brain, ctx);
    const checks = count(actions, "CHECK");
    const calls = count(actions, "CALL");
    const raises = count(actions, "RAISE");

    expect(raises).toBeGreaterThan(calls);
    expect(raises).toBeGreaterThan(checks);
  });
});

