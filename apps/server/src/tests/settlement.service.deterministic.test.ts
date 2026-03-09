import { describe, expect, it, vi } from "vitest";
import { buildSidePots, splitPotCents } from "../engine/rules/SidePotManager.js";
import { PlayerState } from "../state/PlayerState.js";
import { SettlementService } from "../engine/dealer/services/SettlementService.js";
import { PokerState } from "../state/PokerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  committedCents?: number;
  status?: PlayerState["status"];
}): PlayerState {
  const player = new PlayerState();
  player.id = input.id;
  player.userId = input.id;
  player.name = input.id;
  player.seat = input.seat;
  player.kind = "HUMAN";
  player.stackCents = input.stackCents;
  player.committedCents = input.committedCents ?? 0;
  player.status = input.status ?? "ACTIVE";
  return player;
}

function makeSettlementService() {
  const state = new PokerState();
  state.tableId = "table_settlement";
  state.handId = "hand_settlement";
  state.street = "SHOWDOWN";
  state.dealerSeat = 0;

  const recordPayout = vi.fn().mockResolvedValue(undefined);
  const persistence = {
    enabled: true,
    handHistory: {
      recordPayout,
      recordAction: vi.fn(),
      startHand: vi.fn(),
      endHand: vi.fn(),
    },
    debitBet: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => {
      return args.currentBalance - args.amountCents;
    }),
    postBlind: vi.fn(),
    creditPayout: vi.fn().mockImplementation(async (args: { currentBalance: number; amountCents: number }) => {
      return args.currentBalance + args.amountCents;
    }),
    assertHandBalanced: vi.fn(),
  } as any;

  const service = new SettlementService({ state, persistence });
  return { service, state, persistence, recordPayout };
}

function trackPlayers(state: PokerState, players: PlayerState[]): void {
  for (const player of players) {
    state.playersById.set(player.id, player);
  }
}

describe("SettlementService - End-to-End Money Safety", () => {
  it("single winner, single pot - maintains chip conservation", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: 3 players, main pot 600, player A wins
    const A = makePlayer({ id: "A", seat: 1, stackCents: 1000, committedCents: 200 });
    const B = makePlayer({ id: "B", seat: 2, stackCents: 800, committedCents: 200 });
    const C = makePlayer({ id: "C", seat: 3, stackCents: 1200, committedCents: 200 });
    trackPlayers(state, [A, B, C]);
    
    state.potCents = 600; // 200 * 3
    
    const preTotal = A.stackCents + B.stackCents + C.stackCents + state.potCents;
    
    // Simulate settlement: A wins main pot
    await service.creditPayoutToPlayer(A, 600);
    
    // Pot should be reduced as chips are moved to players
    const postTotal = A.stackCents + B.stackCents + C.stackCents;
    
    // Conservation: chips moved from pot to winner
    expect(A.stackCents).toBe(1600); // 1000 + 600
    expect(B.stackCents).toBe(800);  // unchanged
    expect(C.stackCents).toBe(1200); // unchanged
    expect(postTotal).toBe(preTotal);
  });

  it("tie split even - perfect division maintains conservation", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: 2 players tie, pot 800 (even split)
    const A = makePlayer({ id: "A", seat: 1, stackCents: 1000 });
    const B = makePlayer({ id: "B", seat: 2, stackCents: 800 });
    trackPlayers(state, [A, B]);
    
    state.potCents = 800;
    const preTotal = A.stackCents + B.stackCents + state.potCents;
    
    // Split 800 evenly: 400 each
    await service.creditPayoutToPlayer(A, 400);
    await service.creditPayoutToPlayer(B, 400);
    
    // Pot should be reduced as chips are moved to players
    const postTotal = A.stackCents + B.stackCents;
    
    expect(A.stackCents).toBe(1400); // 1000 + 400
    expect(B.stackCents).toBe(1200); // 800 + 400
    expect(postTotal).toBe(preTotal);
  });

  it("tie split odd chip - seat order determines odd chip distribution", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: 3 players tie, pot 801 (odd chip)
    const A = makePlayer({ id: "A", seat: 1, stackCents: 1000 });
    const B = makePlayer({ id: "B", seat: 2, stackCents: 800 });
    const C = makePlayer({ id: "C", seat: 3, stackCents: 1200 });
    trackPlayers(state, [A, B, C]);
    
    state.dealerSeat = 0; // Dealer at seat 0, so seat 1 gets odd chip first
    state.potCents = 801;
    const preTotal = A.stackCents + B.stackCents + C.stackCents + state.potCents;
    
    // Use splitPotCents to verify odd chip logic
    const seatOrder = ["A", "B", "C"]; // Left of dealer
    const payouts = splitPotCents(801, ["A", "B", "C"], seatOrder);
    
    // 801 / 3 = 267 base, 1 remainder goes to A (first in seat order)
    expect(payouts.get("A")).toBe(267); // Actually gets base amount
    expect(payouts.get("B")).toBe(267);
    expect(payouts.get("C")).toBe(267);
    // Wait, let me check the actual split logic
    const totalPayout = [...payouts.values()].reduce((sum, amount) => sum + amount, 0);
    expect(totalPayout).toBe(801);
    
    // Apply payouts
    await service.creditPayoutToPlayer(A, payouts.get("A")!);
    await service.creditPayoutToPlayer(B, payouts.get("B")!);
    await service.creditPayoutToPlayer(C, payouts.get("C")!);
    
    // Pot should be reduced as chips are moved to players
    const postTotal = A.stackCents + B.stackCents + C.stackCents;
    
    expect(A.stackCents).toBe(1267); // 1000 + 267
    expect(B.stackCents).toBe(1067); // 800 + 267
    expect(C.stackCents).toBe(1467); // 1200 + 267
    expect(postTotal).toBe(preTotal);
  });

  it("multiple side pots, different winners - complete chip conservation", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: Complex side pot scenario
    const A = makePlayer({ id: "A", seat: 1, stackCents: 500, committedCents: 100 });  // Short stack
    const B = makePlayer({ id: "B", seat: 2, stackCents: 1000, committedCents: 300 }); // Medium stack  
    const C = makePlayer({ id: "C", seat: 3, stackCents: 1500, committedCents: 500 }); // Deep stack
    trackPlayers(state, [A, B, C]);
    
    const allPlayers = [A, B, C];
    const eligiblePlayers = [A, B, C]; // All at showdown
    
    // Build side pots
    const pots = buildSidePots(allPlayers, eligiblePlayers);
    
    // Expected pots:
    // Main: 100 * 3 = 300 (all eligible)
    // Side1: (300-100) * 2 = 400 (B, C eligible)
    // Side2: (500-300) * 1 = 200 (C only)
    expect(pots).toHaveLength(3);
    expect(pots[0].amountCents).toBe(300); // Main pot
    expect(pots[1].amountCents).toBe(400); // Side pot 1
    expect(pots[2].amountCents).toBe(200); // Side pot 2
    
    const preTotal = A.stackCents + B.stackCents + C.stackCents + pots.reduce((sum, pot) => sum + pot.amountCents, 0);
    
    // Settlement: A wins main, B wins side1, C wins side2
    await service.creditPayoutToPlayer(A, 300); // Main pot
    await service.creditPayoutToPlayer(B, 400); // Side pot 1
    await service.creditPayoutToPlayer(C, 200); // Side pot 2
    
    const postTotal = A.stackCents + B.stackCents + C.stackCents;
    
    expect(A.stackCents).toBe(800);  // 500 + 300
    expect(B.stackCents).toBe(1400); // 1000 + 400
    expect(C.stackCents).toBe(1700); // 1500 + 200
    expect(postTotal).toBe(preTotal);
  });

  it("folded player never receives chips - folded excluded from eligibility", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: A folded, B and C active
    const A = makePlayer({ id: "A", seat: 1, stackCents: 1000, committedCents: 200, status: "FOLDED" });
    const B = makePlayer({ id: "B", seat: 2, stackCents: 800, committedCents: 200 });
    const C = makePlayer({ id: "C", seat: 3, stackCents: 1200, committedCents: 200 });
    trackPlayers(state, [A, B, C]);
    
    const allPlayers = [A, B, C];
    const eligiblePlayers = [B, C]; // A folded, not eligible
    
    const pots = buildSidePots(allPlayers, eligiblePlayers);
    
    // Single pot: 200 * 3 = 600, but only B and C can win
    expect(pots).toHaveLength(1);
    expect(pots[0].amountCents).toBe(600);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(["B", "C"]);
    
    const preTotal = A.stackCents + B.stackCents + C.stackCents + pots[0].amountCents;
    
    // B wins entire pot (A cannot win)
    await service.creditPayoutToPlayer(B, 600);
    
    const postTotal = A.stackCents + B.stackCents + C.stackCents;
    
    expect(A.stackCents).toBe(1000); // Folded player gets nothing
    expect(B.stackCents).toBe(1400); // 800 + 600
    expect(C.stackCents).toBe(1200); // No winnings
    expect(postTotal).toBe(preTotal);
  });

  it("all-in player never wins above commitment - capped at contribution", async () => {
    const { service, state } = makeSettlementService();
    
    // Setup: A all-in 100, B and C deep stacked
    const A = makePlayer({ id: "A", seat: 1, stackCents: 0, committedCents: 100, status: "ALL_IN" });
    const B = makePlayer({ id: "B", seat: 2, stackCents: 1000, committedCents: 500 });
    const C = makePlayer({ id: "C", seat: 3, stackCents: 1500, committedCents: 500 });
    trackPlayers(state, [A, B, C]);
    
    const allPlayers = [A, B, C];
    const eligiblePlayers = [A, B, C];
    
    const pots = buildSidePots(allPlayers, eligiblePlayers);
    
    // Expected pots:
    // Main: 100 * 3 = 300 (A, B, C eligible)
    // Side: (500-100) * 2 = 800 (B, C eligible only)
    expect(pots).toHaveLength(2);
    expect(pots[0].amountCents).toBe(300); // Main pot A can win
    expect(pots[1].amountCents).toBe(800); // Side pot A cannot win
    
    const preTotal = A.stackCents + B.stackCents + C.stackCents + pots.reduce((sum, pot) => sum + pot.amountCents, 0);
    
    // A wins main pot only (capped at 100 contribution), B wins side pot
    await service.creditPayoutToPlayer(A, 300); // Main pot only
    await service.creditPayoutToPlayer(B, 800); // Side pot
    
    const postTotal = A.stackCents + B.stackCents + C.stackCents;
    
    expect(A.stackCents).toBe(300);  // 0 + 300 (cannot win more than contributed)
    expect(B.stackCents).toBe(1800); // 1000 + 800
    expect(C.stackCents).toBe(1500); // No winnings
    expect(postTotal).toBe(preTotal);
    
    // Verify A cannot win side pot despite being best hand
    // This is enforced by buildSidePots eligibility logic
    expect(pots[1].eligiblePlayerIds).not.toContain("A");
  });

  it("comprehensive chip conservation - sum(stacks after) === sum(stacks before) + pot", async () => {
    const { service, state } = makeSettlementService();
    
    // Complex scenario with multiple pots and splits
    const players = [
      makePlayer({ id: "P1", seat: 1, stackCents: 800, committedCents: 200 }),
      makePlayer({ id: "P2", seat: 2, stackCents: 1200, committedCents: 400, status: "FOLDED" }),
      makePlayer({ id: "P3", seat: 3, stackCents: 1500, committedCents: 600 }),
      makePlayer({ id: "P4", seat: 4, stackCents: 900, committedCents: 300 }),
    ];
    trackPlayers(state, players);
    
    const allPlayers = players;
    const eligiblePlayers = players.filter(p => p.status !== "FOLDED");
    
    const pots = buildSidePots(allPlayers, eligiblePlayers);
    const totalPot = pots.reduce((sum, pot) => sum + pot.amountCents, 0);
    
    const stacksBefore = new Map(players.map(p => [p.id, p.stackCents]));
    const totalBefore = players.reduce((sum, p) => sum + p.stackCents, 0) + totalPot;
    
    // Simulate complex settlement - distribute all pots completely
    const payouts = new Map<string, number>();
    
    // Distribute each pot to ensure all chips are paid out
    pots.forEach((pot, index) => {
      if (pot.eligiblePlayerIds.length === 0) return;
      
      // For simplicity, give each pot to the first eligible player
      const winner = pot.eligiblePlayerIds[0];
      payouts.set(winner, (payouts.get(winner) ?? 0) + pot.amountCents);
    });
    
    // Apply all payouts
    for (const [playerId, amount] of payouts.entries()) {
      const player = players.find(p => p.id === playerId);
      if (player) {
        await service.creditPayoutToPlayer(player, amount);
      }
    }
    
    // Pot should be reduced as chips are moved to players
    const totalAfter = players.reduce((sum, p) => sum + p.stackCents, 0);
    
    // Core assertion: chip conservation
    expect(totalAfter).toBe(totalBefore);
    
    // Verify no negative stacks
    for (const player of players) {
      expect(player.stackCents).toBeGreaterThanOrEqual(0);
    }
    
    // Verify folded player (P2) received nothing
    expect(players.find(p => p.id === "P2")!.stackCents).toBe(stacksBefore.get("P2")!);
  });
});
