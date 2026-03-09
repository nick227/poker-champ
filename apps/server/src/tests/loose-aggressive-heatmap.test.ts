import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { LooseAggressiveBrain } from "../engine/bots/brains/aggressive/LooseAggressiveBrain.js";
import { TightAggressiveBrain } from "../engine/bots/brains/tight_aggressive/TightAggressiveBrain.js";
import tightAggressiveConfig from "../engine/bots/brains/tight_aggressive/config/tightAggressive.config.js";
import { loadTightAggressiveConfig } from "../engine/bots/brains/tight_aggressive/runtime/loadTightAggressiveConfig.js";
import {
  getShare,
  makeCtx,
  readSnapshot,
  runScenario,
  writeSnapshot,
  type BrainHeatSnapshot,
} from "./helpers/brainHeatmapTestUtils.js";

const SNAPSHOT_PATH = resolve(process.cwd(), "artifacts/heatmaps/loose_aggressive_v1.heat.json");
const UPDATE_SNAPSHOT = process.env.UPDATE_HEATMAP === "1";
const ASSERT_RANGES = process.env.HEATMAP_ASSERT === "1";
const SHARE_EPSILON = 0.03;

describe("loose_aggressive_v1 heatmap", () => {
  it("emits stable action heatmap and satisfies LAG invariants", () => {
    const lag = new LooseAggressiveBrain();
    const tag = new TightAggressiveBrain(loadTightAggressiveConfig(tightAggressiveConfig));
    const simulations = 5000;
    const seed = 2103;

    const unopenedCtx = makeCtx({
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

    const vsRaiseCtx = makeCtx({
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

    const unopened = runScenario(lag, unopenedCtx, simulations, seed);
    const vsRaise = runScenario(lag, vsRaiseCtx, simulations, seed + 1);
    const tagVsRaise = runScenario(tag, vsRaiseCtx, simulations, seed + 2);

    const snapshot: BrainHeatSnapshot = {
      brainId: "loose_aggressive_v1",
      simulationsPerScenario: simulations,
      baseSeed: seed,
      scenarios: [
        { name: "UNOPENED_PREFLOP", actions: unopened },
        { name: "VS_RAISE_POSTFLOP", actions: vsRaise },
      ],
    };

    if (UPDATE_SNAPSHOT) {
      writeSnapshot(SNAPSHOT_PATH, snapshot);
    } else {
      const baseline = readSnapshot(SNAPSHOT_PATH);
      expect(baseline.brainId).toBe(snapshot.brainId);
      expect(baseline.scenarios.map((scenario) => scenario.name)).toEqual(snapshot.scenarios.map((scenario) => scenario.name));
      for (let i = 0; i < snapshot.scenarios.length; i += 1) {
        const actual = snapshot.scenarios[i];
        const expected = baseline.scenarios[i];
        expect(actual.actions.map((action) => action.action)).toEqual(expected.actions.map((action) => action.action));
        for (let j = 0; j < actual.actions.length; j += 1) {
          expect(Math.abs(actual.actions[j].share - expected.actions[j].share)).toBeLessThanOrEqual(SHARE_EPSILON);
        }
      }
    }

    // Monte Carlo invariants.
    const lagUnopenedRaise = getShare(unopened, "RAISE");
    const lagUnopenedCall = getShare(unopened, "CALL");
    const lagVsRaiseRaise = getShare(vsRaise, "RAISE");
    const tagVsRaiseRaise = getShare(tagVsRaise, "RAISE");

    expect(lagUnopenedRaise).toBeGreaterThan(lagUnopenedCall);
    expect(lagVsRaiseRaise).toBeGreaterThan(tagVsRaiseRaise);

    if (ASSERT_RANGES) {
      expect(lagUnopenedRaise).toBeGreaterThan(0.35);
      expect(lagVsRaiseRaise).toBeGreaterThan(0.4);
    }
  });
});

