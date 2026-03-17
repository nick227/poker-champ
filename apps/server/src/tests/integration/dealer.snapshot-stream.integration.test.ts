import { describe, expect, it } from "vitest";
import { Dealer } from "../../engine/Dealer.js";
import { PokerState } from "../../state/PokerState.js";
import { PlayerState } from "../../state/PlayerState.js";

function makePlayer(id: string, seat: number, stackCents: number): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = stackCents;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = false;
  p.connected = true;
  p.disconnectDeadlineTs = 0;
  return p;
}

describe("dealer snapshot lifecycle invariants", () => {
  it("emits HAND_START/HAND_END, keeps snapshotSeq monotonic, and ACTION_ACCEPTED reflects updated pot", async () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_invariants";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("u1", "u2");
    state.street = "WAITING";

    state.playersById.set("u1", makePlayer("u1", 0, 5000));
    state.playersById.set("u2", makePlayer("u2", 1, 5000));

    const snapshots: Array<{
      reason: string;
      snapshotSeq: number;
      potCents?: number;
      resolvedActionId?: string;
    }> = [];

    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      creditRefund: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence, {
      onTableSnapshotEmitted: (payload) => {
        snapshots.push({
          reason: payload.reason,
          snapshotSeq: payload.payloadJson.snapshotSeq,
          potCents: payload.payloadJson.hand?.potCents,
          resolvedActionId: payload.payloadJson.resolvedActionId,
        });
      },
    });
    (dealer as any).scheduleNextHand = () => {};
    state.dealerSeat = 0;

    await (dealer as any).startHand();
    const potAfterBlinds = state.potCents;
    const firstToAct = state.seats[state.toActSeat];
    expect(firstToAct).toBeTruthy();
    const firstPlayer = state.playersById.get(firstToAct);
    const firstCallAmount = state.roundCurrentBetCents - (firstPlayer?.roundBetCents ?? 0);
    const firstActionId = "stream-act-1";
    const snapshotCountBeforeFirstAction = snapshots.length;
    await dealer.handleAction(String(firstToAct), { action: firstCallAmount > 0 ? "CALL" : "CHECK" }, firstActionId);
    const postFirstActionSnapshots = snapshots.slice(snapshotCountBeforeFirstAction);
    const actionSnapshot = postFirstActionSnapshots.find(
      (s) => s.reason === "ACTION_ACCEPTED" || s.reason === "AUTO_TRANSITION",
    );
    expect(actionSnapshot).toBeDefined();
    expect((actionSnapshot?.potCents ?? 0)).toBeGreaterThanOrEqual(potAfterBlinds);
    expect(actionSnapshot?.resolvedActionId).toBe(firstActionId);

    const secondToAct = state.seats[state.toActSeat];
    expect(secondToAct).toBeTruthy();
    const secondActionId = "stream-act-2";
    await dealer.handleAction(String(secondToAct), { action: "FOLD" }, secondActionId);

    const reasons = snapshots.map((s) => s.reason);
    expect(reasons).toContain("HAND_START");
    expect(reasons).toContain("HAND_END");
    expect(reasons.indexOf("HAND_START")).toBeLessThan(reasons.indexOf("HAND_END"));
    const handEndSnapshot = [...snapshots].reverse().find((s) => s.reason === "HAND_END");
    expect(handEndSnapshot?.resolvedActionId).toBe(secondActionId);

    for (let i = 1; i < snapshots.length; i++) {
      expect(
        snapshots[i]!.snapshotSeq,
        `snapshotSeq must be monotonic: prev=${snapshots[i - 1]!.snapshotSeq}, next=${snapshots[i]!.snapshotSeq}`,
      ).toBeGreaterThan(snapshots[i - 1]!.snapshotSeq);
    }
  });

  it("keeps snapshotSeq monotonic across emitToAll -> emitToUser -> emitToAll", async () => {
    const state = new PokerState();
    state.tableId = "table_snapshot_emit_to_user";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("u1", "");
    state.street = "WAITING";
    state.playersById.set("u1", makePlayer("u1", 0, 5000));

    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence, {});
    const seenSeq: number[] = [];
    const client = {
      send: (_type: string, payload: { snapshotSeq?: number }) => {
        if (typeof payload?.snapshotSeq === "number") seenSeq.push(payload.snapshotSeq);
      },
    } as any;
    dealer.bindClient("u1", client);

    await dealer.emitSnapshotsToAll("AUTO_TRANSITION");
    await dealer.emitSnapshotToUser("u1", "RECONNECT");
    await dealer.emitSnapshotsToAll("AUTO_TRANSITION");

    expect(seenSeq.length).toBe(3);
    expect(seenSeq[0]).toBe(1);
    expect(seenSeq[1]).toBe(2);
    expect(seenSeq[2]).toBe(3);
  });

  it("sends post-action snapshot to actor client when actor is not in clientsByUserId (ensureRecipient)", async () => {
    const state = new PokerState();
    state.tableId = "table_ensure_recipient";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 100000;
    state.seats.push("u1", "u2");
    state.street = "WAITING";
    state.playersById.set("u1", makePlayer("u1", 0, 5000));
    state.playersById.set("u2", makePlayer("u2", 1, 5000));

    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence, {});
    (dealer as any).scheduleNextHand = () => {};

    await (dealer as any).startHand();
    const firstToAct = state.seats[state.toActSeat];
    expect(firstToAct).toBeTruthy();
    const firstPlayer = state.playersById.get(firstToAct);
    const callAmount = state.roundCurrentBetCents - (firstPlayer?.roundBetCents ?? 0);
    await dealer.handleAction(String(firstToAct), { action: callAmount > 0 ? "CALL" : "CHECK" });

    const secondToAct = state.seats[state.toActSeat];
    expect(secondToAct).toBeTruthy();
    const secondPlayer = state.playersById.get(secondToAct);
    const secondCallAmount = state.roundCurrentBetCents - (secondPlayer?.roundBetCents ?? 0);
    const secondAction = secondCallAmount > 0 ? "CALL" : "CHECK";

    const actorReceived: unknown[] = [];
    const actorClient = {
      send: (type: string, payload: unknown) => {
        if (type === "TABLE_SNAPSHOT") actorReceived.push(payload);
      },
    } as any;

    const actionId = "ensure-recipient-id";
    await dealer.handleAction(String(secondToAct), { action: secondAction }, actionId, actorClient);

    expect(actorReceived.length).toBeGreaterThanOrEqual(1);
    const firstSnapshot = actorReceived[0] as { reason?: string; resolvedActionId?: string };
    const reason = firstSnapshot?.reason;
    expect(["ACTION_ACCEPTED", "AUTO_TRANSITION"]).toContain(reason);
    expect(firstSnapshot?.resolvedActionId).toBe(actionId);
  });
});
