import { describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { TightAggressiveBrain } from "./TightAggressiveBrain.js";
import tightAggressiveConfig from "./config/tightAggressive.config.js";
import { loadTightAggressiveConfig } from "./runtime/loadTightAggressiveConfig.js";
import type { AxisMeta, DrawFlags } from "./types.js";
import type { BotActionContext } from "../../BotBrain.js";
import { logger } from "../../../../lib/logger.js";

type TraceContribution = {
  action: string;
  bucketMultiplier: number;
  strength: number;
  finalMultiplier: number;
};

type AxisTrace = {
  axisId: string;
  bucket: string;
  contributions: TraceContribution[];
};

type DecisionTrace = {
  axesApplied: AxisTrace[];
  drawFlags?: DrawFlags;
};

type HeatSnapshot = {
  brainId: "tight_aggressive_v1";
  simulations: number;
  seed: number;
  rows: Array<{
    axisId: string;
    influence: number;
    share: number;
  }>;
};

const HEATMAP_PATH = resolve(process.cwd(), "artifacts/heatmaps/tight_aggressive_v1.heat.json");
const HEATMAP_SHARE_EPSILON = 0.003;
const HEATMAP_INFLUENCE_EPSILON = 0.05;
const ASSERT_RANGES_ENABLED = process.env.HEATMAP_ASSERT === "1";
const UPDATE_SNAPSHOT = process.env.UPDATE_HEATMAP === "1";

const AXIS_SHARE_RANGES: Record<string, { min: number; max: number }> = {
  player_count: { min: 0.25, max: 0.4 },
  stack_depth: { min: 0.1, max: 0.2 },
  initiative: { min: 0.08, max: 0.18 },
  facing_pressure: { min: 0.06, max: 0.15 },
  spr: { min: 0.05, max: 0.12 },
  position_postflop: { min: 0.04, max: 0.1 },
  street: { min: 0.02, max: 0.08 },
  pot_odds: { min: 0.02, max: 0.08 },
  draws: { min: 0.02, max: 0.08 },
  open_opportunity: { min: 0.02, max: 0.08 },
};

function makeCtx(args: {
  street: "PREFLOP" | "FLOP" | "TURN" | "RIVER";
  board: string[];
  heroHoleCards?: string[];
  seat: number;
  stackCents: number;
  potCents: number;
  roundCurrentBetCents: number;
  roundBetCents: number;
  activePlayersInHand?: number;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  canAllIn?: boolean;
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
      minRaiseTo: args.canRaise ? Math.max(args.roundCurrentBetCents * 2, 200) : undefined,
      maxRaiseTo: args.canRaise ? Math.max(args.roundCurrentBetCents * 4, 800) : undefined,
    },
    handSnapshot: {
      street: args.street,
      potCents: args.potCents,
      roundCurrentBetCents: args.roundCurrentBetCents,
      board: args.board,
    },
    seatSnapshot: {
      stackCents: args.stackCents,
      roundBetCents: args.roundBetCents,
      seat: args.seat,
    },
    activePlayersInHand: args.activePlayersInHand,
    heroHoleCards: args.heroHoleCards,
  };
}

function influenceMagnitude(multiplier: number): number {
  const safe = Math.max(multiplier, 1e-6);
  return Math.abs(Math.log(safe));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function withSeededMathRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  const seeded = createSeededRandom(seed);
  (Math.random as unknown as (() => number)) = seeded;
  try {
    return fn();
  } finally {
    (Math.random as unknown as (() => number)) = original;
  }
}

function writeSnapshot(snapshot: HeatSnapshot): void {
  mkdirSync(dirname(HEATMAP_PATH), { recursive: true });
  writeFileSync(HEATMAP_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

function readSnapshot(): HeatSnapshot {
  return JSON.parse(readFileSync(HEATMAP_PATH, "utf8")) as HeatSnapshot;
}

describe("tight aggressive axis heat map", () => {
  it("automatically reports runtime axis influence and enforces balance guardrails", () => {
    const config = structuredClone(tightAggressiveConfig);
    config.debug = { emitDecisionTrace: true };
    const compiled = loadTightAggressiveConfig(config);
    const brain = new TightAggressiveBrain(compiled);

    const contexts: BotActionContext[] = [
      // PREFLOP: unopened, isolate, all-in; stack-depth + pot-odds variation.
      makeCtx({
        street: "PREFLOP",
        board: [],
        seat: 0,
        stackCents: 1200, // short
        potCents: 300,
        roundCurrentBetCents: 100,
        roundBetCents: 100,
        activePlayersInHand: 2,
        canCheck: true,
        canCall: true,
        canBet: false,
        canRaise: true,
      }),
      makeCtx({
        street: "PREFLOP",
        board: [],
        seat: 4,
        stackCents: 9000, // deep
        potCents: 1000,
        roundCurrentBetCents: 200, // to-call 200 -> GOOD odds
        roundBetCents: 0,
        activePlayersInHand: 4,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: true,
      }),
      makeCtx({
        street: "PREFLOP",
        board: [],
        seat: 2,
        stackCents: 200, // all-in pressure classification
        potCents: 1200,
        roundCurrentBetCents: 300,
        roundBetCents: 0,
        activePlayersInHand: 5,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: false,
      }),

      // FLOP: draw / no-draw variants, IP/OOP, different player counts.
      makeCtx({
        street: "FLOP",
        board: ["Ah", "7h", "2h"], // flush draw possible
        heroHoleCards: ["Kh", "Qd"],
        seat: 4, // late -> IN_POSITION
        stackCents: 5000,
        potCents: 1000,
        roundCurrentBetCents: 200,
        roundBetCents: 0,
        activePlayersInHand: 2,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: true,
      }),
      makeCtx({
        street: "FLOP",
        board: ["9c", "8d", "7h"], // open-ended possible
        heroHoleCards: ["6s", "2d"],
        seat: 0, // EARLY -> OUT_OF_POSITION
        stackCents: 1800,
        potCents: 2200,
        roundCurrentBetCents: 0,
        roundBetCents: 0,
        activePlayersInHand: 3,
        canCheck: true,
        canCall: false,
        canBet: true,
        canRaise: false,
      }),
      makeCtx({
        street: "FLOP",
        board: ["As", "Kd", "7h"], // no draw
        heroHoleCards: ["2c", "9d"],
        seat: 5,
        stackCents: 7000,
        potCents: 800,
        roundCurrentBetCents: 450, // BAD odds
        roundBetCents: 0,
        activePlayersInHand: 5,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: false,
      }),

      // TURN / RIVER to exercise street axis and SPR variants.
      makeCtx({
        street: "TURN",
        board: ["Ah", "Qh", "2c", "7d"],
        heroHoleCards: ["Kh", "Jd"],
        seat: 3,
        stackCents: 1500,
        potCents: 3000, // low SPR
        roundCurrentBetCents: 500,
        roundBetCents: 0,
        activePlayersInHand: 2,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: true,
      }),
      makeCtx({
        street: "RIVER",
        board: ["As", "Ad", "7h", "7c", "2d"],
        heroHoleCards: ["Kc", "Qd"],
        seat: 1,
        stackCents: 8000,
        potCents: 900, // high SPR
        roundCurrentBetCents: 0,
        roundBetCents: 0,
        activePlayersInHand: 4,
        canCheck: true,
        canCall: false,
        canBet: true,
        canRaise: false,
      }),
    ];

    const traces: DecisionTrace[] = [];
    const spy = vi.spyOn(logger, "debug").mockImplementation(((payload?: unknown, message?: string) => {
      if (message === "BOT_DECISION_TRACE") {
        const trace = (payload as { trace?: DecisionTrace })?.trace;
        if (trace) traces.push(trace);
      }
      return logger;
    }) as typeof logger.debug);

    const simulations = 10_000;
    const seed = 1337;
    withSeededMathRandom(seed, () => {
      for (let i = 0; i < simulations; i += 1) {
        brain.pickAction(contexts[i % contexts.length]);
      }
    });
    spy.mockRestore();

    expect(traces.length).toBe(simulations);

    const influenceByAxis = new Map<string, number>();
    for (const trace of traces) {
      for (const axis of trace.axesApplied) {
        let delta = 0;
        for (const contribution of axis.contributions) {
          delta += influenceMagnitude(contribution.finalMultiplier);
        }
        influenceByAxis.set(axis.axisId, (influenceByAxis.get(axis.axisId) ?? 0) + delta);
      }
    }

    const totalInfluence = [...influenceByAxis.values()].reduce((sum, value) => sum + value, 0);
    expect(totalInfluence).toBeGreaterThan(0);

    const activeAxes = new Set(compiled.axisMeta.filter((axis: AxisMeta) => axis.tier === "ACTIVE").map((axis) => axis.id));
    const inactiveAxes = new Set(compiled.axisMeta.filter((axis: AxisMeta) => axis.tier !== "ACTIVE").map((axis) => axis.id));

    for (const axisId of activeAxes) {
      const influence = influenceByAxis.get(axisId) ?? 0;
      expect(influence, `active axis '${axisId}' should not be dead`).toBeGreaterThan(0);
    }

    for (const axisId of inactiveAxes) {
      const influence = influenceByAxis.get(axisId) ?? 0;
      expect(influence, `inactive axis '${axisId}' should remain neutral`).toBe(0);
    }

    const rows = [...activeAxes]
      .map((axisId) => {
        const influence = influenceByAxis.get(axisId) ?? 0;
        const share = influence / totalInfluence;
        return { axisId, influence, share };
      })
      .sort((a, b) => b.share - a.share);

    const snapshot: HeatSnapshot = {
      brainId: "tight_aggressive_v1",
      simulations,
      seed,
      rows,
    };

    if (UPDATE_SNAPSHOT) {
      writeSnapshot(snapshot);
    } else {
      const baseline = readSnapshot();
      expect(baseline.brainId).toBe(snapshot.brainId);
      expect(baseline.simulations).toBe(snapshot.simulations);
      expect(baseline.seed).toBe(snapshot.seed);
      expect(baseline.rows.map((r) => r.axisId)).toEqual(snapshot.rows.map((r) => r.axisId));
      for (let i = 0; i < snapshot.rows.length; i += 1) {
        const expected = baseline.rows[i];
        const actual = snapshot.rows[i];
        expect(Math.abs(actual.share - expected.share)).toBeLessThanOrEqual(HEATMAP_SHARE_EPSILON);
        expect(Math.abs(actual.influence - expected.influence)).toBeLessThanOrEqual(HEATMAP_INFLUENCE_EPSILON);
      }
    }

    const topShare = rows[0]?.share ?? 0;
    expect(topShare).toBeLessThan(0.45);

    const minShare = rows[rows.length - 1]?.share ?? 0;
    expect(minShare).toBeGreaterThan(0.005);

    const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;
    // Keep this as console output so CI logs provide immediate heat-map visibility.
    console.log("\nTA v1 Axis Heat Report (10k sims)");
    for (const row of rows) {
      const bar = "█".repeat(Math.max(1, Math.round(row.share * 40)));
      console.log(`${row.axisId.padEnd(24)} ${bar.padEnd(40)} ${formatPct(row.share)}`);
    }

    if (ASSERT_RANGES_ENABLED) {
      for (const row of rows) {
        const range = AXIS_SHARE_RANGES[row.axisId];
        if (!range) continue;
        expect(
          row.share >= range.min && row.share <= range.max,
          `axis '${row.axisId}' share ${row.share.toFixed(4)} outside [${range.min}, ${range.max}]`,
        ).toBe(true);
      }
    }
  });
});
