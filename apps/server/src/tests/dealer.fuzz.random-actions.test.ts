import { describe, expect, it } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import type { ActionPayload } from "@poker-champ/api-types";
import { vi } from "vitest";

vi.setConfig({ testTimeout: 60000 });

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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickLegalAction(options: any, bigBlindCents: number): ActionPayload {
  const legal: ActionPayload[] = [];
  if (options?.canFold) legal.push({ action: "FOLD" });
  if (options?.canCheck) legal.push({ action: "CHECK" });
  if (options?.canCall) legal.push({ action: "CALL" });
  if (options?.canBet) {
    const max = options?.maxRaiseTo ?? bigBlindCents;
    const amount = Math.max(1, Math.min(max, bigBlindCents));
    legal.push({ action: "BET", amountCents: amount });
  }
  if (options?.canRaise) {
    const minRaiseTo = options?.minRaiseTo ?? options?.maxRaiseTo ?? bigBlindCents;
    legal.push({ action: "RAISE", amountCents: minRaiseTo });
  }
  if (options?.canAllIn) legal.push({ action: "ALL_IN" });
  if (legal.length === 0) return { action: "FOLD" };
  return legal[randomInt(0, legal.length - 1)]!;
}

describe("dealer fuzz random valid actions", () => {
  it("plays N random hands without throwing for valid legal actions", async () => {
    const state = new PokerState();
    state.tableId = "table_fuzz_1";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.minBuyInCents = 2000;
    state.maxBuyInCents = 20000;
    state.seats.push("u1", "u2");
    state.street = "WAITING";

    const p1 = makePlayer("u1", 0, 5000);
    const p2 = makePlayer("u2", 1, 5000);
    state.playersById.set("u1", p1);
    state.playersById.set("u2", p2);

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

    const handsToPlay = 6;
    for (let h = 0; h < handsToPlay; h++) {
      await (dealer as any).startHand();
      let guard = 0;
      while (state.street !== "WAITING" && guard < 200) {
        guard += 1;
        const toActSeat = state.toActSeat;
        const toActUserId = state.seats[toActSeat];
        if (!toActUserId) break;
        const options = (dealer as any).buildHeroActionOptions(toActUserId);
        const payload = pickLegalAction(options, state.bigBlindCents);
        await dealer.handleAction(toActUserId, payload);
      }
      expect(guard).toBeLessThan(200);
      expect(state.street).toBe("WAITING");
    }
  });
});
