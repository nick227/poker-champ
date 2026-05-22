import { describe, expect, it } from "vitest";
import {
  computeTableLoadPhaseState,
  isTableLoadPhaseTimedOut,
  resolveTableLoadPhase,
  TABLE_SNAPSHOT_WAIT_TIMEOUT_MS,
} from "./tableLoadPhase";

describe("resolveTableLoadPhase", () => {
  it("returns ready when snapshot exists", () => {
    expect(
      resolveTableLoadPhase({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: true,
        connectionStatus: "CONNECTED",
        signals: {},
      }),
    ).toBe("ready");
  });

  it("returns waiting_snapshot when connected after welcome", () => {
    expect(
      resolveTableLoadPhase({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: false,
        connectionStatus: "CONNECTED",
        signals: { welcomeAt: 100 },
      }),
    ).toBe("waiting_snapshot");
  });

  it("returns restoring_session after session restore without snapshot", () => {
    expect(
      resolveTableLoadPhase({
        authHydrated: true,
        hasAuthToken: true,
        hasSnapshot: false,
        connectionStatus: "CONNECTED",
        signals: { sessionRestoreAt: 200, welcomeAt: 100 },
      }),
    ).toBe("restoring_session");
  });
});

describe("isTableLoadPhaseTimedOut", () => {
  it("times out waiting_snapshot after threshold", () => {
    const now = 20_000;
    const started = now - TABLE_SNAPSHOT_WAIT_TIMEOUT_MS - 1;
    expect(
      isTableLoadPhaseTimedOut("waiting_snapshot", started, {}, now),
    ).toBe(true);
  });
});

describe("computeTableLoadPhaseState", () => {
  it("shows recovery when timed out without snapshot", () => {
    const now = 30_000;
    const state = computeTableLoadPhaseState({
      authHydrated: true,
      hasAuthToken: true,
      hasSnapshot: false,
      connectionStatus: "CONNECTED",
      signals: { welcomeAt: 1 },
      phaseStartedAt: 1,
      nowMs: now,
    });
    expect(state.timedOut).toBe(true);
    expect(state.showRecovery).toBe(true);
  });
});
