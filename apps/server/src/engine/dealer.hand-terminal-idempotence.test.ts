import { describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(
  id: string,
  seat: number,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  const player = new PlayerState();
  player.id = id;
  player.userId = id;
  player.name = id;
  player.seat = seat;
  player.kind = "HUMAN";
  player.status = "ACTIVE";
  player.connected = true;
  player.stackCents = 5000;
  player.roundBetCents = 0;
  player.committedCents = 0;
  player.needsAction = false;
  Object.assign(player, overrides);
  return player;
}

describe("dealer terminal lifecycle idempotence", () => {
  it("emits a single terminal plan set when last-standing settlement is requested from HAND_COMPLETE", async () => {
    const state = new PokerState();
    state.tableId = "table_terminal_idempotence";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_terminal_idempotence";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "HAND_COMPLETE";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 1;
    state.seats.push("u1", "u2");

    state.playersById.set(
      "u1",
      makePlayer("u1", 0, {
        status: "ACTIVE",
        stackCents: 6000,
        roundBetCents: 100,
        committedCents: 100,
      }),
    );
    state.playersById.set(
      "u2",
      makePlayer("u2", 1, {
        status: "FOLDED",
        stackCents: 5950,
        roundBetCents: 50,
        committedCents: 50,
      }),
    );

    const dealer = new Dealer(state);

    try {
      const plans = await (dealer as any).handLifecycleService.finishHandByLastStanding();
      expect(plans.map((plan: { kind: string }) => plan.kind)).toEqual([
        "EMIT_SNAPSHOT",
        "HAND_ENDED",
        "TRANSITION_TO_WAITING",
        "RELEASE_PENDING_SEATS",
        "SCHEDULE_NEXT_HAND",
      ]);
      expect(state.potCents).toBe(150);
      expect(state.playersById.get("u1")?.stackCents).toBe(6150);
    } finally {
      dealer.dispose();
    }
  });

  it("suppresses duplicate dealer terminal entry for the same handId", async () => {
    const state = new PokerState();
    state.tableId = "table_terminal_dealer_guard";
    state.maxSeats = 2;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_terminal_dealer_guard";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "WAITING_FOR_ACTION";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 0;
    state.seats.push("u1", "u2");

    state.playersById.set(
      "u1",
      makePlayer("u1", 0, {
        status: "ACTIVE",
        stackCents: 6000,
        roundBetCents: 100,
        committedCents: 100,
        needsAction: false,
      }),
    );
    state.playersById.set(
      "u2",
      makePlayer("u2", 1, {
        status: "FOLDED",
        stackCents: 5950,
        roundBetCents: 50,
        committedCents: 50,
        needsAction: false,
      }),
    );

    const dealer = new Dealer(state);
    const orchestrator = (dealer as any).handOrchestrator;
    const finishSpy = vi
      .spyOn(orchestrator, "finishHandByLastStanding")
      .mockResolvedValue(undefined);

    try {
      await (dealer as any).finishHandByLastStanding("TEST_FIRST_CALL");
      await (dealer as any).finishHandByLastStanding("TEST_DUPLICATE_CALL");

      expect(finishSpy).toHaveBeenCalledTimes(1);
      expect((dealer as any).completedTerminalLifecycle).toMatchObject({
        handId: "hand_terminal_dealer_guard",
        path: "LAST_STANDING",
      });
    } finally {
      dealer.dispose();
    }
  });

  it("runs one terminal pass to WAITING, flushes deferred removals, and does not start the next hand in the same drive", async () => {
    const state = new PokerState();
    state.tableId = "table_terminal_single_pass";
    state.maxSeats = 3;
    state.smallBlindCents = 50;
    state.bigBlindCents = 100;
    state.handId = "hand_terminal_single_pass";
    state.handNumber = 1;
    state.street = "PREFLOP";
    state.roundState = "HAND_COMPLETE";
    state.roundCurrentBetCents = 100;
    state.minRaiseCents = 100;
    state.potCents = 150;
    state.toActSeat = 0;
    state.seats.push("u1", "u2", "bot_pending");

    state.playersById.set(
      "u1",
      makePlayer("u1", 0, {
        status: "ACTIVE",
        stackCents: 6000,
        roundBetCents: 100,
        committedCents: 100,
      }),
    );
    state.playersById.set(
      "u2",
      makePlayer("u2", 1, {
        status: "FOLDED",
        stackCents: 5950,
        roundBetCents: 50,
        committedCents: 50,
      }),
    );
    const pendingBot = makePlayer("bot_pending", 2, {
      status: "ABANDONED",
      connected: false,
      stackCents: 5000,
      roundBetCents: 0,
      committedCents: 0,
    });
    pendingBot.kind = "BOT";
    pendingBot.userId = "";
    pendingBot.botId = "chaos_carl";
    pendingBot.pendingLeave = true;
    pendingBot.pendingRemovalReason = "BOT_AUTO_REMOVE";
    state.playersById.set("bot_pending", pendingBot);

    const dealer = new Dealer(state);
    const events: string[] = [];
    (dealer as any).pendingSeatReleaseUserIds.add("bot_pending");

    const finishOriginal = (dealer as any).finishHandByLastStanding.bind(dealer);
    vi.spyOn(dealer as any, "finishHandByLastStanding").mockImplementation(async (...args: unknown[]) => {
      events.push("TERMINAL_ENTER");
      await finishOriginal(...args);
      events.push("TERMINAL_EXIT");
    });

    const runHandEndedAwardsOriginal = (dealer as any).runHandEndedAwards.bind(dealer);
    vi.spyOn(dealer as any, "runHandEndedAwards").mockImplementation(async (...args: unknown[]) => {
      events.push("HAND_ENDED");
      return await runHandEndedAwardsOriginal(...args);
    });

    const transitionOriginal = (dealer as any).transitionToWaiting.bind(dealer);
    vi.spyOn(dealer as any, "transitionToWaiting").mockImplementation(() => {
      events.push("TRANSITION_TO_WAITING");
      transitionOriginal();
    });

    const releaseOriginal = (dealer as any).releasePendingSeats.bind(dealer);
    vi.spyOn(dealer as any, "releasePendingSeats").mockImplementation(async () => {
      events.push("RELEASE_PENDING_SEATS");
      await releaseOriginal();
    });

    vi.spyOn(dealer as any, "scheduleNextHand").mockImplementation((...args: unknown[]) => {
      void args;
      events.push("SCHEDULE_NEXT_HAND");
      state.nextHandAtTs = Date.now() + 60_000;
    });

    const startHandSpy = vi.spyOn(dealer as any, "startHand");

    try {
      await (dealer as any).driveGame("TEST_TERMINAL_SINGLE_PASS");

      expect(events.filter((event) => event === "TERMINAL_ENTER")).toHaveLength(1);
      expect(events.filter((event) => event === "HAND_ENDED")).toHaveLength(1);
      expect(events.filter((event) => event === "TRANSITION_TO_WAITING")).toHaveLength(1);
      expect(events.filter((event) => event === "RELEASE_PENDING_SEATS")).toHaveLength(1);
      expect(events.filter((event) => event === "SCHEDULE_NEXT_HAND")).toHaveLength(1);
      expect(events.filter((event) => event === "TERMINAL_EXIT")).toHaveLength(1);
      expect(events.indexOf("SCHEDULE_NEXT_HAND")).toBeGreaterThan(events.indexOf("RELEASE_PENDING_SEATS"));
      expect(events.indexOf("TERMINAL_EXIT")).toBeGreaterThan(events.indexOf("SCHEDULE_NEXT_HAND"));
      expect(events).toEqual([
        "TERMINAL_ENTER",
        "HAND_ENDED",
        "TRANSITION_TO_WAITING",
        "RELEASE_PENDING_SEATS",
        "SCHEDULE_NEXT_HAND",
        "TERMINAL_EXIT",
      ]);
      expect(startHandSpy).not.toHaveBeenCalled();
      expect(state.street).toBe("WAITING");
      expect(state.playersById.has("bot_pending")).toBe(false);
      expect(state.seats[2]).toBe("");
      expect((dealer as any).activeTerminalLifecycle).toBeNull();
      expect((dealer as any).completedTerminalLifecycle).toMatchObject({
        handId: "hand_terminal_single_pass",
        path: "LAST_STANDING",
      });
    } finally {
      dealer.dispose();
    }
  });
});
