import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { ActionBarConnectionStatus } from "@/components/domain/table/actionBar.logic";
import { getActionBarAvailability } from "@/components/domain/table/actionBar.logic";

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
    const availability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(true);
  });

  it("should enable actions when transport is healthy", () => {
    const availability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(availability.actionsEnabled).toBe(true);
  });

  it("should disable actions while reconnecting or disconnected", () => {
    const reconnectingAvailability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "RECONNECTING",
    });
    expect(reconnectingAvailability.actionsEnabled).toBe(false);

    const disconnectedAvailability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus: "DISCONNECTED",
    });
    expect(disconnectedAvailability.actionsEnabled).toBe(false);
  });

  it("should disable actions when not player's turn regardless of connection", () => {
    const availability = getActionBarAvailability({
      isMyTurn: false,
      actionOptions: mockActionOptions,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(false);
    expect(availability.actionsEnabled).toBe(false);
  });

  it("should disable actions when no action options regardless of connection", () => {
    const availability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: undefined,
      connectionStatus: "CONNECTED",
    });
    expect(availability.showActions).toBe(false);
    expect(availability.actionsEnabled).toBe(false);
  });

  it("should treat undefined connection status as non-blocking", () => {
    const connectionStatus: ActionBarConnectionStatus = undefined;
    const availability = getActionBarAvailability({
      isMyTurn: true,
      actionOptions: mockActionOptions,
      connectionStatus,
    });
    expect(availability.actionsEnabled).toBe(true);
  });
});
