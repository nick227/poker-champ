import { describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
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
  return p;
}

describe("table snapshot contract emission", () => {
  it("emits snapshot with optional hand when table is waiting", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_1";
    state.tableName = "Snapshot Table";
    state.street = "WAITING";

    const dealer = new Dealer(state);
    const client = makeClient();
    dealer.bindClient("spectator_1", client as any);

    dealer.emitSnapshotToUser("spectator_1", "JOIN");

    expect(client.send).toHaveBeenCalledTimes(1);
    const [type, payload] = client.send.mock.calls[0] as ["TABLE_SNAPSHOT", any];
    expect(type).toBe("TABLE_SNAPSHOT");
    expect(payload.version).toBe(1);
    expect(payload.hand).toBeUndefined();
    expect(payload.hero.youAreSeated).toBe(false);
    expect(payload.hero.actionOptions).toBeUndefined();
    expect(typeof payload.stateHash).toBe("string");
    expect(payload.stateHash.length).toBeGreaterThan(0);
  });

  it("emits seated hero snapshot with action options derived from server state", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_2";
    state.tableName = "Snapshot Table 2";
    state.maxSeats = 6;
    state.handId = "hand_abc";
    state.handNumber = 3;
    state.street = "PREFLOP";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.potCents = 300;

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 2_000,
      roundBetCents: 100,
      committedCents: 100,
    });
    const villain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 2_500,
      roundBetCents: 200,
      committedCents: 200,
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_123");

    expect(client.send).toHaveBeenCalledTimes(1);
    const [type, payload] = client.send.mock.calls[0] as ["TABLE_SNAPSHOT", any];
    expect(type).toBe("TABLE_SNAPSHOT");

    expect(payload.hand.handId).toBe("hand_abc");
    expect(payload.hand.handNumber).toBe(3);
    expect(payload.hand.street).toBe("PREFLOP");
    expect(payload.hero.youAreSeated).toBe(true);
    expect(payload.hero.seat).toBe(0);
    expect(payload.hero.actionOptions).toBeDefined();
    expect(payload.hero.actionOptions!.callAmount).toBe(100);
    expect(payload.hero.actionOptions!.canCheck).toBe(false);
    expect(payload.hero.actionOptions!.canCall).toBe(true);
    expect(payload.hero.actionOptions!.canBet).toBe(false);
    expect(payload.hero.actionOptions!.canRaise).toBe(true);
    expect(payload.hero.actionOptions!.canAllIn).toBe(true);
    expect(payload.hero.actionOptions!.minRaiseTo).toBe(300);
    expect(payload.hero.actionOptions!.maxRaiseTo).toBe(2100);
  });

  it("marks actions unavailable when hero is not to act", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_3";
    state.tableName = "Snapshot Table 3";
    state.maxSeats = 6;
    state.handId = "hand_xyz";
    state.handNumber = 1;
    state.street = "TURN";
    state.dealerSeat = 0;
    state.toActSeat = 1;
    state.roundCurrentBetCents = 400;
    state.minRaiseCents = 200;
    state.potCents = 1200;

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 5_000,
      roundBetCents: 400,
      committedCents: 900,
    });
    const villain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 5_500,
      roundBetCents: 400,
      committedCents: 900,
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    dealer.emitSnapshotToUser(hero.id, "AUTO_TRANSITION");

    const payload = client.send.mock.calls[0][1] as any;
    expect(payload.hero.actionOptions!.canFold).toBe(false);
    expect(payload.hero.actionOptions!.canCheck).toBe(false);
    expect(payload.hero.actionOptions!.canCall).toBe(false);
    expect(payload.hero.actionOptions!.canBet).toBe(false);
    expect(payload.hero.actionOptions!.canRaise).toBe(false);
    expect(payload.hero.actionOptions!.canAllIn).toBe(false);
    expect(payload.hero.actionOptions!.callAmount).toBe(0);
  });

  it("emits min and max wager bounds when hero can open-bet", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_4";
    state.tableName = "Snapshot Table 4";
    state.maxSeats = 6;
    state.handId = "hand_bet_bounds";
    state.handNumber = 7;
    state.street = "FLOP";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 200;
    state.bigBlindCents = 200;
    state.potCents = 800;

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 150,
      roundBetCents: 0,
      committedCents: 200,
    });
    const villain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 2_000,
      roundBetCents: 0,
      committedCents: 200,
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_bet_bounds");

    const payload = client.send.mock.calls[0][1] as any;
    expect(payload.hero.actionOptions!.canBet).toBe(true);
    expect(payload.hero.actionOptions!.canRaise).toBe(false);
    expect(payload.hero.actionOptions!.callAmount).toBe(0);
    expect(payload.hero.actionOptions!.minRaiseTo).toBe(150);
    expect(payload.hero.actionOptions!.maxRaiseTo).toBe(150);
  });
});
