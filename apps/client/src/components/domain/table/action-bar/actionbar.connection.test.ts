import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { ActionBarConnectionStatus } from "@/components/domain/table/action-bar";
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

// Mock the action options with correct interface
const mockActionOptions: HeroActionOptions = {
  canFold: true,
  canCheck: false,
  canCall: true,
  canBet: false,
  canRaise: false,
  canAllIn: false,
  primaryWagerAction: "NONE",
  callAmount: 100,
  minRaiseTo: 200,
  maxRaiseTo: 1000,
};

describe("ActionBar Connection Status Logic", () => {
  it("should show actions whenever server says it is hero turn", () => {
    const availability = getActionContext({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(true);
  });

  it("should enable actions when transport is healthy", () => {
    const availability = getActionContext({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(actionsEnabled(availability.allowedActions)).toBe(true);
  });

  it("should disable actions while reconnecting or disconnected", () => {
    const reconnectingAvailability = getActionContext({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "RECONNECTING",
    });
    expect(actionsEnabled(reconnectingAvailability.allowedActions)).toBe(false);

    const disconnectedAvailability = getActionContext({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "DISCONNECTED",
    });
    expect(actionsEnabled(disconnectedAvailability.allowedActions)).toBe(false);
  });

  it("should disable actions when not player's turn regardless of connection", () => {
    const availability = getActionContext({
      isMyTurn: false,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(false);
    expect(actionsEnabled(availability.allowedActions)).toBe(false);
  });

  it("should disable actions when no action options regardless of connection", () => {
    const availability = getActionContext({
      isMyTurn: true,
      actionOptions: undefined,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(false);
    expect(actionsEnabled(availability.allowedActions)).toBe(false);
  });

  it("should treat undefined connection status as non-blocking", () => {
    const connectionStatus: ActionBarConnectionStatus = undefined;
    const availability = getActionContext({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus,
    });
    expect(actionsEnabled(availability.allowedActions)).toBe(true);
  });
});
