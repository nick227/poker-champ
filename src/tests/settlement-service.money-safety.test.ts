import { describe, expect, it, vi } from "vitest";
import { SettlementService } from "../engine/dealer/services/SettlementService.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  roundBetCents?: number;
  committedCents?: number;
  status?: PlayerState["status"];
  needsAction?: boolean;
}): PlayerState {
  const player = new PlayerState();
  player.id = input.id;
  player.userId = input.id;
  player.name = input.id;
  player.seat = input.seat;
  player.kind = "HUMAN";
  player.stackCents = input.stackCents;
  player.roundBetCents = input.roundBetCents ?? 0;
  player.committedCents = input.committedCents ?? 0;
  player.status = input.status ?? "ACTIVE";
  player.needsAction = input.needsAction ?? true;
  return player;
}

function makeService() {
  const state = new PokerState();
  state.tableId = "table_settlement";
  state.handId = "hand_settlement";
  state.street = "TURN";

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

describe("SettlementService money safety", () => {
  it("applies debit without creating or destroying chips", async () => {
    const { service, state } = makeService();
    const player = makePlayer({
      id: "u1",
      seat: 0,
      stackCents: 1000,
      roundBetCents: 100,
      committedCents: 100,
    });
    state.potCents = 400;

    const preTotal = player.stackCents + state.potCents;

    await service.applyActionDebit(player, 250, "CALL");

    expect(player.stackCents).toBe(750);
    expect(player.roundBetCents).toBe(350);
    expect(player.committedCents).toBe(350);
    expect(state.potCents).toBe(650);
    expect(state.actionCount).toBe(1);

    const postTotal = player.stackCents + state.potCents;
    expect(postTotal).toBe(preTotal);
  });

  it("marks player ALL_IN and clears needsAction when debit reaches zero", async () => {
    const { service, state } = makeService();
    const player = makePlayer({ id: "u1", seat: 0, stackCents: 300, needsAction: true });
    state.potCents = 100;

    await service.applyActionDebit(player, 300, "ALL_IN");

    expect(player.stackCents).toBe(0);
    expect(player.status).toBe("ALL_IN");
    expect(player.needsAction).toBe(false);
    expect(state.potCents).toBe(400);
  });

  it("rejects unaffordable debits", () => {
    const { service } = makeService();
    const player = makePlayer({ id: "u1", seat: 0, stackCents: 99 });

    expect(() => service.assertCanAfford(player, 100)).toThrow("Insufficient stack");
  });

  it("credits payouts exactly as distributed with no phantom payout chips", async () => {
    const { service, persistence, recordPayout } = makeService();
    const a = makePlayer({ id: "A", seat: 0, stackCents: 1200 });
    const b = makePlayer({ id: "B", seat: 1, stackCents: 800 });

    const payouts = new Map<string, number>([
      ["A", 350],
      ["B", 250],
    ]);

    const preStacks = new Map<string, number>([
      ["A", a.stackCents],
      ["B", b.stackCents],
    ]);

    await service.creditPayoutToPlayer(a, payouts.get("A") ?? 0);
    await service.creditPayoutToPlayer(b, payouts.get("B") ?? 0);

    const actualDeltaA = a.stackCents - (preStacks.get("A") ?? 0);
    const actualDeltaB = b.stackCents - (preStacks.get("B") ?? 0);
    const plannedTotal = [...payouts.values()].reduce((sum, amount) => sum + amount, 0);
    const actualTotal = actualDeltaA + actualDeltaB;

    expect(actualDeltaA).toBe(350);
    expect(actualDeltaB).toBe(250);
    expect(actualTotal).toBe(plannedTotal);

    expect(recordPayout).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ playerId: "A", payoutIndex: 1, amountCents: 350 }),
    );
    expect(recordPayout).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ playerId: "B", payoutIndex: 2, amountCents: 250 }),
    );

    expect(persistence.creditPayout).toHaveBeenCalledTimes(2);
  });
});
