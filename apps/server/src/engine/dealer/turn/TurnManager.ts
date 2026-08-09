import assert from "node:assert";

import { logger } from "../../../lib/logger.js";
import type { ActionPayload } from "@poker-champ/realtime-contract";
import type { PokerState } from "../../../state/PokerState.js";
import { PokerError, isSkippableActionRejection } from "../../errors.js";
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
  source?: string;
  enqueuedBy?: string;
  beforeStart?: () => boolean;
  execute: () => Promise<void>;
};

type AutoActionProbeSnapshot = {
  userId: string;
  action: string;
  enqueuedHandId: string | null;
  beforeStartCalled: boolean;
  beforeStartResult: boolean | null;
  beforeStartCurrentHandId: string | null;
  beforeStartToActSeat: number | null;
  beforeStartToActUserId: string | null;
  beforeStartNextStepOwner: string | null;
  actorConnectedAtBeforeStart: boolean | null;
  actorNeedsActionAtBeforeStart: boolean | null;
  staleReasonAtBeforeStart: string | null;
  executeTopCurrentHandId: string | null;
  executeTopToActSeat: number | null;
  executeTopToActUserId: string | null;
  executeTopNextStepOwner: string | null;
  actorConnectedAtExecuteTop: boolean | null;
  actorNeedsActionAtExecuteTop: boolean | null;
  staleReasonAtExecuteTop: string | null;
  finalPhase:
    | "enqueued"
    | "before_start"
    | "before_start_discarded"
    | "started"
    | "execute_top"
    | "discarded"
    | "completed";
  ts: number;
};

type QueueWorkSource = "player_action" | "serialized_mutation" | "queued_internal_work";

type QueueItemMetadata = {
  id: number;
  source: QueueWorkSource;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  handId: string | null;
  enqueuedBy: string | null;
  nextStepOwnerAtEnqueue?: string | null;
  streetAtEnqueue?: PokerState["street"] | null;
  toActSeatAtEnqueue?: number | null;
  toActUserIdAtEnqueue?: string | null;
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
  private nextQueueItemId = 1;
  private currentQueueItem: QueueItemMetadata | null = null;
  private lastQueueTransition:
    | {
        phase: "enqueued" | "started" | "completed";
        at: number;
        item: QueueItemMetadata;
      }
    | null = null;

  getPendingCount(): number {
    return this.pendingActionCount;
  }

  getCurrentQueueItem(): Record<string, unknown> | null {
    if (!this.currentQueueItem) return null;
    return {
      ...this.currentQueueItem,
      ageMs: Date.now() - this.currentQueueItem.enqueuedAt,
      waitMs:
        typeof this.currentQueueItem.startedAt === "number"
          ? this.currentQueueItem.startedAt - this.currentQueueItem.enqueuedAt
          : null,
      runMs:
        typeof this.currentQueueItem.startedAt === "number"
          ? Date.now() - this.currentQueueItem.startedAt
          : null,
    };
  }

  getLastQueueTransition(): Record<string, unknown> | null {
    if (!this.lastQueueTransition) return null;
    const { item } = this.lastQueueTransition;
    return {
      phase: this.lastQueueTransition.phase,
      at: this.lastQueueTransition.at,
      ageMs: Date.now() - this.lastQueueTransition.at,
      item: {
        ...item,
        waitMs:
          typeof item.startedAt === "number"
            ? item.startedAt - item.enqueuedAt
            : null,
        runMs:
          typeof item.startedAt === "number"
            ? (typeof item.completedAt === "number" ? item.completedAt : Date.now()) - item.startedAt
            : null,
      },
    };
  }

  constructor(private readonly deps: {
    state: PokerState;
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
    const item = this.createQueueItem("player_action", {});
    this.recordQueueTransition("enqueued", item);
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
        this.recordQueueTransition("started", item);
        try {
          await work();
        } finally {
          this.logSlowTask("player_action", startedAt);
          this.pendingActionCount--;
          this.recordQueueTransition("completed", item);
        }
      });
    this.queue = queued;
    return queued;
  }

  enqueueSerializedStateMutation(work: () => Promise<void>): Promise<void> {
    if (this.deps.isDisposed()) return Promise.resolve();
    const item = this.createQueueItem("serialized_mutation", {});
    this.recordQueueTransition("enqueued", item);
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
        this.recordQueueTransition("started", item);
        try {
          return await work();
        } finally {
          this.logSlowTask("serialized_mutation", startedAt);
          this.recordQueueTransition("completed", item);
        }
      });
    this.queue = queued;
    return queued;
  }

  enqueueInternalWork(workItem: QueuedInternalWorkItem): Promise<void> {
    if (this.deps.isDisposed()) return Promise.resolve();
    const item = this.createQueueItem("queued_internal_work", {
      handId: workItem.handId,
      enqueuedBy: workItem.enqueuedBy ?? null,
    });
    this.recordQueueTransition("enqueued", item);
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
        if (workItem.beforeStart && workItem.beforeStart() === false) {
          this.recordQueueTransition("completed", item);
          return;
        }
        const startedAt = Date.now();
        this.recordQueueTransition("started", item);
        try {
          await workItem.execute();
        } catch (err) {
          // Swallow — internal work failures must never poison the queue.
          // The dispatcher's own .catch() handles per-action error reporting.
          logger.warn({ err, handId: workItem.handId }, "INTERNAL_WORK_FAILED");
        } finally {
          this.logSlowTask("queued_internal_work", startedAt, { handId: workItem.handId });
          this.recordQueueTransition("completed", item);
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

  private createQueueItem(
    source: QueueWorkSource,
    overrides?: {
      handId?: string | null;
      enqueuedBy?: string | null;
    },
  ): QueueItemMetadata {
    const toActSeat = this.deps.state.toActSeat;
    const toActUserId = toActSeat >= 0 ? (this.deps.state.seats[toActSeat] ?? null) : null;
    return {
      id: this.nextQueueItemId++,
      source,
      enqueuedAt: Date.now(),
      handId: overrides?.handId ?? this.deps.state.handId ?? null,
      enqueuedBy: overrides?.enqueuedBy ?? null,
      streetAtEnqueue: this.deps.state.street,
      toActSeatAtEnqueue: toActSeat,
      toActUserIdAtEnqueue: toActUserId,
    };
  }

  private recordQueueTransition(phase: "enqueued" | "started" | "completed", item: QueueItemMetadata): void {
    const at = Date.now();
    if (phase === "started") {
      item.startedAt = at;
    } else if (phase === "completed") {
      item.completedAt = at;
    }
    this.lastQueueTransition = {
      phase,
      at,
      item,
    };
    if (phase === "started") {
      this.currentQueueItem = item;
      return;
    }
    if (phase === "completed" && this.currentQueueItem?.id === item.id) {
      this.currentQueueItem = null;
    }
  }
}

class AutoActionDispatcher {
  private pendingDelayTimeoutIds = new Set<ReturnType<typeof setTimeout>>();
  private lastAutoActionProbe: AutoActionProbeSnapshot | null = null;
  // Tracks decision-points (handId+street+handActionSeq+toActSeat) that already have an
  // auto-action enqueued and not yet resolved. Without this, a driver that calls
  // maybeActForBot repeatedly while the queued action is still pending (e.g. ticks,
  // retries, or the engine's own natural churn) re-enqueues a duplicate every time --
  // each duplicate captures its own turn token, and by the time an earlier one reaches
  // beforeStart, real intervening game activity has usually already changed
  // handActionSeq, so most of the flood gets discarded as stale (TurnTokenUtil.staleReason)
  // instead of any single attempt getting a fair, uncontested chance to land. Skipping the
  // enqueue when one is already in flight for the exact same decision point fixes that at
  // the source; the entry clears once that attempt resolves (applied or discarded), so a
  // genuinely new decision point (different handActionSeq) is never blocked.
  private pendingAutoActionTokenKeys = new Set<string>();

  private static tokenKey(token: QueuedTurnToken): string {
    return `${token.handId}:${token.street}:${token.handActionSeq}:${token.toActSeat}`;
  }

  constructor(private readonly deps: {
    state: PokerState;
    actionQueue: ActionQueue;
    emitDiagnostic: (event: TurnManagerDiagnosticEvent) => void;
    buildDiagnosticContext: (context?: Record<string, unknown>) => Record<string, unknown>;
    handleInternalAction: (userId: string, payload: ActionPayload) => Promise<void>;
    driveGame?: (reason: string) => Promise<void>;
    onAutoActionDiscarded?: () => void;
  }) {}

  getLastAutoActionProbe(): Record<string, unknown> | null {
    return this.lastAutoActionProbe ? { ...this.lastAutoActionProbe } : null;
  }

  private snapshotCurrentAutoActionState(): {
    currentHandId: string | null;
    toActSeat: number | null;
    toActUserId: string | null;
    nextStepOwner: string | null;
    actorConnected: boolean | null;
    actorNeedsAction: boolean | null;
  } {
    const { state } = this.deps;
    const toActSeat = state.toActSeat;
    const toActUserId = toActSeat >= 0 ? (state.seats[toActSeat] ?? null) : null;
    const actor = toActUserId ? state.playersById.get(toActUserId) : undefined;
    return {
      currentHandId: state.handId ?? null,
      toActSeat,
      toActUserId,
      nextStepOwner: (state as PokerState & { nextStepOwner?: string | null }).nextStepOwner ?? null,
      actorConnected: actor?.connected ?? null,
      actorNeedsAction: actor?.needsAction ?? null,
    };
  }

  private captureAutoActionProbe(args: {
    phase: AutoActionProbeSnapshot["finalPhase"];
    userId: string;
    action: string;
    enqueuedHandId: string | null;
    beforeStartCalled?: boolean;
    beforeStartResult?: boolean | null;
    staleReasonAtBeforeStart?: string | null;
    staleReasonAtExecuteTop?: string | null;
  }): void {
    const snapshot = this.snapshotCurrentAutoActionState();
    const existing = this.lastAutoActionProbe;
    const next: AutoActionProbeSnapshot = existing && existing.userId === args.userId && existing.action === args.action
      ? { ...existing }
      : {
          userId: args.userId,
          action: args.action,
          enqueuedHandId: args.enqueuedHandId,
          beforeStartCalled: false,
          beforeStartResult: null,
          beforeStartCurrentHandId: null,
          beforeStartToActSeat: null,
          beforeStartToActUserId: null,
          beforeStartNextStepOwner: null,
          actorConnectedAtBeforeStart: null,
          actorNeedsActionAtBeforeStart: null,
          staleReasonAtBeforeStart: null,
          executeTopCurrentHandId: null,
          executeTopToActSeat: null,
          executeTopToActUserId: null,
          executeTopNextStepOwner: null,
          actorConnectedAtExecuteTop: null,
          actorNeedsActionAtExecuteTop: null,
          staleReasonAtExecuteTop: null,
          finalPhase: "enqueued",
          ts: Date.now(),
        };

    if (args.phase === "before_start" || args.phase === "before_start_discarded") {
      next.beforeStartCalled = args.beforeStartCalled ?? true;
      next.beforeStartResult = args.beforeStartResult ?? null;
      next.beforeStartCurrentHandId = snapshot.currentHandId;
      next.beforeStartToActSeat = snapshot.toActSeat;
      next.beforeStartToActUserId = snapshot.toActUserId;
      next.beforeStartNextStepOwner = snapshot.nextStepOwner;
      next.actorConnectedAtBeforeStart = snapshot.actorConnected;
      next.actorNeedsActionAtBeforeStart = snapshot.actorNeedsAction;
      next.staleReasonAtBeforeStart = args.staleReasonAtBeforeStart ?? null;
    }

    if (args.phase === "execute_top" || args.phase === "started" || args.phase === "discarded" || args.phase === "completed") {
      next.executeTopCurrentHandId = snapshot.currentHandId;
      next.executeTopToActSeat = snapshot.toActSeat;
      next.executeTopToActUserId = snapshot.toActUserId;
      next.executeTopNextStepOwner = snapshot.nextStepOwner;
      next.actorConnectedAtExecuteTop = snapshot.actorConnected;
      next.actorNeedsActionAtExecuteTop = snapshot.actorNeedsAction;
      next.staleReasonAtExecuteTop = args.staleReasonAtExecuteTop ?? next.staleReasonAtExecuteTop;
    }

    next.finalPhase = args.phase;
    next.ts = Date.now();
    this.lastAutoActionProbe = next;
  }

  enqueueInternalAction(userId: string, payload: ActionPayload, delayMs = 0): void {
    const { state } = this.deps;
    const enqueuedHandId = state.handId;
    this.captureAutoActionProbe({
      phase: "enqueued",
      userId,
      action: payload.action,
      enqueuedHandId: enqueuedHandId ?? null,
    });
    logger.info(
      this.deps.buildDiagnosticContext({ userId, action: payload.action, delayMs }),
      "INTERNAL_WORK_ENQUEUED",
    );
    const turnToken = TurnTokenUtil.capture(state, userId);
    const tokenKey = turnToken ? AutoActionDispatcher.tokenKey(turnToken) : null;
    if (tokenKey && this.pendingAutoActionTokenKeys.has(tokenKey)) {
      return;
    }
    if (tokenKey) this.pendingAutoActionTokenKeys.add(tokenKey);
    // CRITICAL INVARIANT:
    // Any delay for queued auto/internal work must happen before enqueueing.
    // Sleeping inside the serialized queue starves later player actions.
    const enqueueWork = () => {
      this.deps.actionQueue.enqueueInternalWork({
        handId: enqueuedHandId ?? null,
        source: `AUTO_ACTION:${payload.action}`,
        enqueuedBy: userId,
        beforeStart: () => {
  const staleReasonAtBeforeStart =
    (enqueuedHandId && this.deps.state.handId !== enqueuedHandId)
      ? "HAND_ID_CHANGED"
      : TurnTokenUtil.staleReason(this.deps.state, turnToken);

  const p = this.deps.state.playersById.get(userId);
  const reconnected =
    !staleReasonAtBeforeStart && !!p && p.kind !== "BOT" && p.connected;

  const beforeStartResult = !staleReasonAtBeforeStart && !reconnected;

  const discardReason =
    staleReasonAtBeforeStart ?? (reconnected ? "PLAYER_RECONNECTED" : null);

  // probe first (keep this)
  this.captureAutoActionProbe({
    phase: beforeStartResult ? "before_start" : "before_start_discarded",
    userId,
    action: payload.action,
    enqueuedHandId: enqueuedHandId ?? null,
    beforeStartCalled: true,
    beforeStartResult,
    staleReasonAtBeforeStart: discardReason,
  });
  // 🔥 NOW emit discard side effects
  if (!beforeStartResult) {
    logger.info(
      this.deps.buildDiagnosticContext({
        userId,
        action: payload.action,
        staleReason: discardReason,
      }),
      "AUTO_ACTION_DISCARDED",
    );

    this.deps.emitDiagnostic({
      level: "warn",
      type: staleReasonAtBeforeStart
        ? "QUEUED_AUTO_ACTION_STALE_DISCARDED"
        : "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED",
      message: "Queued auto-action discarded before start",
      context: this.deps.buildDiagnosticContext({
        userId,
        action: payload.action,
        staleReason: discardReason,
        token: turnToken ?? null,
      }),
    });

    if (this.deps.onAutoActionDiscarded) {
      this.deps.onAutoActionDiscarded();
      logger.info(
        this.deps.buildDiagnosticContext({ userId }),
        "AUTO_ACTION_REDRIVE_TRIGGERED",
      );
    }
  }

  // Discarded before ever executing -- release the slot so the next maybeActForBot
  // drive can enqueue fresh for whatever the (now-changed) decision point actually is.
  if (!beforeStartResult && tokenKey) this.pendingAutoActionTokenKeys.delete(tokenKey);

  return beforeStartResult;
},
        execute: async () => {
          try {
          const staleReasonAtExecuteTop = TurnTokenUtil.staleReason(this.deps.state, turnToken);
          this.captureAutoActionProbe({
            phase: "execute_top",
            userId,
            action: payload.action,
            enqueuedHandId: enqueuedHandId ?? null,
            beforeStartCalled: true,
            beforeStartResult: true,
            staleReasonAtExecuteTop,
          });
          logger.info(
            this.deps.buildDiagnosticContext({ userId, action: payload.action }),
            "INTERNAL_WORK_STARTED",
          );
          this.captureAutoActionProbe({
            phase: "started",
            userId,
            action: payload.action,
            enqueuedHandId: enqueuedHandId ?? null,
            beforeStartCalled: true,
            beforeStartResult: true,
            staleReasonAtExecuteTop,
          });

          if (enqueuedHandId && this.deps.state.handId !== enqueuedHandId) {
            this.captureAutoActionProbe({
              phase: "discarded",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
              staleReasonAtExecuteTop: "HAND_ID_CHANGED",
            });
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
            this.captureAutoActionProbe({
              phase: "discarded",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
              staleReasonAtExecuteTop: staleReason,
            });
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
            this.captureAutoActionProbe({
              phase: "discarded",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
              staleReasonAtExecuteTop: "PLAYER_RECONNECTED",
            });
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
            this.captureAutoActionProbe({
              phase: "discarded",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
              staleReasonAtExecuteTop: eligibilityError,
            });
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
            this.captureAutoActionProbe({
              phase: "discarded",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
              staleReasonAtExecuteTop: "NO_LEGAL_OPTIONS",
            });
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
            this.captureAutoActionProbe({
              phase: "completed",
              userId,
              action: payload.action,
              enqueuedHandId: enqueuedHandId ?? null,
              beforeStartCalled: true,
              beforeStartResult: true,
            });
            logger.info({ userId, action: payload.action }, "DRIVE_CALLED_AFTER_AUTO_ACTION");
            if (this.deps.driveGame) {
              void this.deps.actionQueue.enqueueSerializedStateMutation(async () => {
                await this.deps.driveGame?.("AUTO_ACTION_EXECUTED");
              }).catch((err: unknown) => {
                logger.warn(
                  this.deps.buildDiagnosticContext({ userId, action: payload.action, err }),
                  "AUTO_ACTION_EXECUTED_REDRIVE_FAILED",
                );
              });
            }
          } catch (err) {
            logger.warn(
              this.deps.buildDiagnosticContext({ userId, action: payload.action, err }),
              "AUTO_ACTION_FAILED",
            );
            if (isSkippableActionRejection(err)) {
              this.deps.onAutoActionDiscarded?.();
              return;
            }
            throw err;
          }
        } finally {
          // Executed (applied, skippably rejected, or re-thrown) -- release the slot
          // either way so a genuinely new decision point isn't blocked by this one.
          if (tokenKey) this.pendingAutoActionTokenKeys.delete(tokenKey);
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
    this.pendingAutoActionTokenKeys.clear();
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
    return isSkippableActionRejection(err);
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
      state: deps.state,
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

  getCurrentQueueItem(): Record<string, unknown> | null {
    return this.actionQueue.getCurrentQueueItem();
  }

  getLastQueueTransition(): Record<string, unknown> | null {
    return this.actionQueue.getLastQueueTransition();
  }

  getLastAutoActionProbe(): Record<string, unknown> | null {
    return this.autoActionDispatcher.getLastAutoActionProbe();
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
    return isSkippableActionRejection(err);
  }

  private shouldEmitQueueRecoveryDiagnostic(err: unknown): boolean {
    if (this.isSkippableQueuedActionError(err)) return false;
    return !(err instanceof PokerError);
  }
}
