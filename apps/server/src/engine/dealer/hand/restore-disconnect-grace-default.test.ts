import { describe, expect, it } from "vitest";
import { PlayerLifecycleService } from "./PlayerLifecycleService.js";
import { PokerState } from "../../../state/PokerState.js";
import { RECONNECT_GRACE_DEFAULT_MS } from "../timing.js";

describe("restore disconnect grace default", () => {
  it("restore with connected:false and no reconnectTimeoutMs sets disconnectDeadlineTs in the future", async () => {
    const state = new PokerState();
    state.tableId = "table_restore_grace";
    state.maxSeats = 6;
    state.seats.push("", "", "", "", "", "");
    const before = Date.now();

    const service = new PlayerLifecycleService({
      state,
      persistence: { enabled: false } as any,
      pendingSeatReleaseUserIds: new Set(),
      autoActionsByUserId: new Map(),
      currentHandAutoActedUserIds: new Set(),
      getHoleCardsByPlayerId: () => new Map(),
      ensurePlayerPersistence: async () => {},
    });

    await service.restorePlayerFromSession("u1", "u1", 0, 5000, {
      connected: false,
      sittingOut: true,
      reconnectTimeoutMs: 0,
    });

    const player = state.playersById.get("u1");
    expect(player).toBeDefined();
    expect(player!.connected).toBe(false);
    expect(player!.disconnectDeadlineTs).toBeGreaterThan(before);
    expect(player!.disconnectDeadlineTs).toBeLessThanOrEqual(
      before + RECONNECT_GRACE_DEFAULT_MS + 1000,
    );
  });

  it("restore with connected:false and reconnectTimeoutMs uses explicit value", async () => {
    const state = new PokerState();
    state.tableId = "table_restore_explicit";
    state.maxSeats = 6;
    state.seats.push("", "", "", "", "", "");
    const before = Date.now();
    const explicitMs = 5 * 60_000;

    const service = new PlayerLifecycleService({
      state,
      persistence: { enabled: false } as any,
      pendingSeatReleaseUserIds: new Set(),
      autoActionsByUserId: new Map(),
      currentHandAutoActedUserIds: new Set(),
      getHoleCardsByPlayerId: () => new Map(),
      ensurePlayerPersistence: async () => {},
    });

    await service.restorePlayerFromSession("u1", "u1", 0, 5000, {
      connected: false,
      sittingOut: true,
      reconnectTimeoutMs: explicitMs,
    });

    const player = state.playersById.get("u1");
    expect(player).toBeDefined();
    expect(player!.disconnectDeadlineTs).toBeGreaterThanOrEqual(before + explicitMs - 100);
    expect(player!.disconnectDeadlineTs).toBeLessThanOrEqual(before + explicitMs + 1000);
  });
});
