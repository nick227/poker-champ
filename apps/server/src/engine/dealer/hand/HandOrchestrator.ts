import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { HandContext } from "../HandContext.js";
import { NEXT_HAND_DELAY_MS } from "../timing.js";
import type { HandLifecyclePlan, HandLifecycleService } from "./HandLifecycleService.js";
import type { SnapshotReason } from "./SnapshotService.js";
import { resolvePlayersReadyForNextHand } from "../utils/TableNavigator.js";
import type { NextStepOwner } from "../decision/types.js";

type HandEndedAwardsCallback = (
  handSummary: {
    handId: string;
    reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK";
    potCents: number;
    bigBlindCents: number;
    payoutsByUserId: Record<string, number>;
    winnerId?: string;
    allInPlayerIds: string[];
  },
  dealtUserIds: string[],
  getSessionState: (userId: string) => { sessionId: string; sessionHands: number; consecutiveWins: number },
) => Promise<void> | void;

export class HandOrchestrator {
  // Guards against duplicate countdown/start scheduling for a single hand end.
  private nextHandScheduled = false;
  private nextHandAnnounceTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandStartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: {
    state: PokerState;
    handLifecycleService: HandLifecycleService;
    clearPendingHumanTurnTimeout: () => void;
    createHandContext: () => HandContext;
    setCurrentHand: (hand: HandContext | null) => void;
    getCurrentHand: () => HandContext | null;
    initPreflopFlagsForHand: () => void;
    executeHandLifecyclePlans: (plans: HandLifecyclePlan[]) => Promise<void>;
    requestDrive: (reason: string) => Promise<void>;
    enqueueSerializedStateMutation: (work: () => Promise<void>) => Promise<void>;
    sendTableSnapshotToAll: (reason: SnapshotReason, actionId?: string) => Promise<void>;
    isDisposed: () => boolean;
    getLastHandResult: () => TableSnapshotPayload["lastHandResult"] | undefined;
    getOnHandEndedAwards: () => HandEndedAwardsCallback | undefined;
    getDealtHumanUserIds: () => string[];
    recordSessionHandResult: (userId: string, won: boolean) => void;
    getSessionState: (userId: string) => { sessionId: string; sessionHands: number; consecutiveWins: number };
  }) { }

  private warnIfAllReadyPlayersDisconnected(readyPlayers: PlayerState[]): void {
    if (readyPlayers.length === 0) return;
    if (!readyPlayers.every((player) => !player.connected)) return;
    logger.warn(
      {
        tableId: this.deps.state.tableId,
        handId: this.deps.state.handId,
        reason: "ALL_READY_PLAYERS_DISCONNECTED",
        count: readyPlayers.length,
      },
      "ALL_READY_PLAYERS_DISCONNECTED",
    );
  }

  transitionToWaiting(): void {
    this.deps.clearPendingHumanTurnTimeout();
    this.deps.state.roundState = "HAND_COMPLETE";
    this.deps.state.street = "WAITING";
    this.deps.state.runoutMode = "NONE";
    this.deps.state.handId = ""; // CRITICAL: Clear handId when transitioning to WAITING
    this.deps.state.toActSeat = -1; // Clear turn state
    // Clear all needsAction flags - no one should need action in WAITING
    for (const p of this.deps.state.playersById.values()) {
      p.needsAction = false;
    }
    this.deps.setCurrentHand(null);
  }

  async startHand(): Promise<void> {
    this.deps.clearPendingHumanTurnTimeout();
    
    // Enforce invariant: handId must NOT exist while WAITING
    if (this.deps.state.handId && this.deps.state.street === "WAITING") {
      logger.error(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          roundState: this.deps.state.roundState,
        },
        "INVALID_STATE_HAND_ID_WHILE_WAITING",
      );
    }
    
    // Enforce invariant: toActSeat must be -1 in WAITING
    if (this.deps.state.street === "WAITING" && this.deps.state.toActSeat !== -1) {
      logger.error(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          street: this.deps.state.street,
          toActSeat: this.deps.state.toActSeat,
        },
        "WAITING_HAS_TO_ACT_SEAT",
      );
    }
    
    this.deps.setCurrentHand(this.deps.createHandContext());
    try {
      const plans = await this.deps.handLifecycleService.startHand();
      if (this.deps.state.street === "WAITING") {
        logger.warn(
          {
            tableId: this.deps.state.tableId,
            handId: this.deps.state.handId,
            plans: plans.map((p) => p.kind),
          },
          "START_HAND_ABORTED_RETURNED_TO_WAITING"
        );

        this.deps.setCurrentHand(null);
        await this.deps.requestDrive("START_HAND_ABORT_RECOVERY");

        return;
      }
      this.deps.initPreflopFlagsForHand();
      await this.deps.executeHandLifecyclePlans(plans);
    } catch (err) {
      this.deps.setCurrentHand(null);
      logger.error(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId,
          err,
        },
        "START_HAND_FAILED_WITH_ERROR",
      );
      throw err;
    }
  }

  async advanceStreetOrShowdown(): Promise<void> {
    const plans = await this.deps.handLifecycleService.advanceStreetOrShowdown();
    await this.deps.executeHandLifecyclePlans(plans);
  }

  async finishHandByLastStanding(): Promise<void> {
    const plans = await this.deps.handLifecycleService.finishHandByLastStanding();
    await this.deps.executeHandLifecyclePlans(plans);
  }

  async finishHandShowdownWithSidePots(): Promise<void> {
    const plans = await this.deps.handLifecycleService.finishHandShowdownWithSidePots();
    await this.deps.executeHandLifecyclePlans(plans);
  }

  async runHandEndedAwards(plan: Extract<HandLifecyclePlan, { kind: "HAND_ENDED" }>): Promise<void> {
    const result = this.deps.getLastHandResult();
    const currentHand = this.deps.getCurrentHand();
    if (!result || !currentHand) return;
    const dealtUserIds = this.deps.getDealtHumanUserIds();
    const onHandEndedAwards = this.deps.getOnHandEndedAwards();
    if (dealtUserIds.length === 0 || !onHandEndedAwards) return;
    const allInPlayerIds = [...this.deps.state.playersById.values()]
      .filter((p) => p.status === "ALL_IN")
      .map((p) => p.id);
    const handSummary = {
      handId: result.handId,
      reason: plan.reason,
      potCents: plan.outcome.potCents,
      bigBlindCents: this.deps.state.bigBlindCents,
      payoutsByUserId: plan.outcome.payoutsByUserId,
      winnerId: plan.outcome.winnerId,
      allInPlayerIds,
    };
    for (const userId of dealtUserIds) {
      const won = (plan.outcome.payoutsByUserId[userId] ?? 0) > 0;
      this.deps.recordSessionHandResult(userId, won);
    }
    await onHandEndedAwards(handSummary, dealtUserIds, this.deps.getSessionState);
  }

  scheduleNextHand(reason: string, delayMs = 0): void {
    if (this.nextHandScheduled) return;
    this.nextHandScheduled = true;
    const countdownMs = NEXT_HAND_DELAY_MS;
    const runImmediateNextHand = async (): Promise<void> => {
      if (this.deps.isDisposed()) {
        this.resetNextHandSchedule();
        return;
      }

      this.deps.state.nextHandAtTs = 0;

      const activePlayers = resolvePlayersReadyForNextHand(this.deps.state);
      this.warnIfAllReadyPlayersDisconnected(activePlayers);
      if (this.deps.state.street === "WAITING" && activePlayers.length >= 2) {
        this.nextHandScheduled = false;
        await this.deps.requestDrive("NEXT_HAND_START_IMMEDIATE");
        return;
      }

      await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
    };

    if (delayMs <= 0 && countdownMs <= 0) {
      void this.deps.enqueueSerializedStateMutation(runImmediateNextHand)
        .finally(() => {
          if (this.nextHandAnnounceTimer == null && this.nextHandStartTimer == null) {
            this.nextHandScheduled = false;
          }
        })
        .catch((err) => {
          this.nextHandScheduled = false;
          logger.error({ err, reason }, "Failed to immediately start next hand");
        });
      return;
    }

    this.nextHandAnnounceTimer = setTimeout(() => {
      this.nextHandAnnounceTimer = null;
      void this.deps.enqueueSerializedStateMutation(async () => {
        // Room may be disposed between timer fire and queue execution.
        if (this.deps.isDisposed()) {
          this.resetNextHandSchedule();
          return;
        }
        this.deps.state.nextHandAtTs = Date.now() + countdownMs;
        await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
      }).catch((err) => {
        this.nextHandScheduled = false;
        if (this.nextHandStartTimer != null) {
          clearTimeout(this.nextHandStartTimer);
          this.nextHandStartTimer = null;
        }
        logger.error({ err, reason }, "Failed to announce next-hand countdown");
      });

      if (countdownMs <= 0) {
        void this.deps.enqueueSerializedStateMutation(runImmediateNextHand)
          .finally(() => {
            if (this.nextHandAnnounceTimer == null && this.nextHandStartTimer == null) {
              this.nextHandScheduled = false;
            }
          })
          .catch((err) => {
            this.nextHandScheduled = false;
            logger.error({ err, reason }, "Failed to immediately start next hand after countdown");
          });
        return;
      }

      this.nextHandStartTimer = setTimeout(() => {
        this.nextHandStartTimer = null;
        void this.deps.enqueueSerializedStateMutation(async () => {
          // Room may be disposed between timer fire and queue execution.
          if (this.deps.isDisposed()) {
            this.resetNextHandSchedule();
            return;
          }

          this.deps.state.nextHandAtTs = 0;

          // Use same active player logic as startHand to avoid readiness mismatch
          const activePlayers = resolvePlayersReadyForNextHand(this.deps.state);
          this.warnIfAllReadyPlayersDisconnected(activePlayers);

          if (this.deps.state.street === "WAITING" && activePlayers.length >= 2) {
            // Release the guard before startHand so an immediate terminal hand
            // (e.g. HAND_START_NO_ACTIONABLE_ACTOR_RUNOUT) can schedule the
            // follow-up hand from inside lifecycle execution.
            this.nextHandScheduled = false;
            await this.deps.requestDrive("NEXT_HAND_START_TIMER");
            return;
          }

          await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
        }).finally(() => {
          // Keep the guard latched when a nested schedule has already armed
          // the next announce/start timers during lifecycle execution.
          if (this.nextHandAnnounceTimer == null && this.nextHandStartTimer == null) {
            this.nextHandScheduled = false;
          }
        }).catch((err) => {
          logger.error({ err, reason }, "Failed to auto-start next hand");
        });
      }, countdownMs);
    }, delayMs);
  }

  resetNextHandSchedule(): void {
    this.nextHandScheduled = false;
    if (this.nextHandAnnounceTimer != null) {
      clearTimeout(this.nextHandAnnounceTimer);
      this.nextHandAnnounceTimer = null;
    }
    if (this.nextHandStartTimer != null) {
      clearTimeout(this.nextHandStartTimer);
      this.nextHandStartTimer = null;
    }
  }

  dispose(): void {
    this.resetNextHandSchedule();
  }
}
