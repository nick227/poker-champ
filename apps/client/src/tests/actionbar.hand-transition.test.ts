import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import { getActionBarAvailability } from "@/components/domain/table/actionBar.logic";

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
    const handEnd = getActionBarAvailability({
      isMyTurn: false,
      actionOptions: undefined,
      connectionStatus: "CONNECTED",
    });
    expect(handEnd.showActions).toBe(false);
    expect(handEnd.actionsEnabled).toBe(false);

    const nextPreflopFirstSnapshot = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: undefined,
    });
    expect(nextPreflopFirstSnapshot.showActions).toBe(true);
    expect(nextPreflopFirstSnapshot.actionsEnabled).toBe(true);
  });

  it("disables controls only while transport is explicitly unavailable", () => {
    const reconnecting = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: "RECONNECTING",
    });
    expect(reconnecting.showActions).toBe(true);
    expect(reconnecting.actionsEnabled).toBe(false);

    const recovered = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: turnActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(recovered.showActions).toBe(true);
    expect(recovered.actionsEnabled).toBe(true);
  });
});
