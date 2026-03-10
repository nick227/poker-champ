import { describe, expect, it, vi } from "vitest";
import type { BotActionContext } from "./BotBrain.js";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import { TightAggressiveBrain } from "./brains/tight_aggressive/TightAggressiveBrain.js";
import tightAggressiveConfig from "./brains/tight_aggressive/config/tightAggressive.config.js";
import { loadTightAggressiveConfig } from "./brains/tight_aggressive/runtime/loadTightAggressiveConfig.js";
import { deriveFeatures } from "./brains/tight_aggressive/classifiers/deriveFeatures.js";
import type { TightAggressiveConfigV1 } from "./brains/tight_aggressive/types.js";
import { logger } from "../../lib/logger.js";

function withFirstComboTier(tier: TightAggressiveConfigV1["preflop"]["handTierByComboIndex"][number]): TightAggressiveConfigV1 {
  return {
    ...tightAggressiveConfig,
    preflop: {
      ...tightAggressiveConfig.preflop,
      handTierByComboIndex: [tier, ...tightAggressiveConfig.preflop.handTierByComboIndex.slice(1)],
    },
  };
}

function makePreflopCtx(args: {
  seat: number;
  potCents: number;
  roundCurrentBetCents: number;
  roundBetCents: number;
  canCheck: boolean;
  canCall: boolean;
  canRaise: boolean;
  minRaiseTo?: number;
  maxRaiseTo?: number;
}): BotActionContext {
  return {
    heroActionOptions: {
      canFold: true,
      canCheck: args.canCheck,
      canCall: args.canCall,
      canBet: false,
      canRaise: args.canRaise,
      canAllIn: false,
      primaryWagerAction: args.canRaise ? "RAISE" : "NONE",
      callAmount: args.canCall ? Math.max(args.roundCurrentBetCents - args.roundBetCents, 0) : 0,
      minRaiseTo: args.minRaiseTo,
      maxRaiseTo: args.maxRaiseTo,
    },
    handSnapshot: {
      street: "PREFLOP",
      potCents: args.potCents,
      roundCurrentBetCents: args.roundCurrentBetCents,
      board: [],
    },
    seatSnapshot: {
      stackCents: 5000,
      roundBetCents: args.roundBetCents,
      seat: args.seat,
    },
  };
}

function makePostflopCtx(args: {
  board: string[];
  heroHoleCards?: string[];
  activePlayersInHand?: number;
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
      callAmount: args.canCall ? Math.max(args.roundCurrentBetCents - args.roundBetCents, 0) : 0,
      minRaiseTo: args.minRaiseTo,
      maxRaiseTo: args.maxRaiseTo,
    },
    handSnapshot: {
      street: "FLOP",
      potCents: args.potCents,
      roundCurrentBetCents: args.roundCurrentBetCents,
      board: args.board,
    },
    seatSnapshot: {
      stackCents: 5000,
      roundBetCents: args.roundBetCents,
      seat: 2,
    },
    activePlayersInHand: args.activePlayersInHand,
    heroHoleCards: args.heroHoleCards,
  };
}

function sampleActions(brain: TightAggressiveBrain, ctx: BotActionContext, n = 5000): ActionPayload["action"][] {
  const actions: ActionPayload["action"][] = [];
  for (let i = 0; i < n; i += 1) {
    actions.push(brain.pickAction(ctx).action);
  }
  return actions;
}

describe("TightAggressiveBrain smoke", () => {
  it("boots pipeline and returns legal action shape for check/fold-only context", () => {
    const compiled = loadTightAggressiveConfig(tightAggressiveConfig);
    const brain = new TightAggressiveBrain(compiled);
    const ctx: BotActionContext = {
      heroActionOptions: {
        canFold: true,
        canCheck: true,
        canCall: false,
        canBet: false,
        canRaise: false,
        canAllIn: false,
        primaryWagerAction: "NONE",
        callAmount: 0,
      },
      handSnapshot: {
        street: "PREFLOP",
        potCents: 150,
        roundCurrentBetCents: 100,
        board: [],
      },
      seatSnapshot: {
        stackCents: 5000,
        roundBetCents: 100,
        seat: 3,
      },
    };

    const action = brain.pickAction(ctx);
    expect(action.action === "CHECK" || action.action === "FOLD").toBe(true);
    if (action.action !== "BET" && action.action !== "RAISE") {
      expect(action.amountCents).toBeUndefined();
    }
  });

  it("in EARLY/UNOPENED, TRASH tier cannot voluntarily continue", () => {
    const config: TightAggressiveConfigV1 = withFirstComboTier("TRASH");
    const compiled = loadTightAggressiveConfig(config);
    const brain = new TightAggressiveBrain(compiled);

    const ctx: BotActionContext = {
      heroActionOptions: {
        canFold: true,
        canCheck: true,
        canCall: true,
        canBet: false,
        canRaise: true,
        canAllIn: false,
        primaryWagerAction: "RAISE",
        callAmount: 100,
        minRaiseTo: 200,
        maxRaiseTo: 600,
      },
      handSnapshot: {
        street: "PREFLOP",
        potCents: 300,
        roundCurrentBetCents: 100,
        board: [],
      },
      seatSnapshot: {
        stackCents: 5000,
        roundBetCents: 100,
        seat: 0, // EARLY bucket in current deriveFeatures
      },
    };

    for (let i = 0; i < 50; i += 1) {
      const action = brain.pickAction(ctx);
      expect(action.action === "FOLD" || action.action === "CHECK").toBe(true);
      expect(action.action === "CALL" || action.action === "RAISE").toBe(false);
    }
  });

  it("in LATE/UNOPENED, SPEC tier can raise or call while TRASH still never continues", () => {
    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));
    const lateUnopenedCtx = makePreflopCtx({
      seat: 4, // LATE bucket in current deriveFeatures
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 600,
    });

    let sawCall = false;
    let sawRaise = false;
    for (let i = 0; i < 120; i += 1) {
      const action = specBrain.pickAction(lateUnopenedCtx);
      expect(action.action === "CALL" || action.action === "RAISE").toBe(true);
      sawCall = sawCall || action.action === "CALL";
      sawRaise = sawRaise || action.action === "RAISE";
    }
    expect(sawCall).toBe(true);
    expect(sawRaise).toBe(true);

    const trashBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("TRASH")));
    for (let i = 0; i < 50; i += 1) {
      const action = trashBrain.pickAction(lateUnopenedCtx);
      expect(action.action === "FOLD" || action.action === "CHECK").toBe(true);
    }
  });

  it("in EARLY/VS_RAISE/SMALL, GOOD can call while SPEC cannot continue", () => {
    const goodBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("GOOD")));
    const earlyVsRaiseSmallCtx = makePreflopCtx({
      seat: 0, // EARLY
      potCents: 1000,
      roundCurrentBetCents: 200, // 20% pot => SMALL
      roundBetCents: 0, // facing bet => VS_RAISE
      canCheck: false,
      canCall: true,
      canRaise: true,
      minRaiseTo: 400,
      maxRaiseTo: 900,
    });

    let sawCall = false;
    for (let i = 0; i < 120; i += 1) {
      const action = goodBrain.pickAction(earlyVsRaiseSmallCtx);
      expect(action.action === "CALL" || action.action === "RAISE").toBe(true);
      sawCall = sawCall || action.action === "CALL";
    }
    expect(sawCall).toBe(true);

    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));
    for (let i = 0; i < 50; i += 1) {
      const action = specBrain.pickAction(earlyVsRaiseSmallCtx);
      expect(action.action).toBe("FOLD");
    }
  });

  it("in VS_ALLIN, STRONG can fold while GOOD always folds", () => {
    const allInCtx = makePreflopCtx({
      seat: 2, // MIDDLE
      potCents: 1000,
      roundCurrentBetCents: 200, // 20% pot => SMALL
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canRaise: false,
    });
    allInCtx.seatSnapshot.stackCents = 200; // toCall >= stack => VS_ALLIN in current deriveFeatures

    const strongBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("STRONG")));
    let sawFold = false;
    for (let i = 0; i < 180; i += 1) {
      const action = strongBrain.pickAction(allInCtx);
      sawFold = sawFold || action.action === "FOLD";
    }
    expect(sawFold).toBe(true);

    const goodBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("GOOD")));
    for (let i = 0; i < 80; i += 1) {
      const action = goodBrain.pickAction(allInCtx);
      expect(action.action).toBe("FOLD");
    }
  });

  it("in MIDDLE/UNOPENED, GOOD and SPEC can continue while TRASH never continues", () => {
    const middleUnopenedCtx = makePreflopCtx({
      seat: 2, // MIDDLE
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 700,
    });

    const goodBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("GOOD")));
    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));
    const trashBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("TRASH")));

    let goodSawContinue = false;
    let specSawContinue = false;

    for (let i = 0; i < 80; i += 1) {
      const goodAction = goodBrain.pickAction(middleUnopenedCtx);
      goodSawContinue = goodSawContinue || goodAction.action === "CALL" || goodAction.action === "RAISE";
      const specAction = specBrain.pickAction(middleUnopenedCtx);
      specSawContinue = specSawContinue || specAction.action === "CALL" || specAction.action === "RAISE";
    }

    expect(goodSawContinue).toBe(true);
    expect(specSawContinue).toBe(true);

    for (let i = 0; i < 50; i += 1) {
      const action = trashBrain.pickAction(middleUnopenedCtx);
      expect(action.action === "FOLD" || action.action === "CHECK").toBe(true);
    }
  });

  it("in MIDDLE/VS_RAISE/SMALL, GOOD and SPEC can continue", () => {
    const ctx = makePreflopCtx({
      seat: 2, // MIDDLE
      potCents: 1000,
      roundCurrentBetCents: 200, // 20% => SMALL
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canRaise: true,
      minRaiseTo: 400,
      maxRaiseTo: 1000,
    });

    const goodBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("GOOD")));
    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));

    let goodSawContinue = false;
    for (let i = 0; i < 100; i += 1) {
      const action = goodBrain.pickAction(ctx);
      goodSawContinue = goodSawContinue || action.action === "CALL" || action.action === "RAISE";
    }
    expect(goodSawContinue).toBe(true);

    let specSawContinue = false;
    for (let i = 0; i < 80; i += 1) {
      const action = specBrain.pickAction(ctx);
      specSawContinue = specSawContinue || action.action === "CALL" || action.action === "RAISE";
    }
    expect(specSawContinue).toBe(true);
  });

  it("in MIDDLE/VS_RAISE/MEDIUM, SPEC stays tighter than SMALL", () => {
    const mediumCtx = makePreflopCtx({
      seat: 2, // MIDDLE
      potCents: 400,
      roundCurrentBetCents: 200, // 50% => MEDIUM
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canRaise: true,
      minRaiseTo: 350,
      maxRaiseTo: 900,
    });

    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));
    for (let i = 0; i < 50; i += 1) {
      const action = specBrain.pickAction(mediumCtx);
      expect(action.action).toBe("FOLD");
    }
  });

  it("in BLINDS/UNOPENED, SPEC can continue while TRASH never continues", () => {
    const blindsUnopenedCtx = makePreflopCtx({
      seat: 7, // BLINDS bucket in current deriveFeatures
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 700,
    });

    const specBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("SPEC")));
    let specSawContinue = false;
    for (let i = 0; i < 120; i += 1) {
      const action = specBrain.pickAction(blindsUnopenedCtx);
      specSawContinue = specSawContinue || action.action === "CALL" || action.action === "RAISE";
    }
    expect(specSawContinue).toBe(true);

    const trashBrain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("TRASH")));
    for (let i = 0; i < 60; i += 1) {
      const action = trashBrain.pickAction(blindsUnopenedCtx);
      expect(action.action === "FOLD" || action.action === "CHECK").toBe(true);
    }
  });

  it("AIR/UNOPENED never raises", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const ctx = makePostflopCtx({
      board: ["As", "Kd", "7h"], // no pair => AIR
      potCents: 1000,
      roundCurrentBetCents: 0,
      roundBetCents: 0,
      canCheck: true,
      canCall: false,
      canBet: true,
      canRaise: false,
      minRaiseTo: 200,
      maxRaiseTo: 800,
    });

    for (let i = 0; i < 80; i += 1) {
      const action = brain.pickAction(ctx);
      expect(action.action).not.toBe("RAISE");
    }
  });

  it("STRONG_MADE/UNOPENED can bet", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const ctx = makePostflopCtx({
      board: ["As", "Ad", "7h"], // one pair on board, but with current classifier this is WEAK_MADE; use two pair board:
      potCents: 1000,
      roundCurrentBetCents: 0,
      roundBetCents: 0,
      canCheck: true,
      canCall: false,
      canBet: true,
      canRaise: false,
      minRaiseTo: 200,
      maxRaiseTo: 800,
    });
    ctx.handSnapshot.board = ["As", "Ad", "7h", "7c"]; // two-pair board => STRONG_MADE

    let sawBet = false;
    for (let i = 0; i < 120; i += 1) {
      const action = brain.pickAction(ctx);
      sawBet = sawBet || action.action === "BET";
    }
    expect(sawBet).toBe(true);
  });

  it("WEAK_MADE/VS_RAISE can call", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const ctx = makePostflopCtx({
      board: ["As", "Ad", "7h"], // WEAK_MADE
      potCents: 1000,
      roundCurrentBetCents: 200, // VS_RAISE
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: true,
      minRaiseTo: 450,
      maxRaiseTo: 900,
    });

    let sawCall = false;
    for (let i = 0; i < 120; i += 1) {
      const action = brain.pickAction(ctx);
      sawCall = sawCall || action.action === "CALL";
    }
    expect(sawCall).toBe(true);
  });

  it("AIR/VS_RAISE can fold and never raises", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const ctx = makePostflopCtx({
      board: ["As", "Kd", "7h"], // AIR
      potCents: 1000,
      roundCurrentBetCents: 200, // VS_RAISE
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: true,
      minRaiseTo: 450,
      maxRaiseTo: 900,
    });

    let sawFold = false;
    for (let i = 0; i < 120; i += 1) {
      const action = brain.pickAction(ctx);
      sawFold = sawFold || action.action === "FOLD";
      expect(action.action).not.toBe("RAISE");
    }
    expect(sawFold).toBe(true);
  });

  it("player-count axis tightens multiway aggression for AIR/UNOPENED", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const huCtx = makePostflopCtx({
      board: ["As", "Kd", "7h"], // AIR
      activePlayersInHand: 2,
      potCents: 1000,
      roundCurrentBetCents: 0,
      roundBetCents: 0,
      canCheck: true,
      canCall: false,
      canBet: true,
      canRaise: false,
      minRaiseTo: 200,
      maxRaiseTo: 800,
    });
    const mwCtx = { ...huCtx, activePlayersInHand: 5 };

    let huBetCount = 0;
    let mwBetCount = 0;
    const runs = 1500;
    for (let i = 0; i < runs; i += 1) {
      if (brain.pickAction(huCtx).action === "BET") huBetCount += 1;
      if (brain.pickAction(mwCtx).action === "BET") mwBetCount += 1;
    }
    expect(mwBetCount).toBeLessThan(huBetCount);
  });

  it("pot-odds overlay can force fold for bad odds in a tuned node", () => {
    const config = structuredClone(tightAggressiveConfig);
    config.postflop.table.FLOP.VS_RAISE.WEAK_MADE = {
      id: "test_pot_odds_node",
      actionWeights: { CALL: 1, FOLD: 1 },
    };
    const potOddsAxis = config.axes?.find((axis) => axis.id === "pot_odds");
    if (!potOddsAxis) throw new Error("missing pot_odds axis in test config");
    potOddsAxis.buckets.BAD = { CALL: 0, FOLD: 2 };
    potOddsAxis.buckets.EXCELLENT = { CALL: 2, FOLD: 0 };
    const goodOddsCtx = makePostflopCtx({
      board: ["As", "Ad", "7h"], // WEAK_MADE
      potCents: 5000,
      roundCurrentBetCents: 200, // EXCELLENT pot odds
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: false,
    });
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(config));

    const badOddsCtx = makePostflopCtx({
      board: ["As", "Ad", "7h"], // WEAK_MADE
      potCents: 100,
      roundCurrentBetCents: 500, // BAD pot odds
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: false,
    });
    for (let i = 0; i < 60; i += 1) {
      const action = brain.pickAction(badOddsCtx);
      expect(action.action).toBe("FOLD");
    }
    let sawCall = false;
    for (let i = 0; i < 80; i += 1) {
      const action = brain.pickAction(goodOddsCtx);
      sawCall = sawCall || action.action === "CALL";
    }
    expect(sawCall).toBe(true);
  });

  it("draw overlay can introduce CALL for AIR/VS_RAISE with flush draw in a tuned node", () => {
    const config = structuredClone(tightAggressiveConfig);
    config.postflop.table.FLOP.VS_RAISE.AIR = {
      id: "test_draw_node",
      actionWeights: { FOLD: 1, CALL: 1 },
    };
    const drawAxis = config.axes?.find((axis) => axis.id === "draws");
    if (!drawAxis) throw new Error("missing draws axis in test config");
    drawAxis.buckets.NONE = { CALL: 0, FOLD: 1 };
    drawAxis.buckets.FLUSH_DRAW = { CALL: 2, FOLD: 1 };
    drawAxis.buckets.COMBO_DRAW = { CALL: 2, FOLD: 1 };
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(config));

    const noDrawCtx = makePostflopCtx({
      board: ["As", "Kd", "7h"], // AIR
      heroHoleCards: ["2c", "9d"],
      potCents: 1000,
      roundCurrentBetCents: 200,
      roundBetCents: 0,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: false,
    });
    for (let i = 0; i < 80; i += 1) {
      const action = brain.pickAction(noDrawCtx);
      expect(action.action).not.toBe("CALL");
    }

    const flushDrawCtx = {
      ...noDrawCtx,
      handSnapshot: {
        ...noDrawCtx.handSnapshot,
        board: ["Ah", "7h", "2h"],
      },
      heroHoleCards: ["Kh", "Qd"], // 4 hearts total -> flush draw
    };
    const derived = deriveFeatures(flushDrawCtx, loadTightAggressiveConfig(config).preflop.handTierByComboIndex);
    expect(derived.drawFlags?.hasFlushDraw).toBe(true);
    let sawCall = false;
    for (let i = 0; i < 180; i += 1) {
      const action = brain.pickAction(flushDrawCtx);
      sawCall = sawCall || action.action === "CALL";
    }
    expect(sawCall).toBe(true);
  });

  it("monte-carlo invariant: PREMIUM proxy (AA) never folds in EARLY/UNOPENED", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("PREMIUM")));
    const ctx = makePreflopCtx({
      seat: 0, // EARLY
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 600,
    });

    const actions = sampleActions(brain, ctx, 5000);
    expect(actions).not.toContain("FOLD");
  });

  it("monte-carlo invariant: TRASH never calls or raises in EARLY/UNOPENED", () => {
    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(withFirstComboTier("TRASH")));
    const ctx = makePreflopCtx({
      seat: 0, // EARLY
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 600,
    });

    const actions = sampleActions(brain, ctx, 5000);
    expect(actions).not.toContain("CALL");
    expect(actions).not.toContain("RAISE");
  });

  it("emits decision trace when debug flag enabled", () => {
    const debugConfig: TightAggressiveConfigV1 = {
      ...tightAggressiveConfig,
      debug: { emitDecisionTrace: true },
    };
    const spy = vi.spyOn(logger, "debug").mockImplementation(() => logger);

    const brain = new TightAggressiveBrain(loadTightAggressiveConfig(debugConfig));
    const ctx = makePreflopCtx({
      seat: 0,
      potCents: 300,
      roundCurrentBetCents: 100,
      roundBetCents: 100,
      canCheck: true,
      canCall: true,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 600,
    });

    brain.pickAction(ctx);

    expect(spy).toHaveBeenCalled();
    const payload = spy.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      trace: {
        brainId: "tight_aggressive_v1",
        nodeId: expect.any(String),
        baseWeights: expect.any(Object),
        axesApplied: expect.any(Array),
        finalWeights: expect.any(Object),
        chosenAction: expect.any(String),
      },
    });
    expect(spy.mock.calls[0]?.[1]).toBe("BOT_DECISION_TRACE");
    spy.mockRestore();
  });
});
