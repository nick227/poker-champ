import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PokerState } from "../../state/PokerState.js";
import { Dealer } from "../../engine/Dealer.js";
import { CashierService } from "../../engine/economy/CashierService.js";
import { ActionOptionsService } from "../../engine/dealer/index.js";

async function settleHandToWaiting(dealer: Dealer, state: PokerState, maxActions = 64): Promise<void> {
  const optionsService = new ActionOptionsService();
  for (let guard = 0; guard < maxActions && state.street !== "WAITING"; guard += 1) {
    const userId = state.seats[state.toActSeat];
    if (!userId) break;
    const options = optionsService.buildHeroActionOptions(state, userId);
    if (options?.canCheck) await dealer.handleAction(userId, { action: "CHECK" });
    else if (options?.canCall) await dealer.handleAction(userId, { action: "CALL" });
    else if (options?.canFold) await dealer.handleAction(userId, { action: "FOLD" });
    else if (options?.canAllIn) await dealer.handleAction(userId, { action: "ALL_IN" });
    else break;
  }
  expect(state.street).toBe("WAITING");
}

describe("hand lifecycle", () => {
  beforeEach(() => {
    vi.spyOn(CashierService, "processCashGameBuyIn").mockResolvedValue({
      success: true,
      newTableBalance: 5000,
    });
    vi.spyOn(CashierService, "processCashGameCashOut").mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-starts next hand after a hand ends when >=2 players remain", async () => {
    const s = new PokerState();
    s.maxSeats = 6;
    s.minBuyInCents = 1000;
    s.maxBuyInCents = 10000;

    const d = new Dealer(s);
    await d.addPlayer("p1", "A", 5000);
    await d.addPlayer("p2", "B", 5000);

    const firstHand = s.handId;
    expect(firstHand).toMatch(/^hand_/);

    // End the current hand by folding the current player to act.
    const toActId = s.seats[s.toActSeat];
    expect(toActId).toBeTruthy();
    await d.handleAction(toActId!, { action: "FOLD" });

    const started = Date.now();
    while (s.handId === firstHand && Date.now() - started < 12000) {
      await new Promise(r => setTimeout(r, 25));
    }

    expect(s.handId).not.toBe(firstHand);
    expect(s.street).not.toBe("WAITING");
  }, 15000);

  it("starts next hand with blinds on in-hand participants when seat 0 is OUT", async () => {
    const s = new PokerState();
    s.maxSeats = 6;
    s.minBuyInCents = 1000;
    s.maxBuyInCents = 10000;

    const d = new Dealer(s);
    await d.addPlayer("u0", "Bust", 5000);
    await d.addPlayer("u1", "Human", 5000);
    await d.addBot("bot_1", "Bot", 5000);

    const p0 = s.playersById.get("u0");
    const p1 = s.playersById.get("u1");
    const p2 = s.playersById.get("bot_1");
    expect(p0).toBeTruthy();
    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
    if (!p0 || !p1 || !p2) throw new Error("missing players");

    // Simulate post-hand state where busted seat remains occupied and next hand must
    // rotate blinds only across players who can actually play.
    s.street = "WAITING";
    s.runoutMode = "NONE";
    s.dealerSeat = p0.seat;

    p0.stackCents = 0;
    p0.status = "OUT";
    p0.needsAction = false;

    p1.stackCents = 5000;
    p1.status = "FOLDED";
    p1.connected = true;
    p1.sittingOutUntilNextHand = false;

    p2.stackCents = 5000;
    p2.status = "FOLDED";
    p2.connected = true;
    p2.sittingOutUntilNextHand = false;

    await expect((d as any).startHand()).resolves.toBeUndefined();
    expect(s.street).toBe("PREFLOP");

    const sbId = s.seats[s.sbSeat];
    const bbId = s.seats[s.bbSeat];
    expect(sbId).toBeTruthy();
    expect(bbId).toBeTruthy();
    expect(sbId).not.toBe("u0");
    expect(bbId).not.toBe("u0");
  });

  it("seats a bot added mid-hand into the immediate next deal", async () => {
    const s = new PokerState();
    s.maxSeats = 6;
    s.minBuyInCents = 1000;
    s.maxBuyInCents = 10000;

    const d = new Dealer(s);
    await d.addPlayer("p1", "A", 5000);
    await d.addPlayer("p2", "B", 5000);

    expect(s.handId).toMatch(/^hand_/);
    expect(s.street).not.toBe("WAITING");

    await d.addBot("bot_2", "Bot", 5000);
    const botAfterAdd = s.playersById.get("bot_2");
    expect(botAfterAdd?.status).toBe("ABANDONED");
    expect(botAfterAdd?.sittingOutUntilNextHand).toBe(true);

    await settleHandToWaiting(d, s);
    await d.forceAdvanceToNextHandForTest();
    const botOnNextHand = s.playersById.get("bot_2");
    expect(botOnNextHand?.status).toBe("ACTIVE");
    expect(botOnNextHand?.sittingOutUntilNextHand).toBe(false);
    expect((d as any).holeCardsByPlayerId.has("bot_2")).toBe(true);
  }, 15000);

  it("does not throw when heads-up SB posts all-in blind and no action remains", async () => {
    const s = new PokerState();
    s.maxSeats = 2;
    s.smallBlindCents = 100;
    s.bigBlindCents = 200;
    s.minBuyInCents = 100;
    s.maxBuyInCents = 10000;

    const d = new Dealer(s);
    await d.addPlayer("hero", "Hero", 100);
    await d.addBot("bot_1", "Bot", 3900);

    const hero = s.playersById.get("hero");
    const bot = s.playersById.get("bot_1");
    expect(hero).toBeTruthy();
    expect(bot).toBeTruthy();
    if (!hero || !bot) throw new Error("missing players");

    // Force a clean WAITING state and a deterministic heads-up blind/all-in start.
    s.street = "WAITING";
    s.runoutMode = "NONE";
    s.dealerSeat = hero.seat;
    hero.status = "ACTIVE";
    hero.stackCents = 100;
    hero.sittingOutUntilNextHand = false;
    bot.status = "ACTIVE";
    bot.stackCents = 3900;
    bot.sittingOutUntilNextHand = false;

    const plans = await (d as any).handLifecycleService.startHand();
    expect(plans.some((p: { kind: string }) => p.kind === "HAND_ENDED")).toBe(true);
    expect(
      plans.some(
        (p: { kind: string; reason?: string }) =>
          p.kind === "HAND_ENDED" && p.reason === "SHOWDOWN",
      ),
    ).toBe(true);
  });

  it("updates roundState on hand start even when the round-state feature flag is disabled", async () => {
    const previousFlag = process.env.FEATURE_ROUND_STATE_MACHINE;
    process.env.FEATURE_ROUND_STATE_MACHINE = "false";

    try {
      const s = new PokerState();
      s.maxSeats = 6;
      s.minBuyInCents = 1000;
      s.maxBuyInCents = 10000;

      const d = new Dealer(s);
      await d.addPlayer("p1", "A", 5000);
      await d.addPlayer("p2", "B", 5000);

      expect(s.street).toBe("PREFLOP");
      expect(s.roundState).toBe("WAITING_FOR_ACTION");
      expect(s.turnDeadlineMs).toBeGreaterThan(0);

      d.dispose();
    } finally {
      if (previousFlag == null) delete process.env.FEATURE_ROUND_STATE_MACHINE;
      else process.env.FEATURE_ROUND_STATE_MACHINE = previousFlag;
    }
  });
});
