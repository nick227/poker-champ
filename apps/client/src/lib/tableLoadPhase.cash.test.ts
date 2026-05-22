import { describe, expect, it, vi, afterEach } from "vitest";
import {
  computeTableLoadPhaseState,
  logTableLoadEvent,
  shouldShowTableLoadRecovery,
} from "./tableLoadPhase";

describe("cash table load recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows recovery UI after snapshot wait timeout without tournament", () => {
    const now = 20_000;
    const state = computeTableLoadPhaseState({
      authHydrated: true,
      hasAuthToken: true,
      hasSnapshot: false,
      connectionStatus: "CONNECTED",
      signals: { welcomeAt: 1 },
      phaseStartedAt: 1,
      nowMs: now,
    });
    expect(state.showRecovery).toBe(true);
    expect(shouldShowTableLoadRecovery(state.phase, state.timedOut, false)).toBe(true);
  });

  it("logs cash_table_recovery_unavailable", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logTableLoadEvent("cash_table_recovery_unavailable", {
      tableId: "cash_1",
      reason: "no_tournament_ensure_table",
    });
    expect(spy).toHaveBeenCalledWith(
      "[TABLE_LOAD] cash_table_recovery_unavailable",
      expect.objectContaining({ tableId: "cash_1" }),
    );
  });
});
