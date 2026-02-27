import { describe, expect, it } from "vitest";
import { getActionContext } from "@/components/domain/table/actionBar.logic";
import { buildReplayDisabledSceneModel } from "@/components/replay/replaySceneModel";
import type { TableSceneModel } from "@/components/domain/table/model/useTableSceneModel";

function makeInteractiveSceneModel(): TableSceneModel {
  const actionContext = getActionContext({
    isMyTurn: true,
    actionOptions: {
      canFold: true,
      canCheck: false,
      canCall: true,
      canBet: false,
      canRaise: false,
      canAllIn: false,
      primaryWagerAction: "NONE",
      callAmount: 100,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    },
    connectionStatus: "CONNECTED",
  });
  return {
    handSummary: { street: "FLOP", potCents: 500 },
    actionContext,
    canAct: true,
    heroStatus: "ACTIVE",
    communityCards: [null, null, null, null, null],
    potCents: 500,
    heroCards: [null, null],
    heroStackCents: 2000,
    heroActionOptions: undefined,
    heroCalculations: undefined,
    heroPlayerStats: undefined,
    heroName: "Hero",
    heroAvatarUrl: undefined,
    isHeroToAct: true,
    isHeroWinner: false,
    isHeroDealer: false,
    tableName: "Table 1",
    playerCount: 2,
    maxSeats: 6,
    blinds: { smallBlindCents: 50, bigBlindCents: 100 },
  };
}

describe("buildReplayDisabledSceneModel", () => {
  it("sets canAct to false", () => {
    const input = makeInteractiveSceneModel();
    const result = buildReplayDisabledSceneModel(input);
    expect(result.canAct).toBe(false);
  });

  it("sets actionContext.showActions to false", () => {
    const input = makeInteractiveSceneModel();
    const result = buildReplayDisabledSceneModel(input);
    expect(result.actionContext.showActions).toBe(false);
  });

  it("disables all allowedActions", () => {
    const input = makeInteractiveSceneModel();
    const result = buildReplayDisabledSceneModel(input);
    expect(result.actionContext.allowedActions.FOLD).toBe(false);
    expect(result.actionContext.allowedActions.CHECK).toBe(false);
    expect(result.actionContext.allowedActions.CALL).toBe(false);
    expect(result.actionContext.allowedActions.ALL_IN).toBe(false);
    expect(result.actionContext.allowedActions.WAGER).toBe(false);
  });

  it("preserves other scene model fields", () => {
    const input = makeInteractiveSceneModel();
    const result = buildReplayDisabledSceneModel(input);
    expect(result.tableName).toBe(input.tableName);
    expect(result.potCents).toBe(input.potCents);
    expect(result.heroName).toBe(input.heroName);
    expect(result.blinds).toEqual(input.blinds);
  });

  it("returns a frozen object (cannot mutate)", () => {
    const input = makeInteractiveSceneModel();
    const result = buildReplayDisabledSceneModel(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.actionContext)).toBe(true);
    expect(Object.isFrozen(result.actionContext.allowedActions)).toBe(true);
    expect(() => {
      (result as { canAct: boolean }).canAct = true;
    }).toThrow();
  });
});

