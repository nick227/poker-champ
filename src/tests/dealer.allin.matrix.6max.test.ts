import { describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { ActionOptionsService } from "../engine/dealer/services/ActionOptionsService.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

type ScenarioPlayer = {
  id: string;
  seat: number;
  stackCents: number;
  committedCents: number;
  status: PlayerState["status"];
  cards?: [string, string];
};

function makePlayer(input: {
  id: string;
  seat: number;
  stackCents: number;
  status?: PlayerState["status"];
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = input.status ?? "ACTIVE";
  p.stackCents = input.stackCents;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = false;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

function baseState(tableId: string): PokerState {
  const state = new PokerState();
  state.tableId = tableId;
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.minBuyInCents = 200;
  state.maxBuyInCents = 200000;
  state.street = "WAITING";
  state.seats.push("", "", "", "", "", "");
  return state;
}

async function runShowdownMatrixScenario(input: {
  name: string;
  players: ScenarioPlayer[];
  board: [string, string, string, string, string];
  expectedPayoutByUserId: Record<string, number>;
}) {
  const state = baseState(`table_${input.name}`);
  state.street = "SHOWDOWN";
  state.handId = `hand_${input.name}`;
  state.handNumber = 1;
  state.dealerSeat = 0;
  state.sbSeat = 1;
  state.bbSeat = 2;
  state.toActSeat = 0;
  state.board.push(...input.board);

  let potCents = 0;
  for (const sp of input.players) {
    const player = makePlayer({
      id: sp.id,
      seat: sp.seat,
      stackCents: sp.stackCents,
      status: sp.status,
    });
    player.committedCents = sp.committedCents;
    player.roundBetCents = sp.committedCents;
    state.playersById.set(sp.id, player);
    state.seats[sp.seat] = sp.id;
    potCents += sp.committedCents;
  }
  state.potCents = potCents;

  const paidByUserId = new Map<string, number>();
  const persistence = {
    enabled: false,
    handHistory: null,
    postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
    debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
    creditPayout: async (args: { userId: string; currentBalance: number; amountCents: number }) => {
      paidByUserId.set(args.userId, (paidByUserId.get(args.userId) ?? 0) + args.amountCents);
      return args.currentBalance + args.amountCents;
    },
    assertHandBalanced: async () => {},
  } as any;

  const dealer = new Dealer(state, persistence);
  (dealer as any).scheduleNextHand = () => {};
  const holeCardsByPlayerId = (dealer as any).holeCardsByPlayerId as Map<string, string[]>;
  for (const sp of input.players) {
    if (sp.cards) holeCardsByPlayerId.set(sp.id, [sp.cards[0], sp.cards[1]]);
  }

  await (dealer as any).finishHandShowdownWithSidePots();
  const handResult = (dealer as any).lastHandResult as
    | { reason: "SHOWDOWN" | "LAST_PLAYER"; payoutsByUserId: Record<string, number> }
    | undefined;

  expect(handResult?.reason).toBe("SHOWDOWN");
  expect(handResult?.payoutsByUserId).toEqual(input.expectedPayoutByUserId);
  expect(Object.fromEntries(paidByUserId)).toEqual(input.expectedPayoutByUserId);
}

describe("dealer all-in matrix 6-max", () => {
  it("2-way all-in", async () => {
    await runShowdownMatrixScenario({
      name: "2way_allin",
      players: [
        { id: "u1", seat: 0, stackCents: 0, committedCents: 1000, status: "ALL_IN", cards: ["Ac", "Kc"] },
        { id: "u2", seat: 1, stackCents: 0, committedCents: 1000, status: "ALL_IN", cards: ["9h", "9s"] },
      ],
      board: ["Th", "Jd", "Qs", "2c", "3d"],
      expectedPayoutByUserId: { u1: 2000 },
    });
  });

  it("3-way all-in with one side pot", async () => {
    await runShowdownMatrixScenario({
      name: "3way_allin",
      players: [
        { id: "u1", seat: 0, stackCents: 0, committedCents: 300, status: "ALL_IN", cards: ["Ac", "Kc"] },
        { id: "u2", seat: 1, stackCents: 0, committedCents: 700, status: "ALL_IN", cards: ["9h", "9s"] },
        { id: "u3", seat: 2, stackCents: 0, committedCents: 700, status: "ALL_IN", cards: ["Qh", "8h"] },
      ],
      board: ["Th", "Jd", "Qs", "2c", "3d"],
      expectedPayoutByUserId: { u1: 900, u3: 800 },
    });
  });

  it("2 all-ins plus deep caller with multiple side pots", async () => {
    await runShowdownMatrixScenario({
      name: "2_allins_plus_caller",
      players: [
        { id: "u1", seat: 0, stackCents: 0, committedCents: 500, status: "ALL_IN", cards: ["Ac", "Kc"] },
        { id: "u2", seat: 1, stackCents: 0, committedCents: 1200, status: "ALL_IN", cards: ["9h", "9s"] },
        { id: "u3", seat: 2, stackCents: 0, committedCents: 2000, status: "ACTIVE", cards: ["Qh", "8h"] },
      ],
      board: ["Th", "Jd", "Qs", "2c", "3d"],
      expectedPayoutByUserId: { u1: 1500, u3: 2200 },
    });
  });

  it("folded contributors are excluded from winning eligibility", async () => {
    await runShowdownMatrixScenario({
      name: "folded_excluded",
      players: [
        { id: "u1", seat: 0, stackCents: 0, committedCents: 200, status: "ALL_IN", cards: ["Ac", "Kc"] },
        { id: "u2", seat: 1, stackCents: 0, committedCents: 500, status: "ALL_IN", cards: ["9h", "9s"] },
        { id: "u3", seat: 2, stackCents: 0, committedCents: 1000, status: "ACTIVE", cards: ["Qh", "8h"] },
        { id: "u4", seat: 3, stackCents: 0, committedCents: 1000, status: "FOLDED" },
      ],
      board: ["Th", "Jd", "Qs", "2c", "3d"],
      expectedPayoutByUserId: { u1: 800, u3: 1900 },
    });
  });

  it("keeps toActSeat on ACTIVE players while multiple all-ins occur", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    );
    try {
      const state = baseState("table_toact_active_invariant");
      for (let i = 0; i < 6; i++) {
        const id = `u${i + 1}`;
        state.playersById.set(id, makePlayer({ id, seat: i, stackCents: 1200 + i * 200 }));
        state.seats[i] = id;
      }

      const persistence = {
        enabled: false,
        handHistory: null,
        postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
        creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
        assertHandBalanced: async () => {},
      } as any;

      const dealer = new Dealer(state, persistence);
      (dealer as any).scheduleNextHand = () => {};
      const optionsService = new ActionOptionsService();
      await (dealer as any).startHand();

      let guard = 0;
      let allInCount = 0;
      while (state.street !== "WAITING" && guard < 500) {
        guard += 1;
        const toActId = state.seats[state.toActSeat];
        expect(toActId, "missing toAct seat id").toBeTruthy();
        const toActPlayer = toActId ? state.playersById.get(toActId) : undefined;
        expect(toActPlayer?.status).toBe("ACTIVE");

        const options = toActId ? optionsService.buildHeroActionOptions(state, toActId) : undefined;
        expect(options).toBeTruthy();
        if (!toActId || !options) break;

        if (options.canAllIn && allInCount < 3) {
          await dealer.handleAction(toActId, { action: "ALL_IN" });
          allInCount += 1;
        } else if (options.canCall) {
          await dealer.handleAction(toActId, { action: "CALL" });
        } else if (options.canCheck) {
          await dealer.handleAction(toActId, { action: "CHECK" });
        } else if (options.canFold) {
          await dealer.handleAction(toActId, { action: "FOLD" });
        } else if (options.canAllIn) {
          await dealer.handleAction(toActId, { action: "ALL_IN" });
          allInCount += 1;
        } else {
          throw new Error(`No legal action for toAct=${toActId}`);
        }
      }

      expect(guard).toBeLessThan(500);
      expect(allInCount).toBeGreaterThanOrEqual(2);
      expect(state.street).toBe("WAITING");
    } finally {
      setTimeoutSpy.mockRestore();
    }
  }, 120_000);
});
