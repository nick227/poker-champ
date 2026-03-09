import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { LoosePassiveBrain } from "./PassiveProfileBrains.js";
import {
  getShare,
  makeCtx,
  readSnapshot,
  runScenario,
  writeSnapshot,
  type BrainHeatSnapshot,
} from "../../../../tests/helpers/brainHeatmapTestUtils.js";

const SNAPSHOT_PATH = resolve(process.cwd(), "artifacts/heatmaps/loose_passive_v1.heat.json");
const UPDATE_SNAPSHOT = process.env.UPDATE_HEATMAP === "1";
const ASSERT_RANGES = process.env.HEATMAP_ASSERT === "1";
const SHARE_EPSILON = 0.03;

describe("loose_passive_v1 heatmap", () => {
  it("emits stable action heatmap and satisfies loose-passive invariants", () => {
    const brain = new LoosePassiveBrain();
    const simulations = 5000;
    const seed = 2102;

    const unopened = runScenario(
      brain,
      makeCtx({
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
      }),
      simulations,
      seed,
    );
    const vsRaise = runScenario(
      brain,
      makeCtx({
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
      }),
      simulations,
      seed + 1,
    );

    const snapshot: BrainHeatSnapshot = {
      brainId: "loose_passive_v1",
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
    const vsRaiseCall = getShare(vsRaise, "CALL");
    const vsRaiseFold = getShare(vsRaise, "FOLD");
    const vsRaiseRaise = getShare(vsRaise, "RAISE");

    expect(vsRaiseCall).toBeGreaterThan(vsRaiseFold);
    expect(vsRaiseRaise).toBeLessThan(0.12);

    if (ASSERT_RANGES) {
      expect(vsRaiseCall).toBeGreaterThan(0.6);
    }
  });
});

