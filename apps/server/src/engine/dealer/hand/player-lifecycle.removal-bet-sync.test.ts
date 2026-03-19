import { describe, expect, it } from "vitest";
import { PlayerLifecycleService } from "./PlayerLifecycleService.js";
import { assertStateInvariants } from "../../invariants/assertState.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { PokerState } from "../../../state/PokerState.js";

function makePlayer(input: {
  id: string;
  seat: number;
  status: PlayerState["status"];
  roundBetCents: number;
  committedCents: number;
  stackCents?: number;
}): PlayerState {
  const p = new PlayerState();
  p.id = input.id;
  p.userId = input.id;
  p.kind = "HUMAN";
  p.name = input.id;
  p.seat = input.seat;
  p.status = input.status;
  p.stackCents = input.stackCents ?? 0;
  p.roundBetCents = input.roundBetCents;
  p.committedCents = input.committedCents;
  p.connected = false;
  p.needsAction = false;
  return p;
}

describe("PlayerLifecycleService remove* round bet sync", () => {
  it("re-syncs roundCurrentBetCents when removing an ALL_IN player mid-hand", async () => {
    const state = new PokerState();
    state.tableId = "table_remove_allin_sync";
    state.street = "TURN";
    state.potCents = 800;
    state.roundCurrentBetCents = 500;
    state.toActSeat = 1;
    state.seats.push("u1", "u2", "");

    const allIn = makePlayer({
      id: "u1",
      seat: 0,
      status: "ALL_IN",
      roundBetCents: 500,
      committedCents: 500,
      stackCents: 0,
    });
    const active = makePlayer({
      id: "u2",
      seat: 1,
      status: "ACTIVE",
      roundBetCents: 300,
      committedCents: 300,
      stackCents: 500,
    });
    active.needsAction = true;
    active.connected = true;

    state.playersById.set(allIn.id, allIn);
    state.playersById.set(active.id, active);
    expect(() => assertStateInvariants(state)).not.toThrow();

    const lifecycle = new PlayerLifecycleService({
      state,
      persistence: { enabled: false } as any,
      pendingSeatReleaseUserIds: new Set<string>(),
      autoActionsByUserId: new Map<string, number>(),
      currentHandAutoActedUserIds: new Set<string>(),
      getHoleCardsByPlayerId: () => new Map<string, string[]>(),
      ensurePlayerPersistence: async () => {},
    });

    await expect(lifecycle.removePlayer("u1", { cashOutAfterRemoval: true })).resolves.toBeDefined();
    expect(state.roundCurrentBetCents).toBe(300);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("defers mid-hand removal until WAITING and finalizes idempotently", async () => {
    const state = new PokerState();
    state.tableId = "table_deferred_removal_boundary";
    state.street = "TURN";
    state.potCents = 1800;
    state.roundCurrentBetCents = 300;
    state.toActSeat = 2;
    state.seats.push("u1", "u2", "u3");

    const leaving = makePlayer({
      id: "u1",
      seat: 0,
      status: "ACTIVE",
      roundBetCents: 300,
      committedCents: 600,
      stackCents: 1200,
    });
    leaving.connected = true;
    const actor = makePlayer({
      id: "u2",
      seat: 1,
      status: "ACTIVE",
      roundBetCents: 300,
      committedCents: 600,
      stackCents: 1200,
    });
    const third = makePlayer({
      id: "u3",
      seat: 2,
      status: "ACTIVE",
      roundBetCents: 300,
      committedCents: 600,
      stackCents: 1200,
    });
    third.needsAction = true;
    third.connected = true;

    state.playersById.set(leaving.id, leaving);
    state.playersById.set(actor.id, actor);
    state.playersById.set(third.id, third);

    const pendingSeatReleaseUserIds = new Set<string>();
    const lifecycle = new PlayerLifecycleService({
      state,
      persistence: { enabled: false } as any,
      pendingSeatReleaseUserIds,
      autoActionsByUserId: new Map<string, number>(),
      currentHandAutoActedUserIds: new Set<string>(),
      getHoleCardsByPlayerId: () => new Map<string, string[]>(),
      ensurePlayerPersistence: async () => {},
    });

    await expect(lifecycle.removePlayer("u1", { cashOutAfterRemoval: false })).resolves.toBeDefined();

    expect(state.street).toBe("TURN");
    expect(state.playersById.has("u1")).toBe(true);
    expect(state.seats[0]).toBe("u1");
    expect(leaving.pendingLeave).toBe(true);
    expect(leaving.pendingRemovalReason).toBe("LEAVE");
    expect(leaving.committedCents).toBe(600);
    expect(leaving.roundBetCents).toBe(300);
    expect(pendingSeatReleaseUserIds.has("u1")).toBe(true);

    state.street = "WAITING";

    const finalized = await lifecycle.finalizePendingRemoval("u1");
    expect(finalized.some((plan) => plan.kind === "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL")).toBe(true);
    expect(state.playersById.has("u1")).toBe(false);
    expect(state.seats[0]).toBe("");
    expect(leaving.pendingLeave).toBe(false);
    expect(leaving.pendingRemovalReason).toBe("");
    expect(pendingSeatReleaseUserIds.has("u1")).toBe(false);

    await expect(lifecycle.finalizePendingRemoval("u1")).resolves.toEqual([]);
  });
});
