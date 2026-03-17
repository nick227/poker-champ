import { afterEach, describe, expect, it, vi } from "vitest";
import { Dealer } from "./Dealer.js";
import { PokerState } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { logger } from "../lib/logger.js";

type PlayerInput = {
  id: string;
  seat: number;
  kind: "HUMAN" | "BOT";
  connected?: boolean;
  needsAction?: boolean;
};

function makePlayer(input: PlayerInput): PlayerState {
  const player = new PlayerState();
  player.id = input.id;
  player.name = input.id;
  player.seat = input.seat;
  player.kind = input.kind;
  player.status = "ACTIVE";
  player.connected = input.connected ?? true;
  player.stackCents = 5000;
  player.roundBetCents = input.seat === 0 ? 0 : 100;
  player.committedCents = player.roundBetCents;
  player.needsAction = input.needsAction ?? true;
  return player;
}

function makeActiveTurnState(
  actor: PlayerInput,
  opponent: PlayerInput,
): PokerState {
  const state = new PokerState();
  state.tableId = `table_${actor.id}`;
  state.maxSeats = 6;
  state.smallBlindCents = 50;
  state.bigBlindCents = 100;
  state.handId = `hand_${actor.id}`;
  state.handNumber = 1;
  state.street = "FLOP";
  state.roundState = "WAITING_FOR_ACTION";
  state.roundCurrentBetCents = 100;
  state.minRaiseCents = 100;
  state.potCents = 200;
  state.toActSeat = actor.seat;
  state.seats.push(actor.id, opponent.id, "", "", "", "");

  const actingPlayer = makePlayer(actor);
  const otherPlayer = makePlayer({ ...opponent, needsAction: false });
  state.playersById.set(actingPlayer.id, actingPlayer);
  state.playersById.set(otherPlayer.id, otherPlayer);
  return state;
}

describe("Dealer lifecycle owner reconciliation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("repairs an unowned human turn after lifecycle execution by arming the deadline owner", async () => {
    const state = makeActiveTurnState(
      { id: "human_a", seat: 0, kind: "HUMAN", connected: true },
      { id: "human_b", seat: 1, kind: "HUMAN", connected: true },
    );
    const dealer = new Dealer(state);

    try {
      (dealer as any).nextStepOwner = "IDLE";

      await (dealer as any).executeHandLifecyclePlans([]);

      expect((dealer as any).nextStepOwner).toBe("WAITING_FOR_HUMAN");
      expect(state.turnDeadlineMs).toBeGreaterThan(0);
    } finally {
      dealer.dispose();
    }
  });

  it("repairs an unowned bot turn after lifecycle execution by scheduling automation", async () => {
    const state = makeActiveTurnState(
      { id: "bot_a", seat: 0, kind: "BOT", connected: true },
      { id: "human_b", seat: 1, kind: "HUMAN", connected: true },
    );
    const dealer = new Dealer(state);
    const timeoutSpy = vi
      .spyOn(global, "setTimeout")
      .mockImplementation(((
        _cb: (...args: unknown[]) => void,
        _delay?: number,
      ) => 1 as unknown as ReturnType<typeof setTimeout>) as typeof setTimeout);

    try {
      (dealer as any).nextStepOwner = "IDLE";

      await (dealer as any).executeHandLifecyclePlans([]);

      expect((dealer as any).nextStepOwner).toBe("WAITING_FOR_AUTOMATION");
      expect(timeoutSpy).toHaveBeenCalled();
    } finally {
      dealer.dispose();
    }
  });

  it("emits UNOWNED_ACTIVE_HAND when an active hand is left idle", async () => {
    const state = makeActiveTurnState(
      { id: "human_idle", seat: 0, kind: "HUMAN", connected: true },
      { id: "human_other", seat: 1, kind: "HUMAN", connected: true },
    );
    const dealer = new Dealer(state);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger as never);

    try {
      (dealer as any).nextStepOwner = "IDLE";
      (dealer as any).assertProgressionOwnershipInvariant("TEST_UNOWNED_ACTIVE_HAND");

      expect(
        errorSpy.mock.calls.some(([, message]) => message === "UNOWNED_ACTIVE_HAND"),
      ).toBe(true);
    } finally {
      dealer.dispose();
    }
  });

  it("routes disconnect lifecycle through driveGame instead of executing outside the drive loop", async () => {
    const state = makeActiveTurnState(
      { id: "human_disconnect", seat: 0, kind: "HUMAN", connected: true },
      { id: "human_other", seat: 1, kind: "HUMAN", connected: true },
    );
    const dealer = new Dealer(state);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger as never);

    try {
      await dealer.markDisconnectedSerialized("human_disconnect", Date.now() + 30_000);

      expect(
        errorSpy.mock.calls.some(([, message]) => message === "LIFECYCLE_CALLED_OUTSIDE_DRIVE"),
      ).toBe(false);
    } finally {
      dealer.dispose();
    }
  });
});
