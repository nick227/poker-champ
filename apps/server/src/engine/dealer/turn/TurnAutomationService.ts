/**
 * TurnAutomationService - Automated Player Action Management
 * 
 * PURPOSE:
 * Manages automated actions for players during poker gameplay, including
 * bot decision making, human player automation, and turn enforcement.
 * Handles action queuing, timing, and bot behavior logic.
 * 
 * KEY RESPONSIBILITIES:
 * - Bot action selection and execution
 * - Human player automation (timeouts, disconnections)
 * - Action queuing with proper timing
 * - Auto-sit-out enforcement when action limits reached
 * - Turn advancement and action validation
 * 
 * BOT LOGIC:
 * Uses configurable bot resolver to determine optimal actions
 * based on game state, hand strength, and position.
 * 
 * USAGE:
 * const service = new TurnAutomationService(dependencies);
 * service.maybeActForBot();
 * // Actions are queued through the service
 * 
 */

// ============================================================================
// IMPORTS - Type Definitions
// ============================================================================
import type { ActionPayload } from "@poker-champ/realtime-contract";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";

// ============================================================================
// IMPORTS - Internal Dependencies
// ============================================================================
import type { PokerState } from "../../../state/PokerState.js";
import { getAutoActionHandCap } from "../../../config/seats.js";
import { logger } from "../../../lib/logger.js";

// ============================================================================
// IMPORTS - Poker Rules & Game Logic
// ============================================================================
import { eligibleToAct } from "../../rules/BettingRound.js";

// ============================================================================
// IMPORTS - Bot Logic & AI
// ============================================================================
import { BotResolver } from "../../bots/BotResolver.js";

// ============================================================================
// MAIN CLASS - Turn Automation Management
// ============================================================================

/**
 * TurnAutomationService - Core service for managing automated player actions
 * 
 * This class handles the automation layer for both bot and human players,
 * ensuring proper turn progression, action timing, and rule enforcement.
 * It provides intelligent bot behavior while maintaining fair gameplay.
 */
export class TurnAutomationService {
  // ============================================================================
  // CONSTRUCTOR & DEPENDENCIES
  // ============================================================================
  
  /**
   * Initialize TurnAutomationService with required dependencies
   * @param deps - Service dependencies for state, bot resolution, and player management
   */
  constructor(private readonly deps: {
    state: PokerState;
    botResolver: BotResolver;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    autoActionsByUserId: Map<string, number>;
    currentHandAutoActedUserIds: Set<string>;
    getHeroActionOptions: (userId: string) => HeroActionOptions | undefined;
    enqueueAction: (userId: string, payload: ActionPayload, delayMs?: number) => void;
    getBotDelayMs: () => number;
    scheduleHumanTurnTimeout?: (userId: string) => void;
    onAutoSitOutReachedCap?: (args: { userId: string; stackCents: number }) => Promise<void> | void;
  }) {}

  // ============================================================================
  // AUTOMATION METHODS
  // ============================================================================

  /**
   * Attempt to execute automated action for bot player
   * 
   * PROCESS:
   * 1. Validate game state (not waiting, not staged runout)
   * 2. Identify current player and verify eligibility to act
   * 3. Get available action options for human players
   * 4. For bots, use bot resolver to determine optimal action
   * 5. Queue appropriate action with proper timing
   * 
   * BOT BEHAVIOR:
   * - Uses configurable bot resolver for decision making
   * - Respects timing delays for realistic play
   * - Handles check/fold/call/raise decisions based on game state
   * 
   * @returns void - Actions are queued through dependency injection
   */
  maybeActForBot(): void {
    const state = this.deps.state;
    if (state.street === "WAITING") {
      return;
    }
    if (state.runoutMode === "STAGED") {
      return;
    }

    const toActId = state.seats[state.toActSeat] ?? "";
    const player = state.playersById.get(toActId);
    if (!toActId || !player) {
      // Transient ordering: street may have advanced but seat mapping not yet committed.
      // Log and retry one tick later so the caller's state flush completes first.
      logger.warn(
        { street: state.street, toActSeat: state.toActSeat },
        "AUTOMATION_NO_PLAYER_AT_SEAT",
      );
      logger.info(
        { street: state.street, toActSeat: state.toActSeat, result: "retry_scheduled" },
        "MAYBE_ACT_FOR_BOT_RESULT",
      );
      setTimeout(() => this.maybeActForBot(), 0);
      return;
    }
    if (!eligibleToAct(player) || !player.needsAction) {
      if (player.kind === "BOT" && player.needsAction) {
        logger.warn(
          {
            userId: player.id,
            street: state.street,
            status: player.status,
            needsAction: player.needsAction,
            eligible: eligibleToAct(player),
            runoutMode: state.runoutMode,
            toActSeat: state.toActSeat,
            reason: "INELIGIBLE_OR_NO_NEEDS_ACTION",
          },
          "BOT_AUTOMATION_SKIPPED",
        );
        logger.info(
          { userId: player.id, street: state.street, result: "skipped", reason: "INELIGIBLE_OR_NO_NEEDS_ACTION" },
          "MAYBE_ACT_FOR_BOT_RESULT",
        );
      }
      return;
    }

    const options = this.deps.getHeroActionOptions(toActId);
    if (!options) {
      if (player.kind === "BOT" && player.needsAction) {
        logger.warn(
          {
            userId: player.id,
            street: state.street,
            status: player.status,
            needsAction: player.needsAction,
            eligible: eligibleToAct(player),
            runoutMode: state.runoutMode,
            toActSeat: state.toActSeat,
            reason: "NO_ACTION_OPTIONS",
          },
          "BOT_AUTOMATION_SKIPPED",
        );
        logger.info(
          { userId: player.id, street: state.street, result: "skipped", reason: "NO_ACTION_OPTIONS" },
          "MAYBE_ACT_FOR_BOT_RESULT",
        );
      }
      return;
    }

    if (player.kind !== "BOT" && player.connected) {
      // Connected human: start (or reuse) a server-side turn timeout for this actor,
      // but only if they still need action for this turn.
      if (player.needsAction && this.deps.scheduleHumanTurnTimeout) {
        this.deps.scheduleHumanTurnTimeout(toActId);
      }
      return;
    }

    if (player.kind !== "BOT" && !player.connected) {
      const payload: ActionPayload = options.canCheck ? { action: "CHECK" } : { action: "FOLD" };
      this.deps.currentHandAutoActedUserIds.add(toActId);
      this.deps.enqueueAction(toActId, payload);
      return;
    }

    const ctx = {
      heroActionOptions: options,
      handSnapshot: {
        street: state.street,
        potCents: state.potCents,
        roundCurrentBetCents: state.roundCurrentBetCents,
        board: [...state.board],
      },
      seatSnapshot: {
        stackCents: player.stackCents,
        roundBetCents: player.roundBetCents,
        seat: player.seat,
      },
      activePlayersInHand: countActivePlayersInHand(state),
      heroHoleCards: [...(this.deps.getHoleCardsByPlayerId().get(toActId) ?? [])],
    };

    const payload = this.deps.botResolver.pickAction(player, ctx);
    const delayMs = this.deps.getBotDelayMs();
    logger.info(
      {
        userId: toActId,
        delayMs,
        street: state.street,
        action: payload.action,
      },
      "BOT_ACTION_ENQUEUED",
    );
    logger.info(
      { userId: toActId, street: state.street, action: payload.action, delayMs },
      "BOT_ACTION_SCHEDULED",
    );
    this.deps.enqueueAction(toActId, payload, delayMs);
  }

  // ============================================================================
  // AUTOMATION ENFORCEMENT METHODS
  // ============================================================================

  /**
   * Apply automatic sit-out when players exceed action limits
   * 
   * PROCESS:
   * 1. Get configured action cap per hand
   * 2. Iterate through all players and check action counts
   * 3. Mark players as ABANDONED when cap is reached
   * 4. Trigger callback for players who hit the limit
   * 
   * PURPOSE:
   * Prevents excessive bot behavior and enforces fair play
   * Ensures human players don't face unlimited bot opponents
   * 
   * @returns Promise<void> - Async operation completion
   */
  async applyDisconnectedAutoActionCapForHand(): Promise<void> {
    const cap = getAutoActionHandCap();
    if (cap <= 0) return;
    const nowTs = Date.now();

    for (const player of this.deps.state.playersById.values()) {
      if (player.kind !== "HUMAN") continue;

      const autoActed = this.deps.currentHandAutoActedUserIds.has(player.id);
      if (autoActed && !player.connected) {
        // Do not force-abandon disconnected users while they are still within
        // the reconnect grace window.
        if (player.connected === false && player.disconnectDeadlineTs > 0 && nowTs <= player.disconnectDeadlineTs) {
          continue;
        }

        const nextCount = (this.deps.autoActionsByUserId.get(player.id) ?? 0) + 1;
        this.deps.autoActionsByUserId.set(player.id, nextCount);

        if (nextCount >= cap) {
          player.status = "ABANDONED";
          player.needsAction = false;
          if (this.deps.onAutoSitOutReachedCap) {
            await this.deps.onAutoSitOutReachedCap({ userId: player.id, stackCents: player.stackCents });
          }
          logger.info({ userId: player.id, autoActionHands: nextCount, cap }, "AUTO_ACTION_CAP_REACHED_SIT_OUT");
        }
        continue;
      }

      if (player.connected) {
        this.deps.autoActionsByUserId.delete(player.id);
      }
    }
  }
}

function countActivePlayersInHand(state: PokerState): number {
  let count = 0;
  for (const player of state.playersById.values()) {
    if (player.status === "ACTIVE" || player.status === "ALL_IN") count += 1;
  }
  return count;
}
