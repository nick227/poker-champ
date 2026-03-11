/**
 * Lightweight in-process runtime observability for dealer health signals.
 * This is intentionally dependency-free so it can be consumed from core paths.
 */
class DealerRuntimeMetrics {
  private readonly startedAtMs = Date.now();
  private tableStalled = 0;
  private tableStallRecoveryRedrive = 0;
  private handsStarted = 0;
  private handsCompleted = 0;
  private actionRejected = 0;
  private actionRejectedByCode = new Map<string, number>();
  private turnTimeoutFired = 0;
  private actionProcessMsSamples = 0;
  private actionProcessMsSum = 0;
  private actionProcessMsMax = 0;
  private queueDepthSamples = 0;
  private queueDepthSum = 0;
  private queueDepthMax = 0;
  private decisionParitySamples = 0;
  private decisionParityMismatch = 0;

  recordTableStalled(): void {
    this.tableStalled += 1;
  }

  recordTableStallRecoveryRedrive(): void {
    this.tableStallRecoveryRedrive += 1;
  }

  recordHandStarted(): void {
    this.handsStarted += 1;
  }

  recordHandCompleted(): void {
    this.handsCompleted += 1;
  }

  recordActionRejected(code: string): void {
    this.actionRejected += 1;
    this.actionRejectedByCode.set(code, (this.actionRejectedByCode.get(code) ?? 0) + 1);
  }

  recordTurnTimeoutFired(): void {
    this.turnTimeoutFired += 1;
  }

  observeActionProcessMs(ms: number): void {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    this.actionProcessMsSamples += 1;
    this.actionProcessMsSum += safeMs;
    if (safeMs > this.actionProcessMsMax) this.actionProcessMsMax = safeMs;
  }

  observeQueueDepth(depth: number): void {
    const safeDepth = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0;
    this.queueDepthSamples += 1;
    this.queueDepthSum += safeDepth;
    if (safeDepth > this.queueDepthMax) this.queueDepthMax = safeDepth;
  }

  observeDecisionParity(match: boolean): void {
    this.decisionParitySamples += 1;
    if (!match) this.decisionParityMismatch += 1;
  }

  snapshotAndReset(): {
    tableStalled: number;
    tableStallRecoveryRedrive: number;
    handsStarted: number;
    handsCompleted: number;
    handsPerMinute: number;
    actionRejected: number;
    actionRejectedByCode: Record<string, number>;
    turnTimeoutFired: number;
    actionProcessMsSamples: number;
    actionProcessMsMean: number;
    actionProcessMsMax: number;
    queueDepthSamples: number;
    queueDepthMean: number;
    queueDepthMax: number;
    decisionParitySamples: number;
    decisionParityMismatch: number;
  } {
    const out = this.snapshot();
    this.reset();
    return out;
  }

  snapshot(): {
    tableStalled: number;
    tableStallRecoveryRedrive: number;
    handsStarted: number;
    handsCompleted: number;
    handsPerMinute: number;
    actionRejected: number;
    actionRejectedByCode: Record<string, number>;
    turnTimeoutFired: number;
    actionProcessMsSamples: number;
    actionProcessMsMean: number;
    actionProcessMsMax: number;
    queueDepthSamples: number;
    queueDepthMean: number;
    queueDepthMax: number;
    decisionParitySamples: number;
    decisionParityMismatch: number;
  } {
    const actionRejectedByCode = Object.fromEntries(this.actionRejectedByCode.entries());
    const elapsedMinutes = Math.max((Date.now() - this.startedAtMs) / 60_000, 1 / 60_000);
    return {
      tableStalled: this.tableStalled,
      tableStallRecoveryRedrive: this.tableStallRecoveryRedrive,
      handsStarted: this.handsStarted,
      handsCompleted: this.handsCompleted,
      handsPerMinute: this.handsCompleted / elapsedMinutes,
      actionRejected: this.actionRejected,
      actionRejectedByCode,
      turnTimeoutFired: this.turnTimeoutFired,
      actionProcessMsSamples: this.actionProcessMsSamples,
      actionProcessMsMean: this.actionProcessMsSamples > 0 ? this.actionProcessMsSum / this.actionProcessMsSamples : 0,
      actionProcessMsMax: this.actionProcessMsMax,
      queueDepthSamples: this.queueDepthSamples,
      queueDepthMean: this.queueDepthSamples > 0 ? this.queueDepthSum / this.queueDepthSamples : 0,
      queueDepthMax: this.queueDepthMax,
      decisionParitySamples: this.decisionParitySamples,
      decisionParityMismatch: this.decisionParityMismatch,
    };
  }

  private reset(): void {
    this.tableStalled = 0;
    this.tableStallRecoveryRedrive = 0;
    this.handsStarted = 0;
    this.handsCompleted = 0;
    this.actionRejected = 0;
    this.actionRejectedByCode.clear();
    this.turnTimeoutFired = 0;
    this.actionProcessMsSamples = 0;
    this.actionProcessMsSum = 0;
    this.actionProcessMsMax = 0;
    this.queueDepthSamples = 0;
    this.queueDepthSum = 0;
    this.queueDepthMax = 0;
    this.decisionParitySamples = 0;
    this.decisionParityMismatch = 0;
  }
}

export const dealerRuntimeMetrics = new DealerRuntimeMetrics();
