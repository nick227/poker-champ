import assert from "node:assert";

import { logger } from "../../../lib/logger.js";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import type { PokerState } from "../../../state/PokerState.js";
import { PokerError } from "../../errors.js";
import {
  bettingRoundComplete,
  eligibleToAct,
  noFurtherBettingPossible,
} from "../../rules/BettingRound.js";
import { TURN_TIMEOUT_TOTAL_MS } from "../timing.js";
import { dealerRuntimeMetrics } from "../metrics/dealerRuntimeMetrics.js";

type QueuedTurnToken = {
  handId: string;
  street: PokerState["street"];
  handActionSeq: number;
  toActSeat: number;
  toActUserId: string;
  actorSeat: number;
};

type TurnManagerDiagnosticEvent = {
  level: "warn" | "error";
  type:
    | "QUEUE_FULL"
    | "QUEUE_RECOVERY_AFTER_FAILURE"
    | "QUEUED_AUTO_ACTION_STALE_DISCARDED"
    | "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED"
    | "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED"
    | "QUEUED_AUTO_ACTION_FAILED";
  message: string;
  code?: string;
  context?: Record<string, unknown>;
};

type TurnManagerDeps = {
  state: PokerState;
  maxQueueDepth: number;
  isDisposed: () => boolean;
  emitDiagnostic: (event: TurnManagerDiagnosticEvent) => void;
  buildDiagnosticContext: (context?: Record<string, unknown>) => Record<string, unknown>;
  handleInternalAction: (userId: string, payload: ActionPayload) => Promise<void>;
  setPlayerSittingOutInternal: (userId: string, sittingOut: boolean) => Promise<void>;
  /** Called when a queued auto-action is discarded so dealer can re-drive (e.g. maybeActForBot). */
  onAutoActionDiscarded?: () => void;
  /** Called to continue engine progression after async state changes */
  driveGame: (reason: string) => Promise<void>;
};

type QueuedInternalWorkItem = {
  handId: string | null;
  execute: () => Promise<void>;
};

class TurnTokenUtil {
  static capture(state: PokerState, userId: string): QueuedTurnToken | null {
    const handId = state.handId;
    const toActSeat = state.toActSeat;
    const toActUserId = state.seats[toActSeat];
    const actor = state.playersById.get(userId);
    if (!handId || !toActUserId || !actor) return null;
    return {
      handId,
      street: state.street,
      handActionSeq: state.handActionSeq,
      toActSeat,
      toActUserId,
      actorSeat: actor.seat,
    };
  }

  static staleReason(state: PokerState, token: QueuedTurnToken | null): string | null {
    if (!token) return "MISSING_ENQUEUE_TURN_TOKEN";
    if (state.handId !== token.handId) return "HAND_ID_CHANGED";
    if (state.street !== token.street) return "STREET_CHANGED";
    if (state.handActionSeq !== token.handActionSeq) return "HAND_ACTION_SEQ_CHANGED";
    if (state.toActSeat !== token.toActSeat) return "TO_ACT_SEAT_CHANGED";
    const currentToActUserId = state.seats[state.toActSeat] ?? "";
    if (currentToActUserId !== token.toActUserId) return "TO_ACT_USER_CHANGED";
    return null;
  }
}

class ActionQueue {
  private queue: Promise<void> = Promise.resolve();
  private pendingActionCount = 0;
  private static readonly SLOW_TASK_MS = 2_000;

  getPendingCount(): number {
    return this.pendingActionCount;
  }

  constructor(private readonly deps: {
    maxQueueDepth: number;
    isDisposed: () => boolean;
    shouldEmitQueueRecoveryDiagnostic: (err: unknown) => boolean;
    emitQueueFullDiagnostic: (context: { queueDepth: number; maxQueueDepth: number }) => void;
    emitQueueRecoveryDiagnostic: (message: string) => void;
  }) {}

  enqueuePlayerAction(work: () => Promise<void>): Promise<void> {
    if (this.deps.isDisposed()) return Promise.resolve();
    if (this.pendingActionCount >= this.deps.maxQueueDepth) {
      this.deps.emitQueueFullDiagnostic({
        queueDepth: this.pendingActionCount,
        maxQueueDepth: this.deps.maxQueueDepth,
      });
      throw new PokerError("QUEUE_FULL", "Action queue full. Retry shortly.", {
        retryAfterSeconds: 2,
        queueDepth: this.pendingActionCount,
        maxQueueDepth: this.deps.maxQueueDepth,
      });
    }

    this.pendingActionCount++;
    const queued = this.queue
      .catch((err) => {
        if (this.deps.shouldEmitQueueRecoveryDiagnostic(err)) {
          logger.warn({ err }, "Recovering dealer queue after prior failure before player action");
          this.deps.emitQueueRecoveryDiagnostic("Recovering dealer queue after prior failure before player action");
        }
      })
      .then(async () => {
        if (!this.assertNotDisposed("player_action")) return;
        const startedAt = Date.now();
        try {
          await work();
        } finally {
          this.logSlowTask("player_action", startedAt);
          this.pendingActionCount--;
        }
      });
    this.queue = queued;
    return queued;
  }

  enqueueSerializedStateMutation(work: () => Promise<void>): Promise<void> {
    if (this.deps.isDisposed()) return Promise.resolve();
    const queued = this.queue
      .catch((err) => {
        if (this.deps.shouldEmitQueueRecoveryDiagnostic(err)) {
          logger.warn({ err }, "Recovering dealer queue after prior failure");
          this.deps.emitQueueRecoveryDiagnostic("Recovering dealer queue after prior failure");
        }
      })
      .then(async () => {
        if (!this.assertNotDisposed("serialized_mutation")) return;
        const startedAt = Date.now();
        try {
          return await work();
        } finally {
          this.logSlowTask("serialized_mutation", startedAt);
        }
      });
    this.queue = queued;
    return queued;
  }

  enqueueInternalWork(workItem: QueuedInternalWorkItem): Promise<void> {
    if (this.deps.isDisposed()) return Promise.resolve();
    const queued = this.queue
      .catch((err) => {
        logger.info({ err }, "INTERNAL_WORK_RECOVERED_QUEUE_CONTINUES");
        if (this.deps.shouldEmitQueueRecoveryDiagnostic(err)) {
          logger.warn({ err }, "Recovering dealer queue after prior failure before internal work");
          this.deps.emitQueueRecoveryDiagnostic("Recovering dealer queue after prior failure before internal work");
        }
      })
      .then(async () => {
        if (!this.assertNotDisposed("queued_internal_work")) return;
        const startedAt = Date.now();
        try {
          await workItem.execute();
        } catch (err) {
          // Swallow — internal work failures must never poison the queue.
          // The dispatcher's own .catch() handles per-action error reporting.
          logger.warn({ err, handId: workItem.handId }, "INTERNAL_WORK_FAILED");
        } finally {
          this.logSlowTask("queued_internal_work", startedAt, { handId: workItem.handId });
        }
      });
    this.queue = queued;
    return queued;
  }

  getQueue(): Promise<void> {
    return this.queue;
  }

  setQueue(queue: Promise<void>): void {
    this.queue = queue;
  }

  private assertNotDisposed(source: string): boolean {
    try {
      assert(!this.deps.isDisposed(), `TurnManager queue executed after dispose (${source})`);
      return true;
    } catch (err) {
      logger.warn({ err, source }, "TURN_MANAGER_DISPOSED_GUARD");
      return false;
    }
  }

  private logSlowTask(source: string, startedAt: number, context?: Record<string, unknown>): void {
    const durationMs = Date.now() - startedAt;
    if (durationMs <= ActionQueue.SLOW_TASK_MS) return;
    logger.warn({ source, durationMs, ...context }, "QUEUE_SLOW_TASK");
  }
}

class AutoActionDispatcher {
  private pendingDelayTimeoutIds = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly deps: {
    state: PokerState;
    actionQueue: ActionQueue;
    emitDiagnostic: (event: TurnManagerDiagnosticEvent) => void;
    buildDiagnosticContext: (context?: Record<string, unknown>) => Record<string, unknown>;
    handleInternalAction: (userId: string, payload: ActionPayload) => Promise<void>;
    driveGame?: (reason: string) => Promise<void>;
    onAutoActionDiscarded?: () => void;
  }) {}

  enqueueInternalAction(userId: string, payload: ActionPayload, delayMs = 0): void {
    const { state } = this.deps;
    const enqueuedHandId = state.handId;
    logger.info(
      this.deps.buildDiagnosticContext({ userId, action: payload.action, delayMs }),
      "INTERNAL_WORK_ENQUEUED",
    );
    const turnToken = TurnTokenUtil.capture(state, userId);
    // CRITICAL INVARIANT:
    // Any delay for queued auto/internal work must happen before enqueueing.
    // Sleeping inside the serialized queue starves later player actions.
    const enqueueWork = () => {
      this.deps.actionQueue.enqueueInternalWork({
        handId: enqueuedHandId ?? null,
        execute: async () => {
          logger.info(
            this.deps.buildDiagnosticContext({ userId, action: payload.action }),
            "INTERNAL_WORK_STARTED",
          );

          if (enqueuedHandId && this.deps.state.handId !== enqueuedHandId) {
            logger.info(
              this.deps.buildDiagnosticContext({
                userId,
                action: payload.action,
                staleReason: "HAND_ID_CHANGED",
                enqueuedHandId,
                currentHandId: this.deps.state.handId,
              }),
              "AUTO_ACTION_DISCARDED",
            );
            this.deps.emitDiagnostic({
              level: "warn",
              type: "QUEUED_AUTO_ACTION_STALE_DISCARDED",
              message: "Queued auto-action discarded because hand changed before execution",
              context: this.deps.buildDiagnosticContext({
                userId,
                action: payload.action,
                staleReason: "HAND_ID_CHANGED",
                enqueuedHandId,
                currentHandId: this.deps.state.handId,
                token: turnToken ?? null,
              }),
            });
            if (this.deps.onAutoActionDiscarded) {
              this.deps.onAutoActionDiscarded();
              logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
            }
            return;
          }

          const staleReason = TurnTokenUtil.staleReason(this.deps.state, turnToken);
          if (staleReason) {
            logger.info(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, staleReason }),
              "AUTO_ACTION_DISCARDED",
            );
            this.deps.emitDiagnostic({
              level: "warn",
              type: "QUEUED_AUTO_ACTION_STALE_DISCARDED",
              message: "Queued auto-action discarded due to stale turn token",
              context: this.deps.buildDiagnosticContext({
                userId,
                action: payload.action,
                staleReason,
                token: turnToken ?? null,
              }),
            });
            if (this.deps.onAutoActionDiscarded) {
              this.deps.onAutoActionDiscarded();
              logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
            }
            return;
          }

          const p = this.deps.state.playersById.get(userId);
          if (p && p.kind !== "BOT" && p.connected) {
            logger.info({ userId, action: payload.action }, "Skipping queued auto-action; player reconnected");
            logger.info(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, reason: "reconnected" }),
              "AUTO_ACTION_DISCARDED",
            );
            this.deps.emitDiagnostic({
              level: "warn",
              type: "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED",
              message: "Queued auto-action skipped because player reconnected",
              context: this.deps.buildDiagnosticContext({ userId, action: payload.action }),
            });
            if (this.deps.onAutoActionDiscarded) {
              this.deps.onAutoActionDiscarded();
              logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
            }
            return;
          }

          const eligibilityError = this.getQueuedAutoActionIneligibleReason(userId);
          if (eligibilityError) {
            logger.info(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, reason: eligibilityError }),
              "AUTO_ACTION_DISCARDED",
            );
            this.deps.emitDiagnostic({
              level: "warn",
              type: "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED",
              message: "Queued auto-action discarded because actor is ineligible",
              context: this.deps.buildDiagnosticContext({
                userId,
                action: payload.action,
                reason: eligibilityError,
              }),
            });
            if (this.deps.onAutoActionDiscarded) {
              this.deps.onAutoActionDiscarded();
              logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
            }
            return;
          }

          const normalized = this.normalizeQueuedAutoAction(userId, payload);
          if (!normalized) {
            logger.info(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, reason: "no_legal_options" }),
              "AUTO_ACTION_DISCARDED",
            );
            this.deps.emitDiagnostic({
              level: "warn",
              type: "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED",
              message: "Queued auto-action discarded because no legal action options were available",
              context: this.deps.buildDiagnosticContext({ userId, action: payload.action }),
            });
            if (this.deps.onAutoActionDiscarded) {
              this.deps.onAutoActionDiscarded();
              logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
            }
            return;
          }
          try {
            await this.deps.handleInternalAction(userId, normalized);
            logger.info({ userId, action: payload.action }, "DRIVE_CALLED_AFTER_AUTO_ACTION");
            if (this.deps.driveGame) {
              void this.deps.actionQueue.enqueueSerializedStateMutation(async () => {
                await this.deps.driveGame?.("AUTO_ACTION_EXECUTED");
              });
            }
          } catch (err) {
            logger.warn(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, err }),
              "AUTO_ACTION_FAILED",
            );
            throw err;
          }
        },
      }).catch((err) => {
        if (this.isSkippableQueuedActionError(err)) {
          logger.warn(
            { err, userId, action: payload.action, street: this.deps.state.street },
            "Queued auto-action skipped after state changed",
          );
          logger.info(
            this.deps.buildDiagnosticContext({ userId, action: payload.action }),
            "AUTO_ACTION_FAILED",
          );
          const code = err instanceof PokerError ? err.code : undefined;
          this.deps.emitDiagnostic({
            level: "warn",
            type: "QUEUED_AUTO_ACTION_STALE_DISCARDED",
            message: "Queued auto-action skipped after state changed",
            code,
            context: this.deps.buildDiagnosticContext({ userId, action: payload.action }),
          });
          this.deps.onAutoActionDiscarded?.();
          logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
          return;
        }
        logger.error({ err, userId, action: payload.action }, "Queued auto-action failed");
        logger.info(
          this.deps.buildDiagnosticContext({ userId, action: payload.action, err }),
          "AUTO_ACTION_FAILED",
        );
        const code = err instanceof PokerError ? err.code : undefined;
        this.deps.emitDiagnostic({
          level: "error",
          type: "QUEUED_AUTO_ACTION_FAILED",
          message: "Queued auto-action failed",
          code,
          context: this.deps.buildDiagnosticContext({ userId, action: payload.action }),
        });
        if (this.deps.onAutoActionDiscarded) {
          this.deps.onAutoActionDiscarded();
          logger.info(this.deps.buildDiagnosticContext({ userId }), "AUTO_ACTION_REDRIVE_TRIGGERED");
        }
      });
    };

    if (delayMs > 0) {
      const timeoutId = setTimeout(() => {
        this.pendingDelayTimeoutIds.delete(timeoutId);
        enqueueWork();
      }, delayMs);
      this.pendingDelayTimeoutIds.add(timeoutId);
      return;
    }

    enqueueWork();
  }

  dispose(): void {
    for (const timeoutId of this.pendingDelayTimeoutIds) {
      clearTimeout(timeoutId);
    }
    this.pendingDelayTimeoutIds.clear();
  }

  private getQueuedAutoActionIneligibleReason(userId: string): string | null {
    if (this.deps.state.street === "WAITING" || this.deps.state.street === "SHOWDOWN") {
      return `STREET_NOT_ACTIONABLE:${this.deps.state.street}`;
    }
    if (bettingRoundComplete(this.deps.state) || noFurtherBettingPossible(this.deps.state)) {
      return "BETTING_ROUND_CLOSED";
    }
    const player = this.deps.state.playersById.get(userId);
    if (!player) return "PLAYER_NOT_FOUND";
    if (player.status !== "ACTIVE") return `PLAYER_NOT_ACTIVE:${player.status}`;
    if (!player.needsAction) return "PLAYER_DOES_NOT_NEED_ACTION";
    if (player.seat !== this.deps.state.toActSeat) {
      return `PLAYER_NOT_TO_ACT:seat=${player.seat};toAct=${this.deps.state.toActSeat}`;
    }
    return null;
  }

  private normalizeQueuedAutoAction(userId: string, payload: ActionPayload): ActionPayload | null {
    const player = this.deps.state.playersById.get(userId);
    if (!player) return null;
    if (!eligibleToAct(player) || !player.needsAction) return null;
    const callAmount = Math.max(0, this.deps.state.roundCurrentBetCents - player.roundBetCents);
    if (payload.action === "CHECK") {
      return callAmount === 0 ? payload : { action: "CALL" };
    }
    if (payload.action === "FOLD") return payload;
    if (payload.action === "CALL") {
      return callAmount > 0 ? payload : { action: "CHECK" };
    }
    return payload;
  }

  private isSkippableQueuedActionError(err: unknown): boolean {
    if (!(err instanceof PokerError)) return false;
    return (
      err.code === "HAND_NOT_STARTED" ||
      err.code === "HAND_ALREADY_FINISHED" ||
      err.code === "NOT_YOUR_TURN" ||
      err.code === "NOT_ELIGIBLE" ||
      err.code === "INVALID_ACTION"
    );
  }
}

class TurnTimeoutScheduler {
  private pendingHumanTurnTimeoutKey: string | null = null;
  private pendingHumanTurnTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private turnStartedAt = 0;

  constructor(private readonly deps: {
    state: PokerState;
    actionQueue: ActionQueue;
    setPlayerSittingOutInternal: (userId: string, sittingOut: boolean) => Promise<void>;
    driveGame: (reason: string) => Promise<void>;
  }) {}

  scheduleHumanTurnTimeout(userId: string): boolean {
    const token = TurnTokenUtil.capture(this.deps.state, userId);
    if (!token || !token.handId) return false;

    const key = `${token.handId}:${token.street}:${token.handActionSeq}:${token.toActSeat}:${token.toActUserId}`;
    if (this.pendingHumanTurnTimeoutKey === key) {
      const deadlinePresent = (this.deps.state.turnDeadlineMs ?? 0) > 0;
      const timeoutPresent = this.pendingHumanTurnTimeoutId != null;
      if (deadlinePresent && timeoutPresent) return true;
      logger.warn(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          toActSeat: this.deps.state.toActSeat,
          userId,
          hasDeadline: deadlinePresent,
          hasTimeoutHandle: timeoutPresent,
        },
        "TURN_TIMER_REARM_SAME_KEY",
      );
    }

    if (this.pendingHumanTurnTimeoutId != null) {
      clearTimeout(this.pendingHumanTurnTimeoutId);
      this.pendingHumanTurnTimeoutId = null;
    }
    this.pendingHumanTurnTimeoutKey = key;
    this.turnStartedAt = Date.now();
    this.deps.state.turnDeadlineMs = this.turnStartedAt + TURN_TIMEOUT_TOTAL_MS;

    this.pendingHumanTurnTimeoutId = setTimeout(() => {
      void this.deps.actionQueue.enqueueSerializedStateMutation(async () => {
        if (this.pendingHumanTurnTimeoutKey !== key) return;

        const staleReason = TurnTokenUtil.staleReason(this.deps.state, token);
        if (staleReason) {
          this.clearPendingTimeoutIfCurrent(key);
          return;
        }

        if (
          this.deps.state.street === "WAITING" ||
          this.deps.state.street === "SHOWDOWN" ||
          bettingRoundComplete(this.deps.state) ||
          noFurtherBettingPossible(this.deps.state)
        ) {
          this.clearPendingTimeoutIfCurrent(key);
          return;
        }

        const player = this.deps.state.playersById.get(userId);
        if (
          !player ||
          player.kind !== "HUMAN" ||
          !player.needsAction ||
          player.seat !== this.deps.state.toActSeat ||
          player.userId !== token.toActUserId
        ) {
          this.clearPendingTimeoutIfCurrent(key);
          return;
        }

        // Idempotency token consumption: clear deadline before applying timeout action.
        this.deps.state.turnDeadlineMs = 0;
        dealerRuntimeMetrics.recordTurnTimeoutFired();
        await this.deps.setPlayerSittingOutInternal(userId, true);
        this.clearPendingTimeoutIfCurrent(key);
        
        // 🔥 CRITICAL: Continue engine progression after timeout sit-out
        await this.deps.driveGame("HUMAN_TIMEOUT_AUTO_SIT_OUT");
      });
    }, TURN_TIMEOUT_TOTAL_MS);
    return true;
  }

  getTurnStartedAt(): number {
    return this.turnStartedAt;
  }

  clearPendingHumanTurnTimeout(): void {
    this.pendingHumanTurnTimeoutKey = null;
    this.turnStartedAt = 0;
    this.deps.state.turnDeadlineMs = 0;
    if (this.pendingHumanTurnTimeoutId != null) {
      clearTimeout(this.pendingHumanTurnTimeoutId);
      this.pendingHumanTurnTimeoutId = null;
    }
  }

  private clearPendingTimeoutIfCurrent(key: string): void {
    if (this.pendingHumanTurnTimeoutKey !== key) return;
    this.pendingHumanTurnTimeoutKey = null;
    this.deps.state.turnDeadlineMs = 0;
    if (this.pendingHumanTurnTimeoutId != null) {
      clearTimeout(this.pendingHumanTurnTimeoutId);
    }
    this.pendingHumanTurnTimeoutId = null;
  }
}

export class TurnManager {
  public readonly actionQueue: ActionQueue;
  private readonly autoActionDispatcher: AutoActionDispatcher;
  private readonly turnTimeoutScheduler: TurnTimeoutScheduler;

  constructor(private readonly deps: TurnManagerDeps) {
    this.actionQueue = new ActionQueue({
      maxQueueDepth: deps.maxQueueDepth,
      isDisposed: deps.isDisposed,
      shouldEmitQueueRecoveryDiagnostic: (err) => this.shouldEmitQueueRecoveryDiagnostic(err),
      emitQueueFullDiagnostic: ({ queueDepth, maxQueueDepth }) => {
        this.deps.emitDiagnostic({
          level: "warn",
          type: "QUEUE_FULL",
          message: "Action queue full. Retry shortly.",
          code: "QUEUE_FULL",
          context: this.deps.buildDiagnosticContext({ queueDepth, maxQueueDepth }),
        });
      },
      emitQueueRecoveryDiagnostic: (message) => {
        this.deps.emitDiagnostic({
          level: "warn",
          type: "QUEUE_RECOVERY_AFTER_FAILURE",
          message,
          context: this.deps.buildDiagnosticContext(),
        });
      },
    });
    this.autoActionDispatcher = new AutoActionDispatcher({
      state: deps.state,
      actionQueue: this.actionQueue,
      emitDiagnostic: deps.emitDiagnostic,
      buildDiagnosticContext: deps.buildDiagnosticContext,
      handleInternalAction: deps.handleInternalAction,
      driveGame: deps.driveGame,
      onAutoActionDiscarded: deps.onAutoActionDiscarded,
    });
    this.turnTimeoutScheduler = new TurnTimeoutScheduler({
      state: deps.state,
      actionQueue: this.actionQueue,
      setPlayerSittingOutInternal: deps.setPlayerSittingOutInternal,
      driveGame: deps.driveGame,
    });
  }

  enqueuePlayerAction(work: () => Promise<void>): Promise<void> {
    return this.actionQueue.enqueuePlayerAction(work);
  }

  enqueueSerializedStateMutation(work: () => Promise<void>): Promise<void> {
    return this.actionQueue.enqueueSerializedStateMutation(work);
  }

  enqueueInternalAction(userId: string, payload: ActionPayload, delayMs = 0): void {
    this.autoActionDispatcher.enqueueInternalAction(userId, payload, delayMs);
  }

  scheduleHumanTurnTimeout(userId: string): boolean {
    return this.turnTimeoutScheduler.scheduleHumanTurnTimeout(userId);
  }

  clearPendingHumanTurnTimeout(): void {
    this.turnTimeoutScheduler.clearPendingHumanTurnTimeout();
  }

  dispose(): void {
    this.autoActionDispatcher.dispose();
    this.turnTimeoutScheduler.clearPendingHumanTurnTimeout();
  }

  getQueueDepth(): number {
    return this.actionQueue.getPendingCount();
  }

  getTurnStartTs(): number {
    return this.turnTimeoutScheduler.getTurnStartedAt();
  }

  getActionQueue(): Promise<void> {
    return this.actionQueue.getQueue();
  }

  setActionQueue(queue: Promise<void>): void {
    this.actionQueue.setQueue(queue);
  }

  private isSkippableQueuedActionError(err: unknown): boolean {
    if (!(err instanceof PokerError)) return false;
    return (
      err.code === "HAND_NOT_STARTED" ||
      err.code === "HAND_ALREADY_FINISHED" ||
      err.code === "NOT_YOUR_TURN" ||
      err.code === "NOT_ELIGIBLE"
    );
  }

  private shouldEmitQueueRecoveryDiagnostic(err: unknown): boolean {
    if (this.isSkippableQueuedActionError(err)) return false;
    return !(err instanceof PokerError);
  }
}
