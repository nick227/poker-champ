import { describe, expect, it } from "vitest";
import { loadTightAggressiveConfig } from "../engine/bots/brains/tight_aggressive/runtime/loadTightAggressiveConfig.js";
import tightAggressiveConfig from "../engine/bots/brains/tight_aggressive/config/tightAggressive.config.js";
import type {
  BetSizeBucket,
  HandTier,
  PostflopHandClass,
  PositionBucket,
  PressureBucket,
  PreflopNodeAuthoring,
  Street,
  TightAggressiveConfigV1,
} from "../engine/bots/brains/tight_aggressive/types.js";

const POSITIONS: readonly PositionBucket[] = ["EARLY", "MIDDLE", "LATE", "BLINDS"];
const PRESSURES: readonly PressureBucket[] = ["UNOPENED", "VS_RAISE", "VS_3BET_PLUS", "VS_ALLIN"];
const BET_SIZES: readonly Exclude<BetSizeBucket, "NONE">[] = ["SMALL", "MEDIUM", "LARGE", "MAX"];
const STREETS: readonly Street[] = ["FLOP", "TURN", "RIVER"];
const HAND_CLASSES: readonly PostflopHandClass[] = ["AIR", "WEAK_MADE", "STRONG_MADE"];

function make169(fill: number): number[] {
  return Array.from({ length: 169 }, () => fill);
}

function makeNode(id: string): PreflopNodeAuthoring {
  return {
    id,
    comboTierWeights: {
      PREMIUM: 100,
      STRONG: 60,
      GOOD: 30,
      SPEC: 15,
      TRASH: 0,
    },
    actionWeights: {
      FOLD: 5,
      CALL: 10,
      RAISE: 30,
      ALL_IN: 2,
    },
    sizingWeights: { OPEN_STD: 1, JAM: 1 },
  };
}

function createBaseConfig(): TightAggressiveConfigV1 {
  let idx = 0;
  const table = {} as TightAggressiveConfigV1["preflop"]["table"];
  for (const pos of POSITIONS) {
    table[pos] = {
      UNOPENED: makeNode(`pf_${idx++}`),
      VS_RAISE: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_RAISE"],
      VS_3BET_PLUS: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_3BET_PLUS"],
      VS_ALLIN: {} as TightAggressiveConfigV1["preflop"]["table"][PositionBucket]["VS_ALLIN"],
    };
    for (const size of BET_SIZES) {
      table[pos].VS_RAISE[size] = makeNode(`pf_${idx++}`);
      table[pos].VS_3BET_PLUS[size] = makeNode(`pf_${idx++}`);
      table[pos].VS_ALLIN[size] = makeNode(`pf_${idx++}`);
    }
  }

  const postflop = {} as TightAggressiveConfigV1["postflop"]["table"];
  for (const street of STREETS) {
    postflop[street] = {} as TightAggressiveConfigV1["postflop"]["table"][Street];
    for (const pressure of PRESSURES) {
      postflop[street][pressure] = {} as TightAggressiveConfigV1["postflop"]["table"][Street][PressureBucket];
      for (const handClass of HAND_CLASSES) {
        postflop[street][pressure][handClass] = {
          id: `po_${idx++}`,
          actionWeights: { CHECK: 5, CALL: 10, BET: 25 },
          sizingWeights: { CBET_STD: 1, JAM: 1 },
        };
      }
    }
  }

  const tiers: HandTier[] = [];
  while (tiers.length < 169) {
    tiers.push("PREMIUM", "STRONG", "GOOD", "SPEC", "TRASH");
  }

  return {
    version: 1,
    metadata: { id: "tight_aggressive_v1", label: "Tight Aggressive" },
    normalization: { maxWeight: 100, zeroIsFoldGate: true },
    preflop: {
      comboIndexMap: "STANDARD_169_V1",
      handTierByComboIndex: tiers.slice(0, 169),
      table,
    },
    postflop: {
      evaluator: "BEST5_V1",
      table: postflop,
    },
    sizing: { recipes: "CASH_STANDARD_V1" },
    safety: { fallbackActionOrder: ["CHECK", "FOLD", "CALL", "ALL_IN"] },
    debug: { emitDecisionTrace: true },
  };
}

describe("loadTightAggressiveConfig", () => {
  it("keeps full declarative axis inventory wired (32 unique axes)", () => {
    const compiled = loadTightAggressiveConfig(tightAggressiveConfig);
    expect(compiled.axes).toHaveLength(32);
    expect(new Set(compiled.axes.map((axis) => axis.id)).size).toBe(32);
  });

  it("compiles tier authoring to 169 and deep-freezes output", () => {
    const config = createBaseConfig();
    const compiled = loadTightAggressiveConfig(config);

    const node = compiled.preflop.table.EARLY.UNOPENED;
    expect(node.comboWeightSource).toBe("TIER");
    expect(node.comboWeights169).toHaveLength(169);
    expect(node.comboWeights169[0]).toBe(100);

    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.preflop.table.EARLY.UNOPENED)).toBe(true);
    expect(() => {
      (compiled.preflop.table.EARLY.UNOPENED.actionWeights as any).RAISE = 999;
    }).toThrow();
  });

  it("accepts raw 169 node weights and marks source RAW_169", () => {
    const config = createBaseConfig();
    config.preflop.table.EARLY.UNOPENED.comboWeights169 = make169(42);
    delete config.preflop.table.EARLY.UNOPENED.comboTierWeights;

    const compiled = loadTightAggressiveConfig(config);
    expect(compiled.preflop.table.EARLY.UNOPENED.comboWeightSource).toBe("RAW_169");
    expect(compiled.preflop.table.EARLY.UNOPENED.comboWeights169[0]).toBe(42);
  });

  it("rejects invalid version", () => {
    const config = createBaseConfig() as any;
    config.version = 2;
    expect(() => loadTightAggressiveConfig(config)).toThrow(/INVALID_VERSION/);
  });

  it("rejects non-169 combo arrays", () => {
    const config = createBaseConfig();
    config.preflop.table.EARLY.UNOPENED.comboWeights169 = [1, 2, 3];
    delete config.preflop.table.EARLY.UNOPENED.comboTierWeights;
    expect(() => loadTightAggressiveConfig(config)).toThrow(/INVALID_COMBO_WEIGHT_LENGTH/);
  });

  it("rejects negative weights", () => {
    const config = createBaseConfig();
    config.preflop.table.MIDDLE.UNOPENED.actionWeights.RAISE = -1;
    expect(() => loadTightAggressiveConfig(config)).toThrow(/INVALID_WEIGHT/);
  });

  it("rejects duplicate node ids across tables", () => {
    const config = createBaseConfig();
    const dup = config.preflop.table.EARLY.UNOPENED.id;
    config.postflop.table.FLOP.UNOPENED.AIR.id = dup;
    expect(() => loadTightAggressiveConfig(config)).toThrow(/DUPLICATE_NODE_ID/);
  });

  it("rejects NEUTRAL axisMeta with non-neutral multipliers", () => {
    const config = createBaseConfig();
    config.axes = [
      {
        id: "test_axis",
        order: 1,
        feature: "playerCountBucket",
        buckets: { HU: { BET: 1.1 } },
      },
    ];
    config.axisMeta = [{ id: "test_axis", tier: "NEUTRAL" }];
    expect(() => loadTightAggressiveConfig(config)).toThrow(/AXIS_TIER_VIOLATION_NEUTRAL/);
  });

  it("rejects ACTIVE axisMeta when all multipliers are neutral", () => {
    const config = createBaseConfig();
    config.axes = [
      {
        id: "test_axis",
        order: 1,
        feature: "playerCountBucket",
        buckets: { HU: { BET: 1 } },
      },
    ];
    config.axisMeta = [{ id: "test_axis", tier: "ACTIVE" }];
    expect(() => loadTightAggressiveConfig(config)).toThrow(/AXIS_TIER_VIOLATION_ACTIVE/);
  });
});
