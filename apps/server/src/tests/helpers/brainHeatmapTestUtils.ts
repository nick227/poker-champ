import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BotActionContext, BotBrain } from "../../engine/bots/BotBrain.js";

export type ActionShare = {
  action: string;
  count: number;
  share: number;
};

export type ScenarioSnapshot = {
  name: string;
  actions: ActionShare[];
};

export type BrainHeatSnapshot = {
  brainId: string;
  simulationsPerScenario: number;
  baseSeed: number;
  scenarios: ScenarioSnapshot[];
};

export function makeCtx(args: {
  street?: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  potCents: number;
  roundCurrentBetCents: number;
  roundBetCents: number;
  seat?: number;
  stackCents?: number;
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
      stackCents: args.stackCents ?? 5000,
      roundBetCents: args.roundBetCents,
      seat: args.seat ?? 2,
    },
  };
}

export function runScenario(
  brain: BotBrain,
  ctx: BotActionContext,
  simulations: number,
  seed: number,
): ActionShare[] {
  const counts = new Map<string, number>();
  withSeededMathRandom(seed, () => {
    for (let i = 0; i < simulations; i += 1) {
      const action = brain.pickAction(ctx).action;
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
  });
  return [...counts.entries()]
    .map(([action, count]) => ({
      action,
      count,
      share: count / simulations,
    }))
    .sort((a, b) => b.share - a.share || a.action.localeCompare(b.action));
}

export function getShare(actions: ActionShare[], action: string): number {
  return actions.find((item) => item.action === action)?.share ?? 0;
}

export function readSnapshot(path: string): BrainHeatSnapshot {
  return JSON.parse(readFileSync(path, "utf8")) as BrainHeatSnapshot;
}

export function writeSnapshot(path: string, snapshot: BrainHeatSnapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export function withSeededMathRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  const seeded = createSeededRandom(seed);
  (Math.random as unknown as (() => number)) = seeded;
  try {
    return fn();
  } finally {
    (Math.random as unknown as (() => number)) = original;
  }
}

