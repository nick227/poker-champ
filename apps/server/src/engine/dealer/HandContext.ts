import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionServiceLastAction } from "./services/ActionService.js";
import type { SessionPlayerStatsTracker } from "./services/SessionPlayerStatsTracker.js";

/**
 * Hand-scoped state: one instance per active hand. Created at HAND_START, cleared when transitioning to WAITING.
 * Owns hole cards, starting stacks, preflop flags, action dedup state, and lastAction for the hand.
 */
export class HandContext {
  readonly holeCardsByPlayerId = new Map<string, string[]>();
  readonly handStartingStacksByPlayerId = new Map<string, number>();
  readonly preflopFlagsByUserId = new Map<string, { vpip: boolean; pfr: boolean }>();
  readonly processedActionKeys = new Set<string>();
  readonly actionIdFirstClaimByKey = new Map<string, string>();
  readonly warnedCrossUserCollisionKeys = new Set<string>();

  /** Last action this hand; used in snapshots during the hand. */
  lastAction: TableSnapshotPayload["lastAction"] | undefined = undefined;

  isDuplicate(actionKey: string): boolean {
    return this.processedActionKeys.has(actionKey);
  }

  recordProcessed(actionKey: string): void {
    this.processedActionKeys.add(actionKey);
  }

  /**
   * Records claim for actionId; returns true if a different user already claimed (caller should log).
   */
  recordClaimAndWarnIfCollision(claimKey: string, userId: string): boolean {
    const first = this.actionIdFirstClaimByKey.get(claimKey);
    if (!first) {
      this.actionIdFirstClaimByKey.set(claimKey, userId);
      return false;
    }
    if (first === userId) return false;
    if (this.warnedCrossUserCollisionKeys.has(claimKey)) return false;
    this.warnedCrossUserCollisionKeys.add(claimKey);
    return true;
  }

  /** Call at HAND_START for dealt-in players. */
  initPreflopFlags(dealtInUserIds: Iterable<string>): void {
    this.preflopFlagsByUserId.clear();
    for (const userId of dealtInUserIds) {
      this.preflopFlagsByUserId.set(userId, { vpip: false, pfr: false });
    }
  }

  /** Apply after an action in PREFLOP; uses roundBetBefore (captured before execution). */
  recordActionForPreflopStats(
    userId: string,
    lastAction: ActionServiceLastAction,
    roundBetBefore: number,
    getPlayerRoundBetCents: (userId: string) => number,
  ): void {
    const flags = this.preflopFlagsByUserId.get(userId);
    if (!flags) return;
    const { action, amountCents, raiseToCents } = lastAction;
    const voluntary =
      (action === "CALL" || action === "BET" || action === "RAISE" || action === "ALL_IN") &&
      amountCents > 0;
    if (voluntary) flags.vpip = true;
    const newRoundBet = getPlayerRoundBetCents(userId);
    const isRaise =
      action === "RAISE" ||
      (action === "ALL_IN" && newRoundBet > roundBetBefore) ||
      (raiseToCents !== undefined && raiseToCents > roundBetBefore);
    if (isRaise) flags.pfr = true;
  }

  /** Call before emitting HAND_END snapshot; records to session stats and clears preflop flags. */
  flushPreflopFlagsToSessionStats(tracker: SessionPlayerStatsTracker): void {
    for (const userId of this.holeCardsByPlayerId.keys()) {
      const flags = this.preflopFlagsByUserId.get(userId) ?? { vpip: false, pfr: false };
      tracker.recordHandForUser(userId, { dealtIn: true, vpip: flags.vpip, pfr: flags.pfr });
    }
    this.preflopFlagsByUserId.clear();
  }
}
