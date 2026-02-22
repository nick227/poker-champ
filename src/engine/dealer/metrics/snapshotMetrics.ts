/**
 * Lightweight metrics to prove SnapshotService CPU win.
 * Under load: equityRefreshes ≪ snapshotsEmitted when memoization works.
 */
const MAX_SAMPLES = 1000;

export const snapshotMetrics = {
  snapshotsEmitted: 0,
  equityRefreshes: 0,
  snapshotBuildMsSamples: [] as number[],

  emitSnapshot(): void {
    this.snapshotsEmitted++;
  },

  recordEquityRefresh(): void {
    this.equityRefreshes++;
  },

  observeBuildMs(ms: number): void {
    this.snapshotBuildMsSamples.push(ms);
    if (this.snapshotBuildMsSamples.length > MAX_SAMPLES) {
      this.snapshotBuildMsSamples.shift();
    }
  },

  getBuildMsMean(): number {
    const s = this.snapshotBuildMsSamples;
    if (s.length === 0) return 0;
    return s.reduce((a, b) => a + b, 0) / s.length;
  },

  reset(): void {
    this.snapshotsEmitted = 0;
    this.equityRefreshes = 0;
    this.snapshotBuildMsSamples = [];
  },
};
