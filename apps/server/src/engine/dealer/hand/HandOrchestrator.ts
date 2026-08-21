import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { HandContext } from "../HandContext.js";
import { NEXT_HAND_DELAY_MS } from "../timing.js";
import type { HandLifecyclePlan, HandLifecycleService } from "./HandLifecycleService.js";
import type { SnapshotReason } from "./SnapshotService.js";
import {
  hasHumanReadyForNextHand,
  resolvePlayersReadyForNextHand,
  settlePlayerStatusesAfterHand,
} from "../utils/TableNavigator.js";
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

type HandTimingEvent = {
  handId: string;
  street: string;
  durationMs: number;
  reason?: string | null;
  branch?: string | null;
  delayMs?: number | null;
  countdownMs?: number | null;
};

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
    onHandEndedAwardsTiming?: (event: HandTimingEvent) => void;
    onScheduleNextHandTiming?: (event: HandTimingEvent) => void;
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
    this.deps.state.roundCurrentBetCents = 0; // Clear current bet in WAITING
    // Clear all needsAction flags - no one should need action in WAITING
    for (const p of this.deps.state.playersById.values()) {
      p.needsAction = false;
      p.roundBetCents = 0;
    }
    // ALL_IN/FOLDED are hand-scoped — settle to ACTIVE/OUT from post-payout stacks
    // so bankrolls show chips (or zero) instead of stale "All-In" between hands.
    settlePlayerStatusesAfterHand(this.deps.state);
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
        const readyPlayers = resolvePlayersReadyForNextHand(this.deps.state);
        logger.warn(
          {
            tableId: this.deps.state.tableId,
            handId: this.deps.state.handId,
            plans: plans.map((p) => p.kind),
            reason: "START_HAND_ABORT_NO_PROGRESS",
            readyPlayers: readyPlayers.map((player) => ({
              userId: player.id,
              seat: player.seat,
              status: player.status,
              connected: player.connected,
              stackCents: player.stackCents,
              sittingOutUntilNextHand: player.sittingOutUntilNextHand === true,
            })),
            readyPlayerCount: readyPlayers.length,
            nextHandAtTs: this.deps.state.nextHandAtTs,
          },
          "START_HAND_ABORTED_RETURNED_TO_WAITING"
        );

        this.deps.setCurrentHand(null);
        // A busted human can leave several funded bots ready. Waiting is the
        // correct state until that human rebuys; retrying here creates a hot
        // requestDrive loop that starves the economy endpoint.
        if (hasHumanReadyForNextHand(readyPlayers, this.deps.state.tournamentMode)) {
          void this.deps.requestDrive("START_HAND_ABORT_RECOVERY");
        }

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
    const startedAt = Date.now();
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
    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        tableId: this.deps.state.tableId,
        handId: result.handId,
        reason: plan.reason,
        dealtUserCount: dealtUserIds.length,
        durationMs,
      },
      "HAND_ENDED_AWARDS_TIMING",
    );
    this.deps.onHandEndedAwardsTiming?.({
      handId: result.handId,
      street: this.deps.state.street,
      durationMs,
      reason: plan.reason,
    });
  }

  scheduleNextHand(reason: string, delayMs = 0): void {
    if (this.nextHandScheduled) return;
    this.nextHandScheduled = true;
    const countdownMs = NEXT_HAND_DELAY_MS;
    const runImmediateNextHand = async (): Promise<void> => {
      const startedAt = Date.now();
      if (this.deps.isDisposed()) {
        this.resetNextHandSchedule();
        return;
      }

      this.deps.state.nextHandAtTs = 0;

      const activePlayers = resolvePlayersReadyForNextHand(this.deps.state);
      this.warnIfAllReadyPlayersDisconnected(activePlayers);
      if (
        this.deps.state.street === "WAITING" &&
        activePlayers.length >= 2 &&
        hasHumanReadyForNextHand(activePlayers, this.deps.state.tournamentMode)
      ) {
        this.nextHandScheduled = false;
        await this.deps.requestDrive("NEXT_HAND_START_IMMEDIATE");
        const durationMs = Date.now() - startedAt;
        logger.info(
          {
            tableId: this.deps.state.tableId,
            handId: this.deps.state.handId || null,
            reason,
            delayMs,
            countdownMs,
            branch: "request_drive",
            durationMs,
          },
          "NEXT_HAND_RUN_IMMEDIATE_TIMING",
        );
        this.deps.onScheduleNextHandTiming?.({
          handId: this.deps.state.handId || "",
          street: this.deps.state.street,
          durationMs,
          reason,
          branch: "request_drive",
          delayMs,
          countdownMs,
        });
        return;
      }

      await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
      const durationMs = Date.now() - startedAt;
      logger.info(
        {
          tableId: this.deps.state.tableId,
          handId: this.deps.state.handId || null,
          reason,
          delayMs,
          countdownMs,
          branch: "snapshot_only",
          durationMs,
        },
        "NEXT_HAND_RUN_IMMEDIATE_TIMING",
      );
      this.deps.onScheduleNextHandTiming?.({
        handId: this.deps.state.handId || "",
        street: this.deps.state.street,
        durationMs,
        reason,
        branch: "snapshot_only",
        delayMs,
        countdownMs,
      });
      if (this.deps.state.tournamentMode) {
        await this.deps.requestDrive("NEXT_HAND_TOURNAMENT_RECONCILE");
      }
    };

    logger.info(
      {
        tableId: this.deps.state.tableId,
        handId: this.deps.state.handId || null,
        reason,
        delayMs,
        countdownMs,
      },
      "NEXT_HAND_SCHEDULED",
    );

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
      const announceStartedAt = Date.now();
      this.nextHandAnnounceTimer = null;
      void this.deps.enqueueSerializedStateMutation(async () => {
        // Room may be disposed between timer fire and queue execution.
        if (this.deps.isDisposed()) {
          this.resetNextHandSchedule();
          return;
        }
        if (countdownMs > 0) {
          this.deps.state.nextHandAtTs = Date.now() + countdownMs;
        }
        await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
        logger.info(
          {
            tableId: this.deps.state.tableId,
            handId: this.deps.state.handId || null,
            reason,
            delayMs,
            countdownMs,
            durationMs: Date.now() - announceStartedAt,
          },
          "NEXT_HAND_ANNOUNCE_TIMING",
        );
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
        const startTimerStartedAt = Date.now();
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

          if (
            this.deps.state.street === "WAITING" &&
            activePlayers.length >= 2 &&
            hasHumanReadyForNextHand(activePlayers, this.deps.state.tournamentMode)
          ) {
            // Release the guard before startHand so an immediate terminal hand
            // (e.g. HAND_START_NO_ACTIONABLE_ACTOR_RUNOUT) can schedule the
            // follow-up hand from inside lifecycle execution.
            this.nextHandScheduled = false;
            await this.deps.requestDrive("NEXT_HAND_START_TIMER");
            logger.info(
              {
                tableId: this.deps.state.tableId,
                handId: this.deps.state.handId || null,
                reason,
                delayMs,
                countdownMs,
                branch: "request_drive",
                durationMs: Date.now() - startTimerStartedAt,
              },
              "NEXT_HAND_START_TIMER_TIMING",
            );
            return;
          }

          await this.deps.sendTableSnapshotToAll("AUTO_TRANSITION");
          logger.info(
            {
              tableId: this.deps.state.tableId,
              handId: this.deps.state.handId || null,
              reason,
              delayMs,
              countdownMs,
              branch: "snapshot_only",
              durationMs: Date.now() - startTimerStartedAt,
            },
            "NEXT_HAND_START_TIMER_TIMING",
          );
          if (this.deps.state.tournamentMode) {
            await this.deps.requestDrive("NEXT_HAND_TOURNAMENT_RECONCILE");
          }
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
