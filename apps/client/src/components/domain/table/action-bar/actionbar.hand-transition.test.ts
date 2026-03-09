import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import { getActionContext } from "@/components/domain/table/action-bar";

function actionsEnabled(allowed: {
  FOLD: boolean;
  CHECK: boolean;
  CALL: boolean;
  ALL_IN: boolean;
  WAGER: boolean;
}): boolean {
  return Object.values(allowed).some(Boolean);
}

const turnActionOptions: HeroActionOptions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  canBet: false,
  canRaise: true,
  canAllIn: true,
  primaryWagerAction: "RAISE",
  callAmount: 200,
  minRaiseTo: 600,
  maxRaiseTo: 2000,
};

describe("ActionBar hand transition regression", () => {
  it("keeps controls visible when next hand starts and hero is first to act", () => {
    const handEnd = getActionContext({
      isMyTurn: false,
      actionOptions: undefined,
      connectionStatus: "CONNECTED",
    });
    expect(handEnd.showActions).toBe(false);
    expect(actionsEnabled(handEnd.allowedActions)).toBe(false);

    const nextPreflopFirstSnapshot = getActionContext({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: undefined,
    });
    expect(nextPreflopFirstSnapshot.showActions).toBe(true);
    expect(actionsEnabled(nextPreflopFirstSnapshot.allowedActions)).toBe(true);
  });

  it("disables controls only while transport is explicitly unavailable", () => {
    const reconnecting = getActionContext({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: "RECONNECTING",
    });
    expect(reconnecting.showActions).toBe(true);
    expect(actionsEnabled(reconnecting.allowedActions)).toBe(false);

    const recovered = getActionContext({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(recovered.showActions).toBe(true);
    expect(actionsEnabled(recovered.allowedActions)).toBe(true);
  });
});
