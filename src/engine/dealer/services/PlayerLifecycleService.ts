/**
 * PlayerLifecycleService - Player State Management & Lifecycle Events
 * 
 * PURPOSE:
 * Manages player lifecycle events including joining, leaving, reconnection,
 * disconnection, abandonment, and state transitions. Handles player
 * seating, cash operations, and automated actions.
 * 
 * KEY RESPONSIBILITIES:
 * - Player seating and table management
 * - Connection/disconnection handling
 * - Cash-out and rebuy processing
 * - State validation and invariants
 * - Automated action management
 * 
 * CONCURRENCY SAFETY:
 * Uses idempotency keys and tracking sets to prevent race conditions
 * when multiple operations affect the same player simultaneously.
 * 
 * USAGE:
 * const service = new PlayerLifecycleService(dependencies);
 * const plans = await service.addPlayer(userId, name, buyInCents);
 * // Execute plans through Dealer execution layer
 */

// ============================================================================
// IMPORTS - External Dependencies
// ============================================================================
import { nanoid } from "nanoid";

// ============================================================================
// IMPORTS - Internal Dependencies
// ============================================================================
import { logger } from "../../../lib/logger.js";
import type { PokerState } from "../../../state/PokerState.js";
import { PlayerState } from "../../../state/PlayerState.js";
import { PokerError } from "../../errors.js";
import type { PersistenceFacade } from "../../persistence/PersistenceFacade.js";
import { CashierService } from "../../economy/CashierService.js";

// ============================================================================
// IMPORTS - Poker Rules & Game Logic
// ============================================================================
import {
  bettingRoundComplete,
  eligibleToAct,
  noFurtherBettingPossible,
  syncRoundCurrentBetCents,
} from "../../rules/BettingRound.js";

// ============================================================================
// IMPORTS - Utilities & Helpers
// ============================================================================
import { countNonOutPlayers, countNotFoldedPlayers, findNextToActSeat, findOpenSeat } from "../utils/TableNavigator.js";

// ============================================================================
// IMPORTS - Invariants & Validation
// ============================================================================
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";

// ============================================================================
// IMPORTS - Type Definitions
// ============================================================================
import type { SnapshotReason } from "./SnapshotService.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Plan types for player lifecycle management
 * Each plan represents an atomic operation that can be executed by the Dealer
 * to manage player state transitions and table events.
 */
export type PlayerLifecyclePlan =
  | { kind: "EMIT_SNAPSHOT"; reason: SnapshotReason; actionId?: string }
  | { kind: "MAYBE_AUTOMATE_TURN" }
  | { kind: "START_HAND" }
  | { kind: "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL"; removedSeat: number }
  | { kind: "RELEASE_PENDING_SEATS" }
  | { kind: "FINISH_HAND_BY_LAST_STANDING" }
  | { kind: "ADVANCE_STREET_OR_SHOWDOWN" };

/**
 * Function type for forcing player folds during hand progression
 * Used by Dealer to maintain game consistency when players abandon
 */
export type ForceFoldIfInHand = (userId: string) => Promise<void>;

// ============================================================================
// MAIN CLASS - Player Lifecycle Management
// ============================================================================

/**
 * PlayerLifecycleService - Core service for managing player state and lifecycle events
 * 
 * This class handles all player-related operations including joining, leaving,
 * reconnection, cash operations, and state transitions. It provides
 * concurrency safety through idempotency tracking and validation.
 */
export class PlayerLifecycleService {
  // ============================================================================
  // CLASS PROPERTIES - Concurrency & State Tracking
  // ============================================================================
  
  /** Prevents duplicate cash-out when leave/cash-out is triggered from multiple paths. */
  private readonly cashedOutUserIds = new Set<string>();
  /** Prevents duplicate removePlayer/leave from running concurrently for the same user. */
  private readonly leaveInProgressUserIds = new Set<string>();
  /** Prevents duplicate rebuy state mutation when the same idempotency key is replayed. */
  private readonly appliedRebuyKeys = new Set<string>();

  // ============================================================================
  // CONSTRUCTOR & DEPENDENCIES
  // ============================================================================
  
  /**
   * Initialize PlayerLifecycleService with required dependencies
   * @param deps - Service dependencies for state, persistence, and player management
   */
  constructor(private readonly deps: {
    state: PokerState;
    persistence: PersistenceFacade;
    pendingSeatReleaseUserIds: Set<string>;
    autoActionsByUserId: Map<string, number>;
    currentHandAutoActedUserIds: Set<string>;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    ensurePlayerPersistence: (player: PlayerState) => Promise<void>;
    /** When set, used to force-fold before abandon/remove so hand history and pot math are consistent. */
    forceFoldIfInHand?: ForceFoldIfInHand;
  }) {}

  // ============================================================================
  // PLAYER LIFECYCLE METHODS
  // ============================================================================

  /**
   * Add a new player to the table with buy-in
   * 
   * PROCESS:
   * 1. Validate player doesn't already exist
   * 2. Find available seat and assign to player
   * 3. Process buy-in through cashier service
   * 4. Update player state and persistence
   * 5. Generate plans for table state updates
   * 
   * CONCURRENCY SAFETY:
   * - Uses idempotency key for rebuy operations
   * - Validates no duplicate player addition
   * 
   * @param userId Unique player identifier
   * @param name Display name for player
   * @param buyInCents Amount to add to player stack
   * @returns Array of lifecycle plans for player addition
   */
  async addPlayer(userId: string, name: string, buyInCents: number): Promise<PlayerLifecyclePlan[]> {
    logger.info({ userId, buyInCents }, 'addPlayer called');
    const plans: PlayerLifecyclePlan[] = [];
    if (this.deps.state.playersById.has(userId)) {
      logger.info({ userId }, 'addPlayer early return - player already exists');
      return plans;
    }
    this.cashedOutUserIds.delete(userId);

    const seat = findOpenSeat(this.deps.state);
    if (seat === -1) throw new PokerError("TABLE_FULL", "Table is full.");
    this.assertValidBuyIn(buyInCents);

    const externalRef = `buyin_${this.deps.state.tableId}_${userId}_${Date.now()}_${nanoid(6)}`;
    let buyInTableBalance = buyInCents;
    try {
      const result = await CashierService.processCashGameBuyIn({
        userId,
        tableId: this.deps.state.tableId,
        amountCents: buyInCents,
        externalRef,
        tableMeta: {
          name: this.deps.state.tableName,
        },
      });
      buyInTableBalance = result.newTableBalance;
      logger.info({ userId, buyInCents, newTableBalance: result.newTableBalance }, "buy-in processed");
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_BANKROLL") {
        throw new PokerError("INSUFFICIENT_BANKROLL", "Insufficient bankroll for this buy-in.");
      }
      throw err;
    }

    const player = new PlayerState();
    player.id = userId;
    player.userId = userId;
    player.kind = "HUMAN";
    player.name = name;
    player.seat = seat;
    player.status = this.deps.state.street === "WAITING" ? "ACTIVE" : "ABANDONED";
    player.connected = true;
    player.disconnectDeadlineTs = 0;
    player.stackCents = buyInTableBalance;
    player.sittingOutUntilNextHand = this.deps.state.street !== "WAITING";

    this.deps.state.playersById.set(userId, player);
    this.deps.state.seats[seat] = userId;
    if (this.deps.state.street !== "WAITING" && this.deps.state.initialChipMassCents > 0) {
      this.deps.state.initialChipMassCents += buyInTableBalance;
    }

    this.ensureToActHasNeedsActionIfNeeded(seat, userId);

    await this.deps.ensurePlayerPersistence(player);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });

    logger.info({ userId, seat }, "player joined");
    if (countNonOutPlayers(this.deps.state) >= 2 && this.deps.state.street === "WAITING") {
      plans.push({ kind: "START_HAND" });
    } else {
      if (this.deps.state.street !== "WAITING") {
        player.status = "ABANDONED";
      }
      player.sittingOutUntilNextHand = true;
      plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    }
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  /**
   * Add chips to an already-seated player (rebuy). Caller must have already run
   * CashierService.processCashGameBuyIn so ledger is updated; this only mutates in-memory state.
   */
  async addChipsToSeatedPlayer(userId: string, amountCents: number, rebuyRef?: string): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    const player = this.deps.state.playersById.get(userId);
    if (!player) return plans;
    this.assertValidBuyIn(amountCents);
    if (rebuyRef) {
      const rebuyKey = `${userId}:${rebuyRef}`;
      if (this.appliedRebuyKeys.has(rebuyKey)) {
        logger.warn({ userId, rebuyRef }, "Duplicate rebuy state mutation prevented");
        return plans;
      }
      this.appliedRebuyKeys.add(rebuyKey);
    }
    player.stackCents += amountCents;
    if (this.deps.state.street !== "WAITING" && this.deps.state.initialChipMassCents > 0) {
      this.deps.state.initialChipMassCents += amountCents;
    }
    if (player.status === "OUT" || player.status === "ABANDONED") {
      player.sittingOutUntilNextHand = false;
      if (this.deps.state.street === "WAITING") {
        player.status = "ACTIVE";
      }
    }
    await this.deps.ensurePlayerPersistence(player);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });
    logger.info({ userId, amountCents, newStackCents: player.stackCents }, "rebuy applied");
    if (countNonOutPlayers(this.deps.state) >= 2 && this.deps.state.street === "WAITING") {
      plans.push({ kind: "START_HAND" });
    }
    return plans;
  }

  async restorePlayerFromSession(
    userId: string,
    name: string,
    seat: number,
    stackCents: number,
    options?: { connected?: boolean; sittingOut?: boolean },
  ): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    if (this.deps.state.playersById.has(userId)) return plans;
    this.cashedOutUserIds.delete(userId);
    if (seat < 0 || seat >= this.deps.state.seats.length) {
      throw new PokerError("BAD_STATE", "Invalid seat from persisted session.");
    }

    const occupant = this.deps.state.seats[seat];
    if (occupant && occupant !== userId) {
      throw new PokerError("BAD_STATE", "Persisted seat is currently occupied.");
    }

    const player = new PlayerState();
    player.id = userId;
    player.userId = userId;
    player.kind = "HUMAN";
    player.name = name;
    player.seat = seat;

    const connected = options?.connected ?? true;
    const sittingOut = options?.sittingOut ?? false;
    player.status = stackCents > 0 ? (sittingOut ? "ABANDONED" : "ACTIVE") : "OUT";
    player.connected = connected;
    player.disconnectDeadlineTs = 0;
    player.stackCents = Math.max(0, stackCents);
    player.roundBetCents = 0;
    player.committedCents = 0;
    player.needsAction = false;

    this.deps.state.playersById.set(userId, player);
    this.deps.autoActionsByUserId.delete(userId);
    this.deps.state.seats[seat] = userId;

    this.ensureToActHasNeedsActionIfNeeded(seat, userId);

    await this.deps.ensurePlayerPersistence(player);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "RECONNECT" });

    logger.info({ userId, seat, stackCents: player.stackCents }, "player restored from persisted seat session");
    if (countNonOutPlayers(this.deps.state) >= 2 && this.deps.state.street === "WAITING") {
      plans.push({ kind: "START_HAND" });
    } else {
      plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    }
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  async addBot(botId: string, name: string, buyInCents: number, catalogBotId?: string): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    if (this.deps.state.playersById.has(botId)) return plans;

    const seat = findOpenSeat(this.deps.state);
    if (seat === -1) throw new PokerError("TABLE_FULL", "Table is full.");
    this.assertValidBuyIn(buyInCents);

    const player = new PlayerState();
    player.id = botId;
    player.userId = "";
    player.kind = "BOT";
    player.botId = catalogBotId || botId;
    player.name = name;
    player.seat = seat;
    player.status = this.deps.state.street === "WAITING" ? "ACTIVE" : "ABANDONED";
    player.connected = true;
    player.disconnectDeadlineTs = 0;
    player.stackCents = buyInCents;
    player.sittingOutUntilNextHand = this.deps.state.street !== "WAITING";

    this.deps.state.playersById.set(botId, player);
    this.deps.state.seats[seat] = botId;
    if (this.deps.state.street !== "WAITING" && this.deps.state.initialChipMassCents > 0) {
      this.deps.state.initialChipMassCents += buyInCents;
    }

    this.ensureToActHasNeedsActionIfNeeded(seat, botId);

    if (this.deps.persistence.enabled && this.deps.persistence.handHistory) {
      const roster = [...this.deps.state.playersById.values()]
        .filter((pl) => pl.seat >= 0)
        .map((pl) => ({
          id: pl.id,
          name: pl.name,
          seat: pl.seat,
          userId: pl.kind === "HUMAN" ? pl.userId || pl.id : null,
        }));
      await this.deps.persistence.handHistory.ensureTableAndPlayers(roster);
    }

    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });

    logger.info({ botId, seat }, "bot joined");
    if (countNonOutPlayers(this.deps.state) >= 2 && this.deps.state.street === "WAITING") {
      plans.push({ kind: "START_HAND" });
    } else {
      if (this.deps.state.street !== "WAITING") {
        player.status = "ABANDONED";
      }
      player.sittingOutUntilNextHand = true;
    }
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  async removeBot(botId: string): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    let player = this.deps.state.playersById.get(botId);
    if (!player) return plans;

    const seat = player.seat;
    if (this.shouldForceFold(player) && this.deps.forceFoldIfInHand) {
      await this.deps.forceFoldIfInHand(botId);
      player = this.deps.state.playersById.get(botId);
      if (!player) return plans;
    }

    this.deps.pendingSeatReleaseUserIds.delete(botId);
    this.deps.autoActionsByUserId.delete(botId);
    this.deps.currentHandAutoActedUserIds.delete(botId);

    this.deps.state.seats[player.seat] = "";
    this.deps.state.playersById.delete(botId);
    this.deps.getHoleCardsByPlayerId().delete(botId);
    this.syncBettingStateAfterRemoval();
    if (this.deps.persistence.enabled && typeof this.deps.persistence.handHistory?.removePlayer === "function") {
      await this.deps.persistence.handHistory.removePlayer(botId);
    }
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });

    logger.info({ botId }, "bot left");
    plans.push({ kind: "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL", removedSeat: seat });
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  /**
   * Remove a player from the table with optional cash-out
   * 
   * PROCESS:
   * 1. Check for duplicate removal/cash-out operations
   * 2. Handle cash-out through cashier service if requested
   * 3. Remove player from table and update state
   * 4. Handle hand advancement if player was in current hand
   * 5. Generate appropriate lifecycle plans
   * 
   * CONCURRENCY SAFETY:
   * - Prevents duplicate removal through tracking sets
   * - Handles hand state transitions consistently
   * 
   * @param userId Unique player identifier
   * @param options Optional cash-out configuration
   * @returns Array of lifecycle plans for player removal
   */
  async removePlayer(userId: string, options?: { cashOutAfterRemoval?: boolean }): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    if (this.cashedOutUserIds.has(userId)) {
      logger.warn({ userId }, "Duplicate remove/leave prevented (already cashed out)");
      return plans;
    }
    if (this.leaveInProgressUserIds.has(userId)) {
      logger.warn({ userId }, "Duplicate remove/leave prevented (leave already in progress)");
      return plans;
    }
    this.leaveInProgressUserIds.add(userId);
    try {
      let player = this.deps.state.playersById.get(userId);
      if (!player) return plans;

      const seat = player.seat;
      if (this.shouldForceFold(player) && this.deps.forceFoldIfInHand) {
        await this.deps.forceFoldIfInHand(userId);
        player = this.deps.state.playersById.get(userId);
        if (!player) return plans;
      }

      const remainingStack = player.stackCents;
      if (!options?.cashOutAfterRemoval) {
        await this.cashOutRemainingStack(userId, remainingStack);
      }

      this.deps.pendingSeatReleaseUserIds.delete(userId);
      this.deps.autoActionsByUserId.delete(userId);
      this.deps.currentHandAutoActedUserIds.delete(userId);

      this.deps.state.seats[player.seat] = "";
      this.deps.state.playersById.delete(userId);
      this.deps.getHoleCardsByPlayerId().delete(userId);
      this.syncBettingStateAfterRemoval();
      if (this.deps.persistence.enabled && typeof this.deps.persistence.handHistory?.removePlayer === "function") {
        await this.deps.persistence.handHistory.removePlayer(userId);
      }
      plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });

      logger.info({ userId }, "player left");
      plans.push({ kind: "ENSURE_HAND_ADVANCING_AFTER_PLAYER_REMOVAL", removedSeat: seat });

      if (options?.cashOutAfterRemoval) {
        await this.cashOutRemainingStack(userId, remainingStack);
      }
      maybeAssertStateInvariants(this.deps.state);
      return plans;
    } finally {
      this.leaveInProgressUserIds.delete(userId);
    }
  }

  // ============================================================================
  // CONNECTION MANAGEMENT METHODS
  // ============================================================================

  /**
   * Mark a player as disconnected with deadline
   * 
   * PROCESS:
   * 1. Update player connection state and deadline
   * 2. Generate snapshot and automation plans
   * 3. Validate state invariants
   * 
   * @param userId Unique player identifier
   * @param disconnectDeadlineTs Timestamp when disconnection becomes final
   * @returns Array of lifecycle plans for disconnection
   */
  markDisconnected(userId: string, disconnectDeadlineTs: number): PlayerLifecyclePlan[] {
    const plans: PlayerLifecyclePlan[] = [];
    const player = this.deps.state.playersById.get(userId);
    if (!player) return plans;

    player.connected = false;
    player.disconnectDeadlineTs = disconnectDeadlineTs;
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  markReconnected(userId: string): PlayerLifecyclePlan[] {
    const plans: PlayerLifecyclePlan[] = [];
    const player = this.deps.state.playersById.get(userId);
    if (!player) return plans;

    player.connected = true;
    if (player.status === "ABANDONED" && player.stackCents > 0 && this.deps.state.street === "WAITING") {
      player.status = "ACTIVE";
    }
    player.disconnectDeadlineTs = 0;
    this.deps.autoActionsByUserId.delete(userId);
    this.ensureToActHasNeedsActionIfNeeded(player.seat, userId);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "RECONNECT" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  async markAbandoned(userId: string): Promise<PlayerLifecyclePlan[]> {
    const plans: PlayerLifecyclePlan[] = [];
    let player = this.deps.state.playersById.get(userId);
    if (!player) return plans;

    if (this.shouldForceFold(player) && this.deps.forceFoldIfInHand) {
      await this.deps.forceFoldIfInHand(userId);
      player = this.deps.state.playersById.get(userId);
      if (!player) return plans;
    }

    player.connected = false;
    player.disconnectDeadlineTs = 0;
    player.status = "ABANDONED";
    player.needsAction = false;
    this.deps.pendingSeatReleaseUserIds.add(userId);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "SEAT_CHANGE" });

    if (this.deps.state.street === "WAITING") {
      plans.push({ kind: "RELEASE_PENDING_SEATS" });
      maybeAssertStateInvariants(this.deps.state);
      return plans;
    }

    if (countNotFoldedPlayers(this.deps.state) <= 1) {
      plans.push({ kind: "FINISH_HAND_BY_LAST_STANDING" });
      maybeAssertStateInvariants(this.deps.state);
      return plans;
    }

    if (this.deps.state.toActSeat === player.seat) {
      if (bettingRoundComplete(this.deps.state) || noFurtherBettingPossible(this.deps.state)) {
        plans.push({ kind: "ADVANCE_STREET_OR_SHOWDOWN" });
      } else {
        const nextSeat = findNextToActSeat(this.deps.state, player.seat);
        if (nextSeat === -1) {
          plans.push({ kind: "ADVANCE_STREET_OR_SHOWDOWN" });
          maybeAssertStateInvariants(this.deps.state);
          return plans;
        }
        this.deps.state.toActSeat = nextSeat;
        plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
      }
    } else {
      plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    }
    maybeAssertStateInvariants(this.deps.state);
    return plans;
  }

  // ============================================================================
  // HELPER & UTILITY METHODS
  // ============================================================================

  /**
   * Determine if player should be force-folded before removal
   * 
   * LOGIC:
   * Player must be ACTIVE and hand must be in progress
   * This ensures hand history and pot calculations remain consistent
   * 
   * @param player Player state to evaluate
   * @returns True if force-fold should be applied
   */
  private shouldForceFold(player: PlayerState): boolean {
    return this.deps.state.street !== "WAITING" && player.status === "ACTIVE";
  }

  /**
   * Ensure player has needsAction flag set for proper turn advancement
   * 
   * CONTEXT:
   * Called after seat changes or player restorations
   * Maintains betting round invariants when player returns to active hand
   * 
   * @param seat Seat number where player will be positioned
   * @param userId Unique player identifier
   */
  private ensureToActHasNeedsActionIfNeeded(seat: number, userId: string): void {
    const { state } = this.deps;
    if (state.street === "WAITING" || state.runoutMode === "STAGED") return;
    if (state.seats[state.toActSeat] !== userId) return;
    if (bettingRoundComplete(state) || noFurtherBettingPossible(state)) return;
    const player = state.playersById.get(userId);
    if (!player || !eligibleToAct(player)) return;
    player.needsAction = true;
  }

  /**
   * Validate buy-in amount against table limits
   * 
   * VALIDATION RULES:
   * 1. Must be positive integer
   * 2. Must meet minimum buy-in requirement
   * 3. Must not exceed maximum buy-in limit
   * 
   * @param buyInCents Amount to validate
   * @throws PokerError if validation fails
   */
  private assertValidBuyIn(buyInCents: number): void {
    if (!Number.isInteger(buyInCents) || buyInCents <= 0) {
      throw new PokerError("INVALID_BUYIN", "buyInCents must be a positive integer.");
    }
    if (buyInCents < this.deps.state.minBuyInCents) {
      throw new PokerError("INVALID_BUYIN", `buyInCents must be >= ${this.deps.state.minBuyInCents}.`);
    }
    if (buyInCents > this.deps.state.maxBuyInCents) {
      throw new PokerError("INVALID_BUYIN", `buyInCents must be <= ${this.deps.state.maxBuyInCents}.`);
    }
  }

  /**
   * Process cash-out for remaining player stack
   * 
   * PROCESS:
   * 1. Validate remaining stack amount
   * 2. Check for duplicate cash-out operations
   * 3. Process external cash-out through cashier service
   * 4. Handle errors and maintain tracking state
   * 
   * IDEMPOTENCY:
   * Uses unique external reference for transaction safety
   * 
   * @param userId Unique player identifier
   * @param remainingStack Amount to cash out
   */
  private async cashOutRemainingStack(userId: string, remainingStack: number): Promise<void> {
    if (remainingStack <= 0) return;
    if (this.cashedOutUserIds.has(userId)) {
      logger.warn({ userId }, "Duplicate cash-out prevented");
      return;
    }
    this.cashedOutUserIds.add(userId);

    const externalRef = `cashout_${this.deps.state.tableId}_${userId}_${Date.now()}_${nanoid(6)}`;
    try {
      await CashierService.processCashGameCashOut({
        userId,
        tableId: this.deps.state.tableId,
        amountCents: remainingStack,
        externalRef,
        tableMeta: {
          name: this.deps.state.tableName,
        },
      });
      logger.info({ userId, remainingStack }, "cash-out processed");
    } catch (err: unknown) {
      this.cashedOutUserIds.delete(userId);
      logger.error({ userId, err }, "cash-out failed, funds may be locked in PlayerBalance");
    }
  }

  /**
   * Synchronize betting state after player removal to maintain consistency
   * 
   * PURPOSE:
   * Ensures roundCurrentBetCents never exceeds any player's roundBetCents
   * Prevents chip inflation and maintains betting round integrity
   */
  private syncBettingStateAfterRemoval(): void {
    if (this.deps.state.street === "WAITING") {
      // In WAITING we only need monotonic safety: roundCurrentBet must never exceed any seat roundBet.
      let maxRoundBet = 0;
      for (const p of this.deps.state.playersById.values()) {
        maxRoundBet = Math.max(maxRoundBet, p.roundBetCents);
      }
      this.deps.state.roundCurrentBetCents = maxRoundBet;
      return;
    }
    syncRoundCurrentBetCents(this.deps.state);
  }
}
