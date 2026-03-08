import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";

export class DisconnectManager {
  private static readonly DISCONNECT_SWEEP_MS = 10_000;
  private disconnectSweepIntervalId: ReturnType<typeof setInterval> | null = null;
  // Prevent overlapping sweeps when lifecycle operations exceed the sweep interval.
  private sweepRunning = false;

  constructor(private readonly deps: {
    state: PokerState;
    enqueueSerializedStateMutation: (work: () => Promise<void>) => Promise<void>;
    hasClient: (userId: string) => boolean;
    markReconnected: (userId: string) => Promise<void>;
    markAbandoned: (userId: string) => Promise<void>;
  }) {}

  startSweep(): void {
    if (this.disconnectSweepIntervalId != null) return;
    this.disconnectSweepIntervalId = setInterval(() => {
      if (this.sweepRunning) return;
      this.sweepRunning = true;
      void this.deps
        .enqueueSerializedStateMutation(() => this.sweepDisconnectDeadlines())
        .finally(() => {
          this.sweepRunning = false;
        });
    }, DisconnectManager.DISCONNECT_SWEEP_MS);
  }

  stopSweep(): void {
    if (this.disconnectSweepIntervalId == null) return;
    clearInterval(this.disconnectSweepIntervalId);
    this.disconnectSweepIntervalId = null;
    this.sweepRunning = false;
  }

  dispose(): void {
    this.stopSweep();
  }

  private async sweepDisconnectDeadlines(): Promise<void> {
    const now = Date.now();
    const toAbandon: Array<{ userId: string; deadline: number }> = [];
    for (const [userId, player] of this.deps.state.playersById.entries()) {
      if (player.disconnectDeadlineTs <= 0 || now <= player.disconnectDeadlineTs) continue;
      // TODO (DEALER_REFACTOR_PROPOSAL): Clear disconnectDeadlineTs to 0 in the reconnect path so a connected
      // player never has a past deadline; then this branch is unreachable and can be removed.
      if (this.deps.hasClient(userId)) {
        await this.deps.markReconnected(userId);
        continue;
      }
      toAbandon.push({ userId, deadline: player.disconnectDeadlineTs });
    }
    for (const item of toAbandon) {
      try {
        await this.deps.markAbandoned(item.userId);
      } catch (err) {
        logger.warn({ err, userId: item.userId, deadline: item.deadline }, "disconnect sweep markAbandoned failed");
      }
    }
  }
}
