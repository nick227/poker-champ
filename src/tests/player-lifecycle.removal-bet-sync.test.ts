import { describe, expect, it } from "vitest";
import { PlayerLifecycleService } from "../engine/dealer/services/PlayerLifecycleService.js";
import { assertStateInvariants } from "../engine/invariants/assertState.js";
import { PlayerState } from "../state/PlayerState.js";
import { PokerState } from "../state/PokerState.js";

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
    state.seats = ["u1", "u2", ""];

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
      holeCardsByPlayerId: new Map<string, string[]>(),
      ensurePlayerPersistence: async () => {},
    });

    await expect(lifecycle.removePlayer("u1", { cashOutAfterRemoval: true })).resolves.toBeDefined();
    expect(state.roundCurrentBetCents).toBe(300);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });
});
