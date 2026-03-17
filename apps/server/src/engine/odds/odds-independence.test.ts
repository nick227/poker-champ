import { describe, expect, it, vi } from "vitest";
import { HandCalculationsCoordinator } from "./HandCalculationsCoordinator.js";
import { SnapshotService } from "../dealer/hand/SnapshotService.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

// Mock the OddsCoordinator to simulate a total failure
vi.mock("../engine/odds/OddsCoordinator.js", () => {
  class FailingOddsCoordinator {
    getEquitySync() {
      throw new Error("Advisory Math Simulated Failure");
    }
  }
  return {
    OddsCoordinator: FailingOddsCoordinator,
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
    const state = new PokerState();
    state.tableId = "t1";
    state.handId = "h1";
    state.street = "FLOP";
    state.board.push("As", "Kd", "Qh");
    state.potCents = 1000;
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 100;
    state.maxBuyInCents = 100000;
    state.seats.push("u1", "u2");
    state.toActSeat = 0;

    const hero = new PlayerState();
    hero.id = "u1";
    hero.userId = "u1";
    hero.name = "u1";
    hero.kind = "HUMAN";
    hero.seat = 0;
    hero.status = "ACTIVE";
    hero.stackCents = 1000;
    hero.roundBetCents = 0;
    hero.committedCents = 0;
    state.playersById.set("u1", hero);

    const villain = new PlayerState();
    villain.id = "u2";
    villain.userId = "u2";
    villain.name = "u2";
    villain.kind = "HUMAN";
    villain.seat = 1;
    villain.status = "ACTIVE";
    villain.stackCents = 1000;
    villain.roundBetCents = 0;
    villain.committedCents = 0;
    state.playersById.set("u2", villain);

    const client = {
      send: vi.fn(),
    } as any;
    const clientsByUserId = new Map<string, any>([["u1", client]]);
    const snapshotService = new SnapshotService({
      state,
      clientsByUserId,
      getHoleCardsByPlayerId: () =>
        new Map([
          ["u1", ["Ah", "Ad"]],
          ["u2", ["Ks", "Kh"]],
        ]),
      getHeroActionOptions: (_userId: string) => ({
        canFold: true,
        canCheck: false,
        canCall: true,
        canBet: false,
        canRaise: false,
        canAllIn: false,
        primaryWagerAction: "NONE",
        callAmount: 250,
      }),
      getResolvedActionId: () => undefined,
      getLastAction: () => undefined,
      getLastHandResult: () => undefined,
      getTurnTimeoutTotalMs: () => 20 * 60_000,
    });
    await snapshotService.emitToUser("u1", "ACTION_ACCEPTED");
    const snapshot = client.send.mock.calls.at(-1)?.[1];

    // potOddsPct = 250 / (1000 + 250) = 250 / 1250 = 0.2 = 20%
    expect(snapshot.hero.calculations?.potOddsPct).toBe(20);
    // Since it's a fresh coordinator and it's blocked by the mock (or just didn't run yet), 
    // equityPct should be undefined, but the object should exist because of potOddsPct.
    expect(snapshot.hero.calculations?.equityPct).toBeUndefined();
  });
});

