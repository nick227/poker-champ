import { describe, expect, it, vi } from "vitest";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

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

describe("hand start stack regression guard", () => {
  it("new deal only changes stacks by posted blinds and never drops non-blind players to zero", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((handler: TimerHandler) => {
        if (typeof handler === "function") handler();
        return 0 as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    );

    try {
    const state = new PokerState();
    state.tableId = "table_stack_zero_regression";
    state.maxSeats = 6;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 200;
    state.maxBuyInCents = 50000;
    state.street = "WAITING";
    state.seats.push("u1", "u2", "u3", "u4", "u5", "u6");

    // Include short stacks so blind-capping-to-zero is tested, but only when justified.
    const initialStacks = [250, 320, 900, 1500, 2300, 4100];
    initialStacks.forEach((stack, i) => {
      const id = `u${i + 1}`;
      state.playersById.set(id, makePlayer(id, i, stack));
    });

    let latestHandStartSnapshot: TableSnapshotPayload | null = null;
    const persistence = {
      enabled: false,
      handHistory: null,
      postBlind: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      debitBet: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance - args.amountCents,
      creditPayout: async (args: { currentBalance: number; amountCents: number }) => args.currentBalance + args.amountCents,
      assertHandBalanced: async () => {},
    } as any;

    const dealer = new Dealer(state, persistence, {
      onTableSnapshotEmitted: ({ reason, payloadJson }) => {
        if (reason === "HAND_START") latestHandStartSnapshot = payloadJson;
      },
    });
    (dealer as any).scheduleNextHand = () => {};

    const handsToExercise = 2;

    for (let hand = 1; hand <= handsToExercise; hand++) {
      const playersWithChips = [...state.playersById.values()].filter((p) => p.status !== "OUT" && p.stackCents > 0);
      if (playersWithChips.length < 2) break;

      const beforeStacks = new Map<string, number>();
      for (const [id, p] of state.playersById.entries()) beforeStacks.set(id, p.stackCents);
      latestHandStartSnapshot = null;

      await (dealer as any).startHand();
      if (state.street === "WAITING") break;

      const trace = [`hand=${hand}`, `handId=${state.handId}`, `sbSeat=${state.sbSeat}`, `bbSeat=${state.bbSeat}`];

      // At hand start, each player's stack delta must match only their posted blind (roundBetCents).
      for (const [id, p] of state.playersById.entries()) {
        const before = beforeStacks.get(id) ?? 0;
        const expectedAfter = before - p.roundBetCents;
        expect(
          p.stackCents,
          `unexpected start-of-hand stack delta user=${id} before=${before} roundBet=${p.roundBetCents} ${trace.join("|")}`,
        ).toBe(expectedAfter);

        if (p.stackCents === 0) {
          expect(
            p.roundBetCents,
            `stack reached zero without full blind contribution user=${id} before=${before} ${trace.join("|")}`,
          ).toBe(before);
        }
      }

      const sbId = state.seats[state.sbSeat];
      const bbId = state.seats[state.bbSeat];
      for (const [id, p] of state.playersById.entries()) {
        if (id === sbId || id === bbId) continue;
        expect(
          p.roundBetCents,
          `non-blind player posted chips at hand start user=${id} ${trace.join("|")}`,
        ).toBe(0);
      }

      // Snapshot must reflect runtime stacks (protects against false UI stack zero payloads).
      expect(latestHandStartSnapshot, `missing HAND_START snapshot ${trace.join("|")}`).toBeTruthy();
      const snapshot = latestHandStartSnapshot!;
      for (const seatSnap of snapshot.seats) {
        if (!seatSnap.userId) continue;
        const runtime = state.playersById.get(seatSnap.userId);
        if (!runtime) continue;
        expect(
          seatSnap.stackCents,
          `snapshot/runtime stack mismatch user=${seatSnap.userId} ${trace.join("|")}`,
        ).toBe(runtime.stackCents);
      }

      // This regression guard targets start-of-hand deltas only.
      // Force next cycle to WAITING so we can exercise repeated deal starts quickly.
      state.street = "WAITING";
      state.runoutMode = "NONE";
    }
    } finally {
      setTimeoutSpy.mockRestore();
    }
  }, 120_000);
});
