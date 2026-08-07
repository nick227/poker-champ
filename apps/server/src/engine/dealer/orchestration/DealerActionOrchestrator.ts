import type { Client } from "@colyseus/core";
import type { ActionPayload, TableLastAction } from "@poker-champ/realtime-contract";
import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import { PokerError } from "../../errors.js";
import { maybeAssertBettingState } from "../../invariants/assertBettingState.js";
import { HandContext } from "../HandContext.js";
import type { SnapshotReason } from "../hand/SnapshotService.js";
import { dealerRuntimeMetrics } from "../metrics/dealerRuntimeMetrics.js";
import type { SettlementService } from "../settlement/SettlementService.js";
import type {
  ActionDebitKind,
  ActionResult,
  ActionService,
  ActionServiceLastAction,
} from "../turn/ActionService.js";
import type { TurnManager } from "../turn/TurnManager.js";
import { buildActionKey, buildClaimKey } from "../utils/actionKeys.js";
import type { DealerDiagnosticEvent } from "./DealerDiagnostics.js";
import type { DealerProgressionCoordinator } from "./DealerProgressionCoordinator.js";

type DealerActionOrchestratorDeps = {
  state: PokerState;
  turnManager: TurnManager;
  actionService: ActionService;
  settlementService: SettlementService;
  getCurrentHand: () => HandContext | null;
  ensureCurrentHand: () => HandContext | null;
  setPendingActorRef: (value: { userId: string; client: Client } | null) => void;
  setResolvedActionId: (value: string | undefined) => void;
  getResolvedActionId: () => string | undefined;
  emitDiagnostic: (event: DealerDiagnosticEvent) => void;
  buildDiagnosticContext: (context?: Record<string, unknown>) => Record<string, unknown>;
  handleInternalAction: (
    userId: string,
    msg: ActionPayload,
    origin: TableLastAction["origin"],
    actionId?: string,
  ) => Promise<void>;
  applyActionResult: (
    result: ActionResult,
    options?: { turnAdvancedReason?: SnapshotReason; requestDriveAfterTurnAdvanced?: boolean },
  ) => Promise<void>;
  setLastActionFromExecution: (lastAction: ActionServiceLastAction | undefined) => void;
  updatePreflopFlagsAfterAction: (
    userId: string,
    lastAction: ActionServiceLastAction,
    roundBetBefore: number,
  ) => void;
  sendTableSnapshotToAll: (reason: SnapshotReason) => Promise<void>;
  progression: Pick<DealerProgressionCoordinator, "requestDrive">;
  reconcileAutomationOwnershipAfterTurnAdvancedWithoutDrive: () => void;
  reconcilePostActionLifecycleIfNeeded: (kind: "HAND_FINISHED" | "STREET_COMPLETE") => Promise<void>;
  logActionResolvedNextActor: () => void;
  recordLastAcceptedActionSnapshot: (args: {
    handId: string;
    userId: string;
    action: string;
    amountCents: number | null;
  }) => void;
  hasActiveTerminalLifecycleForCurrentHand: () => boolean;
};

export class DealerActionOrchestrator {
  constructor(private readonly deps: DealerActionOrchestratorDeps) {}

  async handleAction(
    userId: string,
    msg: ActionPayload,
    actionId?: string,
    actorClient?: Client,
  ): Promise<void> {
    const currentHandIdAtEnqueue = this.deps.state.handId ?? null;
    const queuedAt = Date.now();
    return this.deps.turnManager.enqueuePlayerAction(async () => {
      const queueDelayMs = Date.now() - queuedAt;
      if (queueDelayMs > 100) {
        logger.warn(
          {
            tableId: this.deps.state.tableId,
            handId: this.deps.state.handId,
            userId,
            action: msg.action,
            actionId,
            delay: queueDelayMs,
            queueDepth: this.deps.turnManager.getQueueDepth(),
          },
          "ACTION_QUEUE_DELAY",
        );
      }
      try {
        if (currentHandIdAtEnqueue && this.deps.state.handId !== currentHandIdAtEnqueue) {
          logger.warn(
            {
              tableId: this.deps.state.tableId,
              handId: this.deps.state.handId,
              userId,
              actionId,
              enqueuedHandId: currentHandIdAtEnqueue,
              currentHandId: this.deps.state.handId,
              street: this.deps.state.street,
            },
            "ACTION_DROPPED_HAND_CHANGED",
          );
          return;
        }
        this.deps.ensureCurrentHand();
        this.deps.setPendingActorRef(actorClient ? { userId, client: actorClient } : null);
        // handContext is read at run time (this.currentHand); currentHandIdAtEnqueue is from enqueue time.
        // If the hand changed in between, sameHand is false and we skip dedup (correct - no record in wrong hand).
        const handContext = this.deps.getCurrentHand();
        const sameHand =
          handContext && currentHandIdAtEnqueue && this.deps.state.handId === currentHandIdAtEnqueue;
        const actionKey =
          actionId && currentHandIdAtEnqueue ? buildActionKey(currentHandIdAtEnqueue, userId, actionId) : null;
        const claimKey =
          actionId && currentHandIdAtEnqueue ? buildClaimKey(currentHandIdAtEnqueue, actionId) : null;
        if (sameHand && claimKey) {
          const claim = handContext!.recordClaimAndWarnIfCollision(claimKey, userId);
          if (claim.collision) {
            if (claim.shouldLog) {
              const firstUserId = handContext!.actionIdFirstClaimByKey.get(claimKey) ?? "";
              const firstSeat = firstUserId
                ? (this.deps.state.playersById.get(firstUserId)?.seat ?? null)
                : null;
              const secondSeat = this.deps.state.playersById.get(userId)?.seat ?? null;
              logger.warn(
                {
                  type: "ACTION_ID_CROSS_USER_COLLISION",
                  handId: currentHandIdAtEnqueue,
                  actionId,
                  firstUserId,
                  firstSeat,
                  secondUserId: userId,
                  secondSeat,
                  userId,
                },
                "ACTION_ID_CROSS_USER_COLLISION",
              );
            }
            logger.warn(
              {
                tableId: this.deps.state.tableId,
                handId: this.deps.state.handId,
                userId,
                actionId,
                action: msg.action,
                reason: "ACTION_ID_CROSS_USER_COLLISION",
              },
              "ACTION_REJECTED",
            );
            this.deps.setPendingActorRef(null);
            throw new PokerError(
              "INVALID_ACTION",
              "actionId already claimed by another user in this hand.",
            );
          }
        }
        if (sameHand && actionKey && handContext!.isDuplicate(actionKey)) {
          logger.warn(
            {
              tableId: this.deps.state.tableId,
              handId: this.deps.state.handId,
              userId,
              actionId,
              action: msg.action,
              reason: "DUPLICATE_ACTION",
            },
            "ACTION_REJECTED",
          );
          logger.info(
            {
              tableId: this.deps.state.tableId,
              handId: this.deps.state.handId,
              userId,
              actionId,
              action: msg.action,
            },
            "ACTION_DUPLICATE_IGNORED",
          );
          this.deps.setPendingActorRef(null);
          return;
        }
        const handIdBefore = this.deps.state.handId;
        try {
          const actionProcessStartedAt = Date.now();
          try {
            await this.deps.handleInternalAction(userId, msg, "PLAYER", actionId);
          } finally {
            dealerRuntimeMetrics.observeActionProcessMs(Date.now() - actionProcessStartedAt);
          }
          if (handContext && actionKey && handIdBefore && this.deps.state.handId === handIdBefore) {
            handContext.recordProcessed(actionKey);
          }
        } catch (err) {
          if (err instanceof PokerError) {
            logger.warn({ err, userId, action: msg.action, code: err.code }, "Action rejected");
            this.deps.emitDiagnostic({
              level: "warn",
              type: "ACTION_REJECTED",
              message: "Action rejected",
              code: err.code,
              context: this.deps.buildDiagnosticContext({ userId, action: msg.action }),
            });
          } else {
            logger.error({ err, userId, action: msg.action }, "Action failed");
            this.deps.emitDiagnostic({
              level: "error",
              type: "ACTION_FAILED",
              message: "Action failed",
              context: this.deps.buildDiagnosticContext({ userId, action: msg.action }),
            });
          }
          // NOTE: do NOT swallow skippable rejections here. This callback runs for
          // player-submitted actions (PokerRoomMessageRouter, which awaits handleAction
          // and must observe the rejection to send an ERROR back to the client) and for
          // bot-scheduled actions (Dealer.ts, which awaits handleAction and has its own
          // PokerError handling to log BOT_SCHEDULED_ACTION_REJECTED and re-drive). Both
          // callers already catch PokerError safely, so rethrowing here cannot crash the
          // process or poison the action queue (TurnManager.enqueuePlayerAction chains a
          // `.catch` ahead of every future enqueue). Swallowing here previously caused
          // out-of-turn/stale-action rejections (NOT_YOUR_TURN, NOT_ELIGIBLE, etc.) to
          // vanish silently instead of reaching the callers that need to react to them.
          throw err;
        }
      } finally {
        this.deps.setPendingActorRef(null);
      }
    });
  }

  async handleInternalAction(
    userId: string,
    msg: ActionPayload,
    origin: TableLastAction["origin"],
    actionId?: string,
  ): Promise<void> {
    const isTerminalActionWindow =
      this.deps.state.street === "SHOWDOWN" ||
      this.deps.state.roundState === "HAND_COMPLETE" ||
      this.deps.state.runoutMode === "STAGED";
    if (isTerminalActionWindow) {
      logger.warn(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          roundState: this.deps.state.roundState,
          runoutMode: this.deps.state.runoutMode,
          userId,
          action: msg.action,
          origin,
        },
        "TERMINAL_OR_RUNOUT_ACTION_IGNORED",
      );
      return;
    }
    const isInternalAction = origin !== "PLAYER";
    if (isInternalAction && this.deps.hasActiveTerminalLifecycleForCurrentHand()) {
      logger.warn(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          roundState: this.deps.state.roundState,
          toActSeat: this.deps.state.toActSeat,
          potCents: this.deps.state.potCents,
          userId,
          action: msg.action,
          origin,
        },
        "TERMINAL_GUARD_REJECTED_ACTION",
      );
      return;
    }
    if (isInternalAction && !this.deps.state.playersById.has(userId)) {
      logger.warn(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          userId,
          action: msg.action,
          origin,
        },
        "STALE_INTERNAL_ACTION_IGNORED",
      );
      return;
    }
    this.deps.ensureCurrentHand();
    const roundBetBefore = this.deps.state.street === "PREFLOP" ? this.deps.state.roundCurrentBetCents : 0;
    const execution = await this.deps.actionService.execute({
      state: this.deps.state,
      userId,
      msg,
      origin,
      recordAcceptedAction: (args) => this.deps.settlementService.recordAcceptedAction(args),
      assertCanAfford: (player, amountCents) => this.deps.settlementService.assertCanAfford(player, amountCents),
      applyActionDebit: async (p: PlayerState, amountCents: number, action: ActionDebitKind) => {
        await this.deps.settlementService.applyActionDebit(p, amountCents, action);
      },
    });

    this.deps.setLastActionFromExecution(execution.lastAction);
    if (this.deps.state.street === "PREFLOP" && execution.lastAction) {
      this.deps.updatePreflopFlagsAfterAction(userId, execution.lastAction, roundBetBefore);
    }
    logger.info(
      {
        tableId: this.deps.state.tableId,
        handId: this.deps.state.handId,
        userId,
        actionId,
        action: msg.action,
      },
      "ACTION_ACCEPTED",
    );
    if (origin === "PLAYER" && actionId) {
      this.deps.setResolvedActionId(actionId);
    }
    await this.deps.applyActionResult(execution.result, {
      turnAdvancedReason: execution.result.kind === "TURN_ADVANCED" && execution.result.actorKind === "BOT"
        ? "BOT_ACTION"
        : "ACTION_ACCEPTED",
      requestDriveAfterTurnAdvanced: origin === "PLAYER",
    });
    this.deps.recordLastAcceptedActionSnapshot({
      handId: this.deps.state.handId,
      userId,
      action: msg.action,
      amountCents: "amountCents" in msg && typeof msg.amountCents === "number" ? msg.amountCents : null,
    });
  }

  async applyActionResult(
    result: ActionResult,
    options?: { turnAdvancedReason?: SnapshotReason; requestDriveAfterTurnAdvanced?: boolean },
  ): Promise<void> {
    // CRITICAL INVARIANT:
    // Every accepted action MUST emit a snapshot before further progression.
    // Clients and tests depend on seeing the action (especially AUTO) before
    // subsequent state transitions (street advance, hand end, etc).
    const acceptedActionReason = options?.turnAdvancedReason ?? "ACTION_ACCEPTED";
    switch (result.kind) {
      case "NO_OP":
        this.deps.logActionResolvedNextActor();
        return;
      case "WAITING_FOR_PLAYERS":
        await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
        maybeAssertBettingState(this.deps.state);
        this.deps.logActionResolvedNextActor();
        return;
      case "HAND_FINISHED":
        logger.info(
          {
            handId: this.deps.state.handId,
            street: this.deps.state.street,
            toActSeat: this.deps.state.toActSeat,
            resolvedActionId: this.deps.getResolvedActionId(),
          },
          "DEBUG_APPLY_ACTION_RESULT_HAND_FINISHED",
        );
        await this.deps.sendTableSnapshotToAll(acceptedActionReason);
        await this.deps.progression.requestDrive("HAND_FINISHED:APPLY_ACTION_RESULT");
        await this.deps.reconcilePostActionLifecycleIfNeeded(result.kind);
        this.deps.logActionResolvedNextActor();
        return;
      case "STREET_COMPLETE":
        logger.info(
          {
            handId: this.deps.state.handId,
            street: this.deps.state.street,
            toActSeat: this.deps.state.toActSeat,
            resolvedActionId: this.deps.getResolvedActionId(),
          },
          "DEBUG_APPLY_ACTION_RESULT_STREET_COMPLETE",
        );
        await this.deps.sendTableSnapshotToAll(acceptedActionReason);
        await this.deps.progression.requestDrive("ADVANCE_STREET_OR_SHOWDOWN:APPLY_ACTION_RESULT_STREET_COMPLETE");
        await this.deps.reconcilePostActionLifecycleIfNeeded(result.kind);
        maybeAssertBettingState(this.deps.state);
        this.deps.logActionResolvedNextActor();
        return;
      case "TURN_ADVANCED": {
        void result.actorKind;
        if (!options?.requestDriveAfterTurnAdvanced) {
          this.deps.reconcileAutomationOwnershipAfterTurnAdvancedWithoutDrive();
        }
        await this.deps.sendTableSnapshotToAll(acceptedActionReason);
        if (options?.requestDriveAfterTurnAdvanced) {
          await this.deps.progression.requestDrive("TURN_ADVANCED:APPLY_ACTION_RESULT");
        }
        this.deps.logActionResolvedNextActor();
        return;
      }
    }
  }
}
