import { describe, expect, it, vi } from "vitest";
import { Dealer } from "../engine/Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";

function makePlayer(
  id: string,
  seat: number,
  options?: { kind?: "HUMAN" | "BOT"; connected?: boolean },
): PlayerState {
  const p = new PlayerState();
  p.id = id;
  p.userId = id;
  p.kind = options?.kind ?? "HUMAN";
  p.name = id;
  p.seat = seat;
  p.status = "ACTIVE";
  p.stackCents = 5000;
  p.roundBetCents = 0;
  p.committedCents = 0;
  p.needsAction = true;
  p.connected = options?.connected ?? true;
  p.disconnectDeadlineTs = 0;
  return p;
}

function makeStateForTurn(toActId: string, toActPlayer: PlayerState, otherPlayer: PlayerState): PokerState {
  const state = new PokerState();
  state.tableId = "table_test_auto_action_race";
  state.maxSeats = 2;
  state.seats.push("", "");
  state.seats[toActPlayer.seat] = toActId;
  state.seats[otherPlayer.seat] = otherPlayer.id;
  state.handId = "hand_test_auto_action_race";
  state.street = "PREFLOP";
  state.toActSeat = toActPlayer.seat;
  state.roundCurrentBetCents = 0;
  state.minRaiseCents = 100;
  state.bigBlindCents = 100;
  state.playersById.set(toActPlayer.id, toActPlayer);
  state.playersById.set(otherPlayer.id, otherPlayer);
  return state;
}

describe("dealer auto-action queue race handling", () => {
  it("swallows HAND_NOT_STARTED for queued disconnected-human auto action", async () => {
    const toAct = makePlayer("u1", 0, { kind: "HUMAN", connected: false });
    const other = makePlayer("u2", 1, { kind: "HUMAN", connected: true });
    const state = makeStateForTurn(toAct.id, toAct, other);
    const dealer = new Dealer(state, { enabled: false } as any);

    (dealer as any).maybeActForBot();
    state.street = "WAITING";

    await expect((dealer as any).actionQueue).resolves.toBeUndefined();
  });

  it("swallows HAND_NOT_STARTED for queued delayed bot auto action", async () => {
    vi.useFakeTimers();
    try {
      const toAct = makePlayer("bot_1", 0, { kind: "BOT", connected: true });
      const other = makePlayer("u2", 1, { kind: "HUMAN", connected: true });
      const state = makeStateForTurn(toAct.id, toAct, other);
      const dealer = new Dealer(state, { enabled: false } as any);

      (dealer as any).maybeActForBot();
      state.street = "WAITING";

      // Advance time by the maximum possible bot delay to flush the queued action.
      await vi.advanceTimersByTimeAsync(3000);
      await expect((dealer as any).actionQueue).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
