import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import {
  eligibleToAct,
  bettingRoundComplete,
  noFurtherBettingPossible,
} from "../../rules/BettingRound.js";
import { findNextToActSeat } from "../utils/TableNavigator.js";
import type { NextStepOwner } from "../decision/types.js";

export type DealerDiagnosticType =
  | "QUEUE_FULL"
  | "QUEUE_RECOVERY_AFTER_FAILURE"
  | "ACTION_REJECTED"
  | "ACTION_FAILED"
  | "LIFECYCLE_DEFERRED_REMOVAL"
  | "STALL_NO_ELIGIBLE_ACTOR"
  | "QUEUED_AUTO_ACTION_STALE_DISCARDED"
  | "QUEUED_AUTO_ACTION_INELIGIBLE_DISCARDED"
  | "QUEUED_AUTO_ACTION_SKIPPED_RECONNECTED"
  | "QUEUED_AUTO_ACTION_FAILED"
  | "BOT_SCHEDULED_ACTION_CIRCUIT_BREAKER_TRIPPED"
  | "AUTOMATION_NO_PLAYER_AT_SEAT_CIRCUIT_BREAKER_TRIPPED";

export type DealerDiagnosticEvent = {
  level: "warn" | "error";
  type: DealerDiagnosticType;
  message: string;
  code?: string;
  context?: Record<string, unknown>;
};

type DealerDiagnosticsDeps = {
  state: PokerState;
  getQueueDepth: () => number;
  getNextStepOwner: () => NextStepOwner;
  isDriveQueued: () => boolean;
  hasActiveTerminalLifecycle: () => boolean;
  hasCompletedTerminalLifecycle: () => boolean;
};

export class DealerDiagnostics {
  private readonly diagnosticListeners = new Set<(event: DealerDiagnosticEvent) => void>();

  constructor(private readonly deps: DealerDiagnosticsDeps) {}

  addDiagnosticListener(listener: (event: DealerDiagnosticEvent) => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  emitDiagnostic(event: DealerDiagnosticEvent): void {
    for (const listener of this.diagnosticListeners) {
      try {
        listener(event);
      } catch (err) {
        void err;
      }
    }
  }

  buildDiagnosticContext(context?: Record<string, unknown>): Record<string, unknown> {
    return {
      handId: this.deps.state.handId ?? null,
      street: this.deps.state.street,
      toActSeat: this.deps.state.toActSeat,
      handActionSeq: this.deps.state.handActionSeq,
      ...context,
    };
  }

  emitLifecycleDeferredRemovalDiagnostic(userId: string, reason: string): void {
    this.emitDiagnostic({
      level: "warn",
      type: "LIFECYCLE_DEFERRED_REMOVAL",
      message: "Lifecycle removal deferred until safe boundary",
      context: this.buildDiagnosticContext({ userId, reason }),
    });
  }

  assertProgressionOwnershipInvariant(trigger: string): void {
    const { state } = this.deps;
    const nextStepOwner = this.deps.getNextStepOwner();

    if (state.street === "WAITING") {
      const toActUserId = state.toActSeat >= 0 ? (state.seats[state.toActSeat] ?? "") : "";
      const anyPlayerNeedsAction = [...state.playersById.values()].some((player) => player.needsAction);
      const queueDepth = this.deps.getQueueDepth();
      const isSettledWaiting =
        !this.deps.hasActiveTerminalLifecycle() &&
        !this.deps.hasCompletedTerminalLifecycle() &&
        nextStepOwner === "IDLE" &&
        !this.deps.isDriveQueued() &&
        queueDepth === 0;
      const invariantBroken =
        anyPlayerNeedsAction ||
        state.roundState === "WAITING_FOR_ACTION" ||
        nextStepOwner === "WAITING_FOR_HUMAN" ||
        nextStepOwner === "WAITING_FOR_AUTOMATION";
      if (invariantBroken) {
        logger[isSettledWaiting ? "error" : "warn"](
          {
            tableId: state.tableId,
            handId: state.handId,
            toActSeat: state.toActSeat,
            toActUserId,
            anyPlayerNeedsAction,
            roundState: state.roundState,
            nextStepOwner,
            trigger,
            queueDepth,
            settledWaiting: isSettledWaiting,
          },
          "WAITING_STATE_INVARIANT_VIOLATION",
        );
      }
    }

    const street = state.street;
    const owner = nextStepOwner;

    if (owner === "IDLE") {
      if (street === "WAITING" || street === "SHOWDOWN") return;
      const toActUserId = state.seats[state.toActSeat] ?? "";
      const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
      const activeUnownedTurn = !!toActPlayer && eligibleToAct(toActPlayer) && toActPlayer.needsAction;
      if (activeUnownedTurn) {
        logger.error(
          {
            tableId: state.tableId,
            handId: state.handId,
            street,
            toActSeat: state.toActSeat,
            toActUserId,
            toActKind: toActPlayer.kind,
            toActConnected: toActPlayer.connected,
            nextStepOwner: owner,
            turnDeadlineMs: state.turnDeadlineMs,
            trigger,
          },
          "UNOWNED_ACTIVE_HAND",
        );
      }
      return;
    }

    if (owner === "RUNNING_LIFECYCLE" || owner === "BETWEEN_HANDS") return;

    if (street === "WAITING" || street === "SHOWDOWN") {
      logger.error(
        {
          tableId: state.tableId,
          handId: state.handId,
          street,
          nextStepOwner: owner,
          trigger,
        },
        "PROGRESSION_OWNERSHIP_INVARIANT_VIOLATION: active owner on inactive street",
      );
      return;
    }

    const toActUserId = state.seats[state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer) return;

    if (owner === "WAITING_FOR_HUMAN") {
      const isHuman = toActPlayer.kind === "HUMAN";
      const isConnected = toActPlayer.connected;
      const hasDeadline = state.turnDeadlineMs > 0;
      if (!isHuman || !isConnected || !hasDeadline) {
        logger.error(
          {
            tableId: state.tableId,
            handId: state.handId,
            street,
            nextStepOwner: owner,
            toActKind: toActPlayer.kind,
            toActConnected: toActPlayer.connected,
            turnDeadlineMs: state.turnDeadlineMs,
            trigger,
          },
          "PROGRESSION_OWNERSHIP_INVARIANT_VIOLATION: WAITING_FOR_HUMAN but state mismatch",
        );
      }
      return;
    }

    if (owner === "WAITING_FOR_AUTOMATION") {
      const isBot = toActPlayer.kind === "BOT";
      const isDisconnectedHuman = toActPlayer.kind === "HUMAN" && !toActPlayer.connected;
      if (!isBot && !isDisconnectedHuman) {
        logger.error(
          {
            tableId: state.tableId,
            handId: state.handId,
            street,
            nextStepOwner: owner,
            toActKind: toActPlayer.kind,
            toActConnected: toActPlayer.connected,
            trigger,
          },
          "PROGRESSION_OWNERSHIP_INVARIANT_VIOLATION: WAITING_FOR_AUTOMATION but actor is connected human",
        );
      }
    }
  }

  logEngineDecisionState(trigger: string): void {
    const { state } = this.deps;
    const toActUserId = state.toActSeat >= 0 ? (state.seats[state.toActSeat] ?? "") : "";
    const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        toActSeat: state.toActSeat,
        toActUserId,
        needsAction: toActPlayer?.needsAction ?? null,
        actorKind: toActPlayer?.kind ?? null,
        actorConnected: toActPlayer?.connected ?? null,
        deadline: state.turnDeadlineMs,
        runoutMode: state.runoutMode,
        queueDepth: this.deps.getQueueDepth(),
        trigger,
      },
      "ENGINE_DECISION_STATE",
    );
  }

  logToActDerivationWarning(trigger: string): void {
    const { state } = this.deps;
    if (state.street === "WAITING" || state.street === "SHOWDOWN") return;
    if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) return;
    if (state.maxSeats <= 0) return;

    const pivot = state.toActSeat >= 0
      ? ((state.toActSeat - 1 + state.maxSeats) % state.maxSeats)
      : (state.maxSeats - 1);
    const derivedToAct = findNextToActSeat(state, pivot);
    if (derivedToAct === -1 || derivedToAct === state.toActSeat) return;

    logger.warn(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        toActSeatStored: state.toActSeat,
        toActSeatDerived: derivedToAct,
        trigger,
      },
      "TO_ACT_DERIVATION_MISMATCH",
    );
  }
}
