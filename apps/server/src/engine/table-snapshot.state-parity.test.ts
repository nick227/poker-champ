import { afterEach, describe, expect, it, vi } from "vitest";

import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

type FakeClient = {
  send: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
};

function makeClient(): FakeClient {
  return {
    send: vi.fn(),
    leave: vi.fn(),
  };
}

function makePlayer(input: {
  id: string;
  name: string;
  seat: number;
  status?: PlayerState["status"];
  stackCents?: number;
  roundBetCents?: number;
  committedCents?: number;
  connected?: boolean;
  needsAction?: boolean;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.name;
  p.seat = input.seat;
  p.status = input.status ?? "ACTIVE";
  p.stackCents = input.stackCents ?? 10_000;
  p.roundBetCents = input.roundBetCents ?? 0;
  p.committedCents = input.committedCents ?? 0;
  p.connected = input.connected ?? true;
  p.needsAction = input.needsAction ?? true;
  return p;
}

function makeState(maxSeats = 6): PokerState {
  const state = new PokerState();
  state.tableId = "table_snapshot_state_parity";
  state.tableName = "Snapshot State Parity";
  state.maxSeats = maxSeats;
  for (let i = 0; i < maxSeats; i += 1) state.seats.push("");
  return state;
}

async function emitSnapshotFor(dealer: Dealer, userId: string, reason: TableSnapshotPayload["reason"] = "ACTION_ACCEPTED") {
  const client = makeClient();
  dealer.bindClient(userId, client as any);
  await dealer.emitSnapshotToUser(userId, reason, `act_${Date.now()}`);
  const [type, payload] = client.send.mock.calls.at(-1) as ["TABLE_SNAPSHOT", TableSnapshotPayload];
  expect(type).toBe("TABLE_SNAPSHOT");
  dealer.unbindClient(userId, client as any);
  return payload;
}

function seatSnapshotFor(snapshot: TableSnapshotPayload, seat: number) {
  const result = snapshot.seats.find((entry) => entry.seat === seat);
  expect(result).toBeDefined();
  return result!;
}

// Known gap: handActionSeq is authoritative in runtime state but is not currently part of TableSnapshotPayload,
// so direct snapshot parity for turn sequencing cannot be asserted here until the realtime contract is extended.

describe("table snapshot state parity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("direct parity", () => {
    it("projects decision-critical hand and seat fields directly from runtime state", async () => {
      const state = makeState();
      state.handId = "hand_direct_parity";
      state.handNumber = 12;
      state.street = "TURN";
      state.dealerSeat = 1;
      state.sbSeat = 2;
      state.bbSeat = 0;
      state.toActSeat = 0;
      state.actionCount = 4;
      state.roundCurrentBetCents = 400;
      state.minRaiseCents = 200;
      state.potCents = 1_200;

      const hero = makePlayer({
        id: "u1",
        name: "Hero",
        seat: 0,
        stackCents: 2_400,
        roundBetCents: 200,
        committedCents: 600,
        status: "ACTIVE",
      });
      const villain = makePlayer({
        id: "u2",
        name: "Villain",
        seat: 1,
        stackCents: 3_300,
        roundBetCents: 400,
        committedCents: 700,
        status: "ACTIVE",
        needsAction: false,
      });

      state.playersById.set(hero.id, hero);
      state.playersById.set(villain.id, villain);
      state.seats[0] = hero.id;
      state.seats[1] = villain.id;

      const dealer = new Dealer(state);
      try {
        const snapshot = await emitSnapshotFor(dealer, hero.id);
        expect(snapshot.hand).toBeDefined();
        expect(snapshot.hand?.handId).toBe(state.handId);
        expect(snapshot.hand?.street).toBe(state.street);
        expect(snapshot.hand?.toActSeat).toBe(state.toActSeat);
        expect(snapshot.hand?.actionCount).toBe(state.actionCount);
        expect(snapshot.hand?.potCents).toBe(state.potCents);
        expect(snapshot.hand?.roundCurrentBetCents).toBe(state.roundCurrentBetCents);
        expect(snapshot.hand?.minRaiseCents).toBe(state.minRaiseCents);

        const heroSeat = seatSnapshotFor(snapshot, hero.seat);
        expect(heroSeat.stackCents).toBe(hero.stackCents);
        expect(heroSeat.roundBetCents).toBe(hero.roundBetCents);
        expect(heroSeat.committedCents).toBe(hero.committedCents);
        expect(heroSeat.status).toBe(hero.status);

        const villainSeat = seatSnapshotFor(snapshot, villain.seat);
        expect(villainSeat.stackCents).toBe(villain.stackCents);
        expect(villainSeat.roundBetCents).toBe(villain.roundBetCents);
        expect(villainSeat.committedCents).toBe(villain.committedCents);
        expect(villainSeat.status).toBe(villain.status);

        const toActSeats = snapshot.seats.filter((seat) => seat.isToAct);
        expect(toActSeats).toHaveLength(1);
        expect(toActSeats[0]?.seat).toBe(snapshot.hand?.toActSeat);
      } finally {
        dealer.dispose();
      }
    });
  });

  describe("semantic parity", () => {
    it("accepts CHECK when snapshot says canCheck", async () => {
      const state = makeState();
      state.handId = "hand_can_check";
      state.handNumber = 1;
      state.street = "FLOP";
      state.dealerSeat = 1;
      state.sbSeat = 0;
      state.bbSeat = 1;
      state.toActSeat = 0;
      state.roundCurrentBetCents = 200;
      state.minRaiseCents = 100;
      state.potCents = 500;

      const hero = makePlayer({
        id: "u1",
        name: "Hero",
        seat: 0,
        stackCents: 1_500,
        roundBetCents: 200,
        committedCents: 250,
      });
      const villain = makePlayer({
        id: "u2",
        name: "Villain",
        seat: 1,
        stackCents: 2_000,
        roundBetCents: 200,
        committedCents: 250,
        needsAction: false,
      });

      state.playersById.set(hero.id, hero);
      state.playersById.set(villain.id, villain);
      state.seats[0] = hero.id;
      state.seats[1] = villain.id;

      const dealer = new Dealer(state);
      try {
        const snapshot = await emitSnapshotFor(dealer, hero.id);
        expect(snapshot.hero.actionOptions?.canCheck).toBe(true);
        expect(snapshot.hero.actionOptions?.canCall).toBe(false);

        await expect(dealer.handleAction(hero.id, { action: "CHECK" }, `check_${Date.now()}`)).resolves.toBeUndefined();
      } finally {
        dealer.dispose();
      }
    });

    it("accepts CALL when snapshot says canCall", async () => {
      const state = makeState();
      state.handId = "hand_can_call";
      state.handNumber = 2;
      state.street = "TURN";
      state.dealerSeat = 1;
      state.sbSeat = 0;
      state.bbSeat = 1;
      state.toActSeat = 0;
      state.roundCurrentBetCents = 400;
      state.minRaiseCents = 200;
      state.potCents = 900;

      const hero = makePlayer({
        id: "u1",
        name: "Hero",
        seat: 0,
        stackCents: 1_400,
        roundBetCents: 200,
        committedCents: 300,
      });
      const villain = makePlayer({
        id: "u2",
        name: "Villain",
        seat: 1,
        stackCents: 2_100,
        roundBetCents: 400,
        committedCents: 600,
        needsAction: false,
      });

      state.playersById.set(hero.id, hero);
      state.playersById.set(villain.id, villain);
      state.seats[0] = hero.id;
      state.seats[1] = villain.id;

      const dealer = new Dealer(state);
      try {
        const snapshot = await emitSnapshotFor(dealer, hero.id);
        expect(snapshot.hero.actionOptions?.canCheck).toBe(false);
        expect(snapshot.hero.actionOptions?.canCall).toBe(true);

        await expect(dealer.handleAction(hero.id, { action: "CALL" }, `call_${Date.now()}`)).resolves.toBeUndefined();
      } finally {
        dealer.dispose();
      }
    });

    it("rejects CHECK and CALL when snapshot says neither is available", async () => {
      const state = makeState();
      state.handId = "hand_neither_check_nor_call";
      state.handNumber = 3;
      state.street = "RIVER";
      state.dealerSeat = 0;
      state.sbSeat = 0;
      state.bbSeat = 1;
      state.toActSeat = 1;
      state.roundCurrentBetCents = 500;
      state.minRaiseCents = 200;
      state.potCents = 1_700;

      const hero = makePlayer({
        id: "u1",
        name: "Hero",
        seat: 0,
        stackCents: 1_200,
        roundBetCents: 500,
        committedCents: 900,
        needsAction: false,
      });
      const villain = makePlayer({
        id: "u2",
        name: "Villain",
        seat: 1,
        stackCents: 1_600,
        roundBetCents: 500,
        committedCents: 900,
      });

      state.playersById.set(hero.id, hero);
      state.playersById.set(villain.id, villain);
      state.seats[0] = hero.id;
      state.seats[1] = villain.id;

      const dealer = new Dealer(state);
      try {
        const snapshot = await emitSnapshotFor(dealer, hero.id);
        expect(snapshot.hero.actionOptions).toBeUndefined();

        await expect(dealer.handleAction(hero.id, { action: "CHECK" }, `reject_check_${Date.now()}`)).rejects.toThrow();
        await expect(dealer.handleAction(hero.id, { action: "CALL" }, `reject_call_${Date.now()}`)).rejects.toThrow();
      } finally {
        dealer.dispose();
      }
    });
  });

  describe("boundary parity", () => {
    it("keeps lastHandResult tied to the hand that just ended while table is waiting", async () => {
      const state = makeState();
      state.street = "WAITING";

      const hero = makePlayer({
        id: "u1",
        name: "Hero",
        seat: 0,
        stackCents: 5_300,
        needsAction: false,
      });
      state.playersById.set(hero.id, hero);
      state.seats[0] = hero.id;

      const dealer = new Dealer(state);
      try {
        (dealer as any).lastHandResult = {
          handId: "hand_finished_prev",
          reason: "SHOWDOWN",
          potCents: 300,
          winnerId: hero.id,
          payoutsByUserId: { [hero.id]: 300 },
          board: ["Ah", "Kd", "9c", "3s", "2d"],
        };

        const snapshot = await emitSnapshotFor(dealer, hero.id, "AUTO_TRANSITION");
        expect(snapshot.hand).toBeUndefined();
        expect(snapshot.lastHandResult?.handId).toBe("hand_finished_prev");
      } finally {
        dealer.dispose();
      }
    });

    it("clears previous lastHandResult once the next hand starts", async () => {
      const state = makeState(2);
      state.street = "WAITING";
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.minBuyInCents = 2_000;
      state.maxBuyInCents = 20_000;

      const hero = makePlayer({ id: "u1", name: "Hero", seat: 0, stackCents: 5_000, needsAction: false });
      const villain = makePlayer({ id: "u2", name: "Villain", seat: 1, stackCents: 5_000, needsAction: false });
      state.playersById.set(hero.id, hero);
      state.playersById.set(villain.id, villain);
      state.seats[0] = hero.id;
      state.seats[1] = villain.id;

      const dealer = new Dealer(state);
      try {
        (dealer as any).lastHandResult = {
          handId: "hand_finished_prev",
          reason: "LAST_PLAYER",
          potCents: 300,
          winnerId: hero.id,
          payoutsByUserId: { [hero.id]: 300 },
        };

        // Intentionally minimal fixture: this test only cares that starting the next hand
        // clears the carried hand result, so follow-on drive warnings are expected here.
        // Full deck/showdown completeness is out of scope.
        await (dealer as any).startHand();
        const snapshot = await emitSnapshotFor(dealer, hero.id, "HAND_START");

        expect(snapshot.hand).toBeDefined();
        expect(snapshot.hand?.handId).not.toBe("hand_finished_prev");
        expect(snapshot.lastHandResult).toBeUndefined();
      } finally {
        dealer.dispose();
      }
    });
  });
});
