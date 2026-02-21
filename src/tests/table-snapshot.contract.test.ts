import { describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { CashierService } from "../engine/economy/CashierService.js";
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
    expect(payload.hero.calculations).toBeUndefined();
    expect(payload.calculationsMeta).toBeUndefined();
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
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["As", "Ad"]);
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["Kh", "Kd"]);

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
    expect(payload.hero.actionOptions!.primaryWagerAction).toBe("RAISE");
    expect(payload.hero.actionOptions!.canAllIn).toBe(true);
    expect(payload.hero.actionOptions!.minRaiseTo).toBe(300);
    expect(payload.hero.actionOptions!.maxRaiseTo).toBe(2100);
    expect(payload.hero.calculations).toBeDefined();
    expect(payload.hero.calculations!.equityPct).toBeTypeOf("number");
    expect(payload.hero.calculations!.equityPct).toBeGreaterThanOrEqual(0);
    expect(payload.hero.calculations!.equityPct).toBeLessThanOrEqual(100);
    expect(payload.hero.calculations!.potOddsPct).toBe(25);
    expect(payload.hero.calculations!.outs).toBeUndefined();
    expect(payload.hero.calculations!.updatedAtTs).toBeGreaterThan(0);
    expect(payload.calculationsMeta).toBeDefined();
    expect(payload.calculationsMeta!.street).toBe("PREFLOP");
    expect(payload.calculationsMeta!.playersConsidered).toBe(2);
    expect(typeof payload.calculationsMeta!.stateHash).toBe("string");
    expect(payload.calculationsMeta!.stateHash.length).toBeGreaterThan(0);
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
    expect(payload.hero.actionOptions!.primaryWagerAction).toBe("NONE");
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
    expect(payload.hero.actionOptions!.primaryWagerAction).toBe("BET");
    expect(payload.hero.actionOptions!.callAmount).toBe(0);
    expect(payload.hero.actionOptions!.minRaiseTo).toBe(150);
    expect(payload.hero.actionOptions!.maxRaiseTo).toBe(150);
    expect(payload.hero.calculations!.potOddsPct).toBeUndefined();
  });

  it("updates calculations meta hash and pot odds after state change", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_5";
    state.tableName = "Snapshot Table 5";
    state.maxSeats = 6;
    state.handId = "hand_state_hash_shift";
    state.handNumber = 9;
    state.street = "TURN";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.potCents = 400;

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 3_000,
      roundBetCents: 100,
      committedCents: 500,
    });
    const villain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 3_000,
      roundBetCents: 200,
      committedCents: 600,
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["As", "Qh"]);
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["Kc", "Kd"]);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_before_change");
    const before = client.send.mock.calls[0][1] as any;
    expect(before.hero.calculations!.potOddsPct).toBe(20);

    state.roundCurrentBetCents = 300;
    state.potCents = 500;

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_after_change");
    const after = client.send.mock.calls[1][1] as any;

    expect(after.hero.calculations!.potOddsPct).toBe(29);
    expect(after.calculationsMeta!.stateHash).not.toBe(before.calculationsMeta!.stateHash);
  });

  it("sets equity to 100 when hero has no eligible opponents", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_6";
    state.tableName = "Snapshot Table 6";
    state.maxSeats = 6;
    state.handId = "hand_single_player_equity";
    state.handNumber = 10;
    state.street = "FLOP";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 300;

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 2_000,
      roundBetCents: 50,
      committedCents: 150,
      status: "ACTIVE",
    });
    const foldedVillain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 2_000,
      roundBetCents: 100,
      committedCents: 150,
      status: "FOLDED",
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(foldedVillain.id, foldedVillain);
    state.seats[0] = hero.id;
    state.seats[1] = foldedVillain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["Ac", "Ks"]);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_single_player");

    const payload = client.send.mock.calls[0][1] as any;
    expect(payload.hero.calculations!.equityPct).toBe(100);
  });

  it("emits lastAction with monotonic seq for accepted actions", async () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_last_action_seq";
    state.tableName = "Snapshot Last Action Seq";
    state.maxSeats = 6;
    state.handId = "hand_last_action_seq";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 0;
    state.minRaiseCents = 100;
    state.bigBlindCents = 100;
    state.potCents = 0;

    const dealer = new Dealer(state, {
      enabled: false,
      handHistory: null,
      ledger: null,
    } as any);
    const p1 = makePlayer({ id: "u1", name: "Hero", seat: 0, stackCents: 2_000 });
    const p2 = makePlayer({ id: "u2", name: "Villain", seat: 1, stackCents: 2_000 });
    const p3 = makePlayer({ id: "u3", name: "Villain2", seat: 2, stackCents: 2_000 });
    p1.needsAction = true;
    p2.needsAction = true;
    p3.needsAction = true;
    state.playersById.set(p1.id, p1);
    state.playersById.set(p2.id, p2);
    state.playersById.set(p3.id, p3);
    state.seats[0] = p1.id;
    state.seats[1] = p2.id;
    state.seats[2] = p3.id;

    const c1 = makeClient();
    const c2 = makeClient();
    dealer.bindClient(p1.id, c1 as any);
    dealer.bindClient(p2.id, c2 as any);

    await dealer.handleAction("u1", { action: "CHECK" });
    const first = c1.send.mock.calls.at(-1)?.[1] as any;
    expect(first.lastAction).toBeDefined();
    expect(first.lastAction.seq).toBe(1);
    expect(first.lastAction.origin).toBe("PLAYER");
    expect(first.lastAction.action).toBe("CHECK");
    expect(first.lastAction.actorUserId).toBe("u1");

    await dealer.handleAction("u2", { action: "CHECK" });
    const second = c1.send.mock.calls.at(-1)?.[1] as any;
    expect(second.lastAction).toBeDefined();
    expect(second.lastAction.seq).toBe(2);
    expect(second.lastAction.origin).toBe("PLAYER");
    expect(second.lastAction.action).toBe("CHECK");
    expect(second.lastAction.actorUserId).toBe("u2");
  });

  it("omits calculations for folded hero", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_9";
    state.tableName = "Snapshot Table 9";
    state.maxSeats = 6;
    state.handId = "hand_folded_no_calc";
    state.handNumber = 13;
    state.street = "RIVER";
    state.dealerSeat = 1;
    state.toActSeat = 1;
    state.roundCurrentBetCents = 300;
    state.minRaiseCents = 100;
    state.potCents = 900;
    state.board.push("Ah", "Kh", "2c", "3d", "9s");

    const dealer = new Dealer(state);
    const hero = makePlayer({
      id: "u1",
      name: "Hero",
      seat: 0,
      stackCents: 2500,
      roundBetCents: 300,
      committedCents: 300,
      status: "FOLDED",
    });
    const villain = makePlayer({
      id: "u2",
      name: "Villain",
      seat: 1,
      stackCents: 2500,
      roundBetCents: 300,
      committedCents: 300,
    });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["Qh", "Jh"]);
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["As", "Ad"]);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_folded_no_calc");
    const payload = client.send.mock.calls[0][1] as any;

    expect(payload.hero.calculations).toBeUndefined();
  });

  it("emits outs for heads-up turn spots", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_7";
    state.tableName = "Snapshot Table 7";
    state.maxSeats = 6;
    state.handId = "hand_turn_outs";
    state.handNumber = 11;
    state.street = "TURN";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.potCents = 600;
    state.board.push("Ah", "Kh", "2c", "3d");

    const dealer = new Dealer(state);
    const hero = makePlayer({ id: "u1", name: "Hero", seat: 0, stackCents: 2500, roundBetCents: 100, committedCents: 300 });
    const villain = makePlayer({ id: "u2", name: "Villain", seat: 1, stackCents: 2500, roundBetCents: 200, committedCents: 300 });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["Qh", "Jh"]);
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["As", "Ad"]);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_turn_outs");

    const payload = client.send.mock.calls[0][1] as any;
    expect(payload.hero.calculations!.outs).toBe(10);
  });

  it("keeps gameplay snapshots flowing and marks stale on calculation failure", () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_8";
    state.tableName = "Snapshot Table 8";
    state.maxSeats = 6;
    state.handId = "hand_stale_on_failure";
    state.handNumber = 12;
    state.street = "TURN";
    state.dealerSeat = 1;
    state.toActSeat = 0;
    state.roundCurrentBetCents = 200;
    state.minRaiseCents = 100;
    state.potCents = 600;
    state.board.push("Ah", "Kh", "2c", "3d");

    const dealer = new Dealer(state);
    const hero = makePlayer({ id: "u1", name: "Hero", seat: 0, stackCents: 2500, roundBetCents: 100, committedCents: 300 });
    const villain = makePlayer({ id: "u2", name: "Villain", seat: 1, stackCents: 2500, roundBetCents: 200, committedCents: 300 });

    state.playersById.set(hero.id, hero);
    state.playersById.set(villain.id, villain);
    state.seats[0] = hero.id;
    state.seats[1] = villain.id;

    const client = makeClient();
    dealer.bindClient(hero.id, client as any);
    (dealer as any).holeCardsByPlayerId.set(hero.id, ["Qh", "Jh"]);
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["As", "Ad"]);

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_stale_before");
    const before = client.send.mock.calls[0][1] as any;
    expect(before.hero.calculations).toBeDefined();
    expect(before.hero.calculations!.stale).toBe(false);

    // Force a recompute with invalid cards so equity calc throws inside coordinator.
    (dealer as any).holeCardsByPlayerId.set(villain.id, ["ZZ", "XX"]);
    state.potCents = 700;

    dealer.emitSnapshotToUser(hero.id, "ACTION_ACCEPTED", "act_stale_after");
    const after = client.send.mock.calls[1][1] as any;

    expect(client.send).toHaveBeenCalledTimes(2);
    expect(after.hero.calculations).toBeDefined();
    expect(after.hero.calculations!.stale).toBe(true);
    expect(after.calculationsMeta).toBeDefined();
  });

  it("includes hero.playerStats after hand ends (session VPIP/PFR)", async () => {
    const buyInSpy = CashierService.processCashGameBuyIn;
    const cashOutSpy = CashierService.processCashGameCashOut;
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });
    try {
      const state = new PokerState();
      state.tableId = "table_stats";
      state.tableName = "Stats Table";
      state.maxSeats = 6;
      state.smallBlindCents = 50;
      state.bigBlindCents = 100;
      state.minBuyInCents = 2000;
      state.maxBuyInCents = 20000;

      const dealer = new Dealer(state);
      await dealer.addPlayer("u1", "Alice", 5000);
      await dealer.addPlayer("u2", "Bob", 5000);

      const clientU1 = makeClient();
      dealer.bindClient("u1", clientU1 as any);

      const toActId = state.seats[state.toActSeat];
      await dealer.handleAction(toActId!, { action: "FOLD" });

      const calls = clientU1.send.mock.calls;
      const handEndSnapshot = calls.find((c: [string, any]) => c[0] === "TABLE_SNAPSHOT" && c[1]?.reason === "HAND_END")?.[1];
      expect(handEndSnapshot).toBeDefined();
      expect(handEndSnapshot.hero.playerStats).toEqual({ hands: 1, vpipPct: 0, pfrPct: 0 });
    } finally {
      (CashierService as any).processCashGameBuyIn = buyInSpy;
      (CashierService as any).processCashGameCashOut = cashOutSpy;
    }
  });

  it("VPIP/PFR: limp → VPIP only; open raise → VPIP+PFR; blind fold → both false", async () => {
    const buyInSpy = CashierService.processCashGameBuyIn;
    const cashOutSpy = CashierService.processCashGameCashOut;
    (CashierService as any).processCashGameBuyIn = async () => ({ success: true, newTableBalance: 5000 });
    (CashierService as any).processCashGameCashOut = async () => ({ success: true });
    try {
      const scenarios: { name: string; actions: Array<{ action: "FOLD" | "CALL" | "RAISE"; amountCents?: number }>; vpipPct: number; pfrPct: number; heroIsFirstToAct?: boolean }[] = [
        { name: "blind fold", actions: [{ action: "FOLD" }], vpipPct: 0, pfrPct: 0, heroIsFirstToAct: true },
        { name: "limp then villain folds", actions: [{ action: "CALL" }, { action: "FOLD" }], vpipPct: 100, pfrPct: 0, heroIsFirstToAct: true },
        { name: "open raise then villain folds", actions: [{ action: "RAISE", amountCents: 200 }, { action: "FOLD" }], vpipPct: 100, pfrPct: 100, heroIsFirstToAct: true },
      ];
      for (const scenario of scenarios) {
        const state = new PokerState();
        state.tableId = "table_vpip_pfr";
        state.tableName = "VPIP PFR";
        state.maxSeats = 6;
        state.smallBlindCents = 50;
        state.bigBlindCents = 100;
        state.minBuyInCents = 2000;
        state.maxBuyInCents = 20000;
        const dealer = new Dealer(state);
        await dealer.addPlayer("u1", "Hero", 5000);
        await dealer.addPlayer("u2", "Villain", 5000);
        const firstToActId = state.seats[state.toActSeat];
        const heroId = scenario.heroIsFirstToAct ? firstToActId : state.seats.find((id, i) => id && i !== state.toActSeat);
        expect(heroId, scenario.name).toBeTruthy();
        const client = makeClient();
        dealer.bindClient(heroId!, client as any);
        for (const { action, amountCents } of scenario.actions) {
          const toActId = state.seats[state.toActSeat];
          if (!toActId) break;
          await dealer.handleAction(toActId, amountCents !== undefined ? { action, amountCents } : { action });
          if (state.street === "WAITING") break;
        }
        const calls = client.send.mock.calls;
        const handEndSnapshot = calls.find((c: [string, any]) => c[0] === "TABLE_SNAPSHOT" && c[1]?.reason === "HAND_END")?.[1];
        expect(handEndSnapshot, scenario.name).toBeDefined();
        expect(handEndSnapshot!.hero.playerStats, scenario.name).toEqual({
          hands: 1,
          vpipPct: scenario.vpipPct,
          pfrPct: scenario.pfrPct,
        });
      }
    } finally {
      (CashierService as any).processCashGameBuyIn = buyInSpy;
      (CashierService as any).processCashGameCashOut = cashOutSpy;
    }
  });
});
