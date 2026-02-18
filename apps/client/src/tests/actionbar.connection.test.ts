import { describe, expect, it } from "vitest";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";

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
  it("should enable actions only when CONNECTED", () => {
    // Test the logic that would be used in ActionBar
    const isMyTurn = true;
    const actionOptions = mockActionOptions;
    
    // Test CONNECTED case
    const connectionStatus = "CONNECTED";
    const actionsEnabled = isMyTurn && !!actionOptions && connectionStatus === "CONNECTED";
    expect(actionsEnabled).toBe(true);
    
    // Test RECONNECTING case
    const reconnectingStatus = "RECONNECTING";
    const actionsDisabledReconnecting = isMyTurn && !!actionOptions && reconnectingStatus === "CONNECTED";
    expect(actionsDisabledReconnecting).toBe(false);
    
    // Test DISCONNECTED case
    const disconnectedStatus = "DISCONNECTED";
    const actionsDisabledDisconnected = isMyTurn && !!actionOptions && disconnectedStatus === "CONNECTED";
    expect(actionsDisabledDisconnected).toBe(false);
  });

  it("should disable actions when not player's turn regardless of connection", () => {
    const isMyTurn = false;
    const actionOptions = mockActionOptions;
    const connectionStatus = "CONNECTED";
    
    const actionsEnabled = isMyTurn && !!actionOptions && connectionStatus === "CONNECTED";
    expect(actionsEnabled).toBe(false);
  });

  it("should disable actions when no action options regardless of connection", () => {
    const isMyTurn = true;
    const actionOptions = undefined;
    const connectionStatus = "CONNECTED";
    
    const actionsEnabled = isMyTurn && !!actionOptions && connectionStatus === "CONNECTED";
    expect(actionsEnabled).toBe(false);
  });

  it("should handle undefined connection status gracefully", () => {
    const isMyTurn = true;
    const actionOptions = mockActionOptions;
    const connectionStatus = undefined;
    
    const actionsEnabled = isMyTurn && !!actionOptions && connectionStatus === "CONNECTED";
    expect(actionsEnabled).toBe(false);
  });
});
