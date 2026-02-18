import { describe, expect, it, vi } from "vitest";
import { HandCalculationsCoordinator } from "../engine/odds/HandCalculationsCoordinator.js";
import { OddsCoordinator } from "../engine/odds/OddsCoordinator.js";
import { SnapshotService } from "../engine/dealer/services/SnapshotService.js";

// Mock the OddsCoordinator to simulate a total failure
vi.mock("../engine/odds/OddsCoordinator.js", () => {
  return {
    OddsCoordinator: vi.fn().mockImplementation(() => ({
      getEquitySync: () => {
        throw new Error("Advisory Math Simulated Failure");
      },
    })),
  };
});

describe("Odds Subsystem Independence", () => {
  it("should not crash HandCalculationsCoordinator when OddsCoordinator throws", async () => {
    const coordinator = new HandCalculationsCoordinator();
    
    const params: any = {
      tableId: "t1",
      handId: "h1",
      street: "FLOP",
      board: ["As", "Kd", "Qh"],
      potCents: 1000,
      players: [
        { id: "u1", seat: 0, status: "ACTIVE" },
        { id: "u2", seat: 1, status: "ACTIVE" },
      ],
      holeCardsByPlayerId: new Map([["u1", ["Ah", "Ad"]], ["u2", ["Ks", "Kh"]]]),
      getActionOptions: () => ({ callAmount: 100 }),
    };

    coordinator.refresh(params);
    
    // Wait for async refreshInternal to run (via queueMicrotask)
    await new Promise(resolve => setTimeout(resolve, 10));

    const calc = coordinator.getForUser("u1");
    expect(calc).toBeDefined();
    expect(calc?.stale).toBe(true);
    expect(calc?.equityPct).toBeUndefined();
  });

  it("should still provide pot odds via SnapshotService even if advisory math fails", async () => {
    const state: any = {
      tableId: "t1",
      handId: "h1",
      street: "FLOP",
      board: ["As", "Kd", "Qh"],
      potCents: 1000,
      playersById: new Map([
        ["u1", { id: "u1", seat: 0, status: "ACTIVE", stackCents: 1000, roundBetCents: 0, committedCents: 0 }],
      ]),
      seats: ["u1"],
    };

    const snapshotService = new SnapshotService({
      state,
      clientsByUserId: new Map(),
      holeCardsByPlayerId: new Map([["u1", ["Ah", "Ad"]]]),
      getHeroActionOptions: () => ({ 
        canFold: true, canCheck: false, canCall: true, canBet: false, canRaise: false, canAllIn: false,
        primaryWagerAction: "NONE",
        callAmount: 250 
      } as any),
      getLastAction: () => undefined,
      getLastHandResult: () => undefined,
    });

    // @ts-ignore - access private buildTableSnapshot for verification
    const snapshot = snapshotService.buildTableSnapshot("u1", "ACTION_ACCEPTED");

    // potOddsPct = 250 / (1000 + 250) = 250 / 1250 = 0.2 = 20%
    expect(snapshot.hero.calculations?.potOddsPct).toBe(20);
    // Since it's a fresh coordinator and it's blocked by the mock (or just didn't run yet), 
    // equityPct should be undefined, but the object should exist because of potOddsPct.
    expect(snapshot.hero.calculations?.equityPct).toBeUndefined();
  });
});
