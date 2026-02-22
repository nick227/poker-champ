import { describe, expect, it, vi } from "vitest";
import { snapshotMetrics } from "../snapshotMetrics.js";

describe("snapshotMetrics", () => {
  it("tracks snapshotsEmitted and equityRefreshes", () => {
    snapshotMetrics.reset();
    expect(snapshotMetrics.snapshotsEmitted).toBe(0);
    expect(snapshotMetrics.equityRefreshes).toBe(0);

    snapshotMetrics.emitSnapshot();
    snapshotMetrics.emitSnapshot();
    snapshotMetrics.recordEquityRefresh();

    expect(snapshotMetrics.snapshotsEmitted).toBe(2);
    expect(snapshotMetrics.equityRefreshes).toBe(1);
  });

  it("records build ms samples", () => {
    snapshotMetrics.reset();
    snapshotMetrics.observeBuildMs(5);
    snapshotMetrics.observeBuildMs(10);

    expect(snapshotMetrics.getBuildMsMean()).toBe(7.5);
  });

  it("under load: equityRefreshes is much less than snapshotsEmitted when memoization works", () => {
    snapshotMetrics.reset();
    for (let i = 0; i < 100; i++) {
      snapshotMetrics.emitSnapshot();
    }
    snapshotMetrics.recordEquityRefresh();
    snapshotMetrics.recordEquityRefresh();

    expect(snapshotMetrics.snapshotsEmitted).toBe(100);
    expect(snapshotMetrics.equityRefreshes).toBe(2);
    expect(snapshotMetrics.equityRefreshes).toBeLessThan(snapshotMetrics.snapshotsEmitted);
  });
});
