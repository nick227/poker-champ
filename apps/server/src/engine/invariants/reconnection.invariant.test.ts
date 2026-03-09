import { describe, expect, it } from "vitest";
import { assertStateInvariants } from "./assertState.js";
import { PlayerState } from "../../state/PlayerState.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerLifecycleService } from "../dealer/services/PlayerLifecycleService.js";
import { eligibleToAct } from "../rules/BettingRound.js";

describe("Reconnection Bug - STATE_INVARIANT_VIOLATION", () => {
  it("should reproduce the exact invariant violation", () => {
    const state = new PokerState();
    state.tableId = "test-table";
    state.street = "FLOP";
    state.roundCurrentBetCents = 500;
    state.toActSeat = 1;
    state.potCents = 500; // Match A's bet
    
    // Create the problematic scenario
    const playerA = new PlayerState();
    playerA.id = "A";
    playerA.seat = 0;
    playerA.stackCents = 500;
    playerA.status = "ACTIVE";
    playerA.connected = true;
    playerA.roundBetCents = 500;
    playerA.committedCents = 500;
    playerA.needsAction = false; // A just acted
    
    const playerB = new PlayerState();
    playerB.id = "B";
    playerB.seat = 1;
    playerB.stackCents = 200;
    playerB.status = "ACTIVE"; // The bug: B is ACTIVE but needsAction=false
    playerB.connected = true;
    playerB.roundBetCents = 0;
    playerB.committedCents = 0;
    playerB.needsAction = false; // This is the problem!
    
    // Setup proper state
    state.seats = ["A", "B"];
    state.playersById.set("A", playerA);
    state.playersById.set("B", playerB);
    
    // This should trigger the invariant violation
    // Because there are ACTIVE players, betting round not complete,
    // but no one has needsAction=true
    expect(() => assertStateInvariants(state)).toThrow("STATE_INVARIANT_VIOLATION: active hand has no eligible player marked needsAction");
  });
  
  it("should show that current reconnection logic is correct", () => {
    const state = new PokerState();
    state.tableId = "test-table";
    state.street = "FLOP";
    state.roundCurrentBetCents = 500;
    state.toActSeat = 1;
    state.potCents = 500;
    
    // Create abandoned player
    const playerB = new PlayerState();
    playerB.id = "B";
    playerB.seat = 1;
    playerB.stackCents = 200;
    playerB.status = "ABANDONED"; // B is abandoned
    playerB.connected = false;
    playerB.roundBetCents = 0;
    playerB.committedCents = 0;
    playerB.needsAction = false;
    
    const playerA = new PlayerState();
    playerA.id = "A";
    playerA.seat = 0;
    playerA.stackCents = 500;
    playerA.status = "ACTIVE";
    playerA.connected = true;
    playerA.roundBetCents = 500;
    playerA.committedCents = 500;
    playerA.needsAction = false;
    
    state.seats = ["A", "B"];
    state.playersById.set("A", playerA);
    state.playersById.set("B", playerB);
    
    // Now simulate reconnection with current logic
    const mockDeps = {
      state,
      autoActionsByUserId: new Map(),
      ensurePlayerPersistence: async () => {},
    } as any;
    
    const lifecycleService = new PlayerLifecycleService(mockDeps);
    
    // B reconnects mid-hand
    playerB.connected = true;
    const plans = lifecycleService.markReconnected("B");
    
    // B should remain ABANDONED (current logic is correct)
    expect(playerB.status).toBe("ABANDONED");
    expect(playerB.needsAction).toBe(false);
    
    // No invariant violation because B is not eligibleToAct
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
  
  it("should show what happens if the street check is missing", () => {
    const state = new PokerState();
    state.tableId = "test-table";
    state.street = "FLOP"; // Active hand
    state.roundCurrentBetCents = 500;
    state.toActSeat = 1;
    state.potCents = 500;
    
    // Create abandoned player
    const playerB = new PlayerState();
    playerB.id = "B";
    playerB.seat = 1;
    playerB.stackCents = 200;
    playerB.status = "ABANDONED";
    playerB.connected = false;
    playerB.roundBetCents = 0;
    playerB.committedCents = 0;
    playerB.needsAction = false;
    
    const playerA = new PlayerState();
    playerA.id = "A";
    playerA.seat = 0;
    playerA.stackCents = 500;
    playerA.status = "ACTIVE";
    playerA.connected = true;
    playerA.roundBetCents = 500;
    playerA.committedCents = 500;
    playerA.needsAction = false;
    
    state.seats = ["A", "B"];
    state.playersById.set("A", playerA);
    state.playersById.set("B", playerB);
    
    // Simulate the BUG: missing street === "WAITING" check
    playerB.connected = true;
    if (playerB.status === "ABANDONED" && playerB.stackCents > 0) {
      // BUG: Missing street check!
      playerB.status = "ACTIVE";
    }
    
    // Now we have the invariant violation
    expect(playerB.status).toBe("ACTIVE");
    expect(playerB.needsAction).toBe(false);
    expect(playerA.needsAction).toBe(false);
    
    // This should throw the invariant violation
    expect(() => assertStateInvariants(state)).toThrow("STATE_INVARIANT_VIOLATION: active hand has no eligible player marked needsAction");
  });
});
