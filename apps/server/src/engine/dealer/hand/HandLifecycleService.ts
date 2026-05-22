/**
 * HandLifecycleService - Core Poker Hand Management
 * 
 * PURPOSE:
 * Manages the complete lifecycle of a poker hand from initialization through completion.
 * Handles betting rounds, street transitions, showdowns, and pot distribution.
 * 
 * KEY RESPONSIBILITIES:
 * - Hand initialization and player state management
 * - Street transitions (preflop → flop → turn → river → showdown)
 * - Pot calculation and side pot management
 * - Winner determination and chip distribution
 * - State invariants and financial integrity checks
 * 
 * DETERMINISM:
 * All settlement logic is deterministic - no randomness in payout calculations.
 * Uses seat order for tie-breaking to ensure reproducible results.
 * 
 * USAGE:
 * const service = new HandLifecycleService(dependencies);
 * const plans = await service.startHand();
 * // Execute plans through Dealer execution layer
 */

// ============================================================================
// IMPORTS - External Dependencies
// ============================================================================
import { newId } from "../../../lib/ids.js";
import { logger } from "../../../lib/logger.js";
import pokersolver from "pokersolver";
import { isRoundStateMachineEnabled } from "../../../config/features.js";

// ============================================================================
// IMPORTS - Internal Dependencies
// ============================================================================
import { DeckService } from "../../cards/DeckService.js";
import { PokerError } from "../../errors.js";
import type { PersistenceFacade } from "../../persistence/PersistenceFacade.js";
import type { PokerState, RoundState, Street } from "../../../state/PokerState.js";

// ============================================================================
// IMPORTS - Poker Rules & Game Logic
// ============================================================================
import {
  allRemainingPlayersAllInOrFolded,
  eligibleToAct,
  eligibleForShowdown,
  noFurtherBettingPossible,
  resetBettingRound,
  syncRoundCurrentBetCents,
} from "../../rules/BettingRound.js";
import { buildSidePots, splitPotCents } from "../../rules/SidePotManager.js";

// ============================================================================
// IMPORTS - Services
// ============================================================================
import { SettlementService } from "../settlement/SettlementService.js";

// ============================================================================
// IMPORTS - Utilities & Helpers
// ============================================================================
import {
  countActiveHumanPlayers,
  findNextToActSeat,
  resolveActivePlayersForHand,
  seatOrderLeftOfDealer,
} from "../utils/TableNavigator.js";

// ============================================================================
// IMPORTS - Invariants & Validation
// ============================================================================
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";
import { maybeAssertBettingState } from "../../invariants/assertBettingState.js";
import { assertMoneyConservationTransition } from "../../invariants/assertMoneyConservation.js";
import { shouldFailClosedMoneyPath } from "../../invariants/moneyStrictMode.js";

// ============================================================================
// IMPORTS - Constants & Timing
// ============================================================================
import { getHandResultHoldMs, getRunoutStageDelayMs } from "../timing.js";

// ============================================================================
// IMPORTS - Type Definitions
// ============================================================================
import type { SnapshotReason } from "./SnapshotService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Poker solver type definition for hand evaluation
 */
const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): unknown;
    winners(hands: unknown[]): unknown[];
  };
};

/**
 * Result type for solved poker hand
 */
type SolvedHand = { descr?: string; name?: string };

/**
 * Plan types for hand lifecycle execution
 * Each plan represents an atomic operation that can be executed by the Dealer
 */
export type HandLifecyclePlan =
  | { kind: "EMIT_SNAPSHOT"; reason: SnapshotReason; actionId?: string }
  | { kind: "DELAY"; ms: number }
  | { kind: "MAYBE_AUTOMATE_TURN" }
  | { kind: "TRANSITION_TO_WAITING" }
  | { kind: "RELEASE_PENDING_SEATS" }
  | { kind: "SCHEDULE_NEXT_HAND"; reason: string; delayMs?: number }
  | { kind: "HAND_ENDED"; reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK"; outcome: { potCents: number; winnerId?: string; payoutsByUserId: Record<string, number> } };


// ============================================================================
// MAIN CLASS - Hand Lifecycle Management
// ============================================================================

/**
 * HandLifecycleService - Core service for managing poker hand lifecycle
 * 
 * This class orchestrates the complete flow of a poker hand from start to finish.
 * It maintains deterministic behavior for fair gameplay and provides comprehensive
 * error handling and state validation.
 */
export class HandLifecycleService {
  // ============================================================================
  // CLASS PROPERTIES
  // ============================================================================
  
  /** Lifetime: one hand. Set in startHand after we have 2+ active players; cleared at start of startHand. */
  private deck: DeckService | null = null;
  /** Set in startHand when we have 2+ active players; reset at start of startHand. Meaningful only after a successful hand start. */
  private currentHandIncludesBotParticipants = false;
  /** Players dealt into the current hand. Only these players may have needsAction=true during this hand. */
  private currentHandInHandIds = new Set<string>();
  /** Financial participants snapshot captured at hand start - immutable settlement data */
  private handParticipants = new Map<string, { committedCents: number; stackAtStart: number }>();

  // ============================================================================
  // CONSTRUCTOR & DEPENDENCIES
  // ============================================================================
  
  /**
   * Initialize HandLifecycleService with required dependencies
   * @param deps - Service dependencies for state, persistence, and settlement
   */
  constructor(private readonly deps: {
    state: PokerState;
    persistence: PersistenceFacade;
    settlementService: SettlementService;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    getHandStartingStacksByPlayerId: () => Map<string, number>;
    currentHandAutoActedUserIds: Set<string>;
    /** Hand-setup only: clear at hand start. Action dedup (check/record) lives in Dealer/HandContext. */
    getProcessedActionIds: () => Set<string>;
    applyDisconnectedAutoActionCapForHand: () => Promise<void>;
    setLastHandResult: (value: TableSnapshotPayload["lastHandResult"] | undefined) => void;
    setLastAction: (value: TableSnapshotPayload["lastAction"] | undefined) => void;
    onWaitingForActionEntered?: (reason: string) => void;
  }) {}

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Calculate total chips across all players
   * @returns Sum of all player stack sizes
   */
  private sumStacksCents(): number {
    let sum = 0;
    for (const p of this.deps.state.playersById.values()) {
      if (p) {
        sum += p.stackCents;
      }
    }
    return sum;
  }

  private getHoleCardsByPlayerIdSafe(): Map<string, string[]> {
    if (typeof this.deps.getHoleCardsByPlayerId === "function") {
      return this.deps.getHoleCardsByPlayerId();
    }
    return new Map<string, string[]>();
  }

  private getHandStartingStacksByPlayerIdSafe(): Map<string, number> {
    if (typeof this.deps.getHandStartingStacksByPlayerId === "function") {
      return this.deps.getHandStartingStacksByPlayerId();
    }
    return new Map<string, number>();
  }

  private getProcessedActionIdsSafe(): Set<string> {
    if (typeof this.deps.getProcessedActionIds === "function") {
      return this.deps.getProcessedActionIds();
    }
    return new Set<string>();
  }

  private isAllowedRoundTransition(from: RoundState, to: RoundState): boolean {
    // New hand creation is a lifecycle reset boundary; allow transition to ROUND_INIT.
    if (to === "ROUND_INIT") return true;
    if (from === to) return true;
    switch (from) {
      case "ROUND_INIT":
        return to === "WAITING_FOR_ACTION" || to === "ROUND_COMPLETE" || to === "RUNOUT" || to === "HAND_COMPLETE";
      case "WAITING_FOR_ACTION":
        return to === "WAITING_FOR_ACTION" || to === "ROUND_COMPLETE" || to === "HAND_COMPLETE";
      case "ROUND_COMPLETE":
        return to === "RUNOUT" || to === "SHOWDOWN";
      case "RUNOUT":
        return to === "SHOWDOWN";
      case "SHOWDOWN":
        return to === "HAND_COMPLETE";
      case "HAND_COMPLETE":
        return false;
      default:
        return false;
    }
  }

  private transitionRoundState(next: RoundState, reason: string): boolean {
    const prev = this.deps.state.roundState;
    if (!isRoundStateMachineEnabled()) {
      this.deps.state.roundState = next;
      return true;
    }
    if (prev === next) return true;
    const playersRemaining = [...this.deps.state.playersById.values()].filter(
      (player) =>
        this.currentHandInHandIds.has(player.id) &&
        player.status !== "FOLDED" &&
        player.status !== "OUT" &&
        player.status !== "ABANDONED",
    ).length;
    const actionablePlayers = findNextToActSeat(this.deps.state, this.deps.state.dealerSeat) === -1 ? 0 : 1;
    const bettingClosed = noFurtherBettingPossible(this.deps.state);
    const commonLogFields = {
      tableId: this.deps.state.tableId,
      handId: this.deps.state.handId,
      street: this.deps.state.street,
      toActSeat: this.deps.state.toActSeat,
      turnDeadlineMs: this.deps.state.turnDeadlineMs,
      playersRemaining,
      actionablePlayers,
      bettingClosed,
      fromRoundState: prev,
      toRoundState: next,
      reason,
    };
    if (!this.isAllowedRoundTransition(prev, next)) {
      logger.warn(commonLogFields, "ROUND_STATE_TRANSITION_REJECTED");
      return false;
    }
    this.deps.state.roundState = next;
    logger.info(commonLogFields, "ROUND_STATE_TRANSITION");
    if (next === "WAITING_FOR_ACTION") {
      this.deps.onWaitingForActionEntered?.(reason);
    }
    return true;
  }

  /**
   * Apply hand-scoped needsAction flags for the current street.
   * Only players dealt into this hand can be actionable.
   */
  private applyNeedsActionForCurrentHand(): void {
    const { state } = this.deps;
    for (const player of state.playersById.values()) {
      player.needsAction = this.currentHandInHandIds.has(player.id) && eligibleToAct(player);
    }
  }

  private assignToActSeatWithTrace(state: PokerState, nextSeat: number, trigger: string): void {
    state.toActSeat = nextSeat;
    if (nextSeat >= 0) {
      const toActUserId = state.seats[nextSeat] ?? "";
      const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
      if (toActPlayer) {
        toActPlayer.needsAction = true;
      }
    }
    if (process.env.POKER_TRACE_TO_ACT_ASSIGNMENTS !== "1") return;
    if (nextSeat < 0) return;
    const toActUserId = state.seats[nextSeat] ?? "";
    const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || toActPlayer.needsAction) return;
    logger.error(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        toActSeat: nextSeat,
        toActUserId,
        status: toActPlayer.status,
        needsAction: toActPlayer.needsAction,
        roundBetCents: toActPlayer.roundBetCents,
        committedCents: toActPlayer.committedCents,
        trigger,
        stack: new Error("TO_ACT_ASSIGNMENT_TRACE").stack,
      },
      "TO_ACT_ASSIGNED_WITHOUT_NEEDS_ACTION",
    );
  }

  private assertHandResultPayoutsOrThrow(
    payoutsByUserId: Record<string, number>,
    potCents: number,
    context: string,
  ): void {
    const payoutSum = Object.values(payoutsByUserId).reduce((sum, amount) => sum + amount, 0);
    if (payoutSum !== potCents) {
      throw new PokerError(
        "BAD_STATE",
        `${context}: HAND_RESULT_PAYOUTS_MUST_EQUAL_POT (payouts=${payoutSum}, pot=${potCents}, hand=${this.deps.state.handId}).`,
      );
    }
  }

  private shouldAssertLedgerForCurrentHand(): boolean {
    return !this.currentHandIncludesBotParticipants;
  }

  // ============================================================================
  // CALCULATION & VALIDATION METHODS
  // ============================================================================

  /**
   * Calculate uncalled chips that must be returned to aggressor before final payout.
   *
   * PROCESS:
   * 1. Identify all players who contributed chips (committed > 0)
   * 2. Sort by contribution amount (highest first)
   * 3. Calculate difference between highest and second-highest contributors
   * 4. Only ACTIVE players can have uncalled chips (ALL_IN players commit everything)
   *
   * EXAMPLE:
   * Player A bets 1000, Player B (100 chips) folds
   * → A's 900 is uncalled and must be returned, not paid from pot
   *
   * @param state Current poker state
   * @returns Object with uncalled amount and player ID, or zero if no uncalled chips
   */
  private calculateUncalledCents(state: PokerState): { cents: number; playerId: string | null } {
    // Step 1: Get all contributors sorted by contribution amount
    const contributors = [...state.playersById.values()]
      .filter((p) => p.status !== "OUT" && p.committedCents > 0)
      .map((p) => ({ id: p.id, committed: p.committedCents, status: p.status }))
      .sort((a, b) => b.committed - a.committed);

    // Step 2: Handle trivial case (single contributor)
    if (contributors.length < 2) {
      return { cents: 0, playerId: null };
    }

    // Step 3: Calculate uncalled amount for top contributor
    const top = contributors[0]!;
    const secondHighest = contributors[1]!.committed;

    // Step 4: Only ACTIVE players can have uncalled chips
    if (top.status !== "ACTIVE") {
      return { cents: 0, playerId: null };
    }

    const uncalledCents = top.committed - secondHighest;
    if (uncalledCents <= 0) return { cents: 0, playerId: null };

    return { cents: uncalledCents, playerId: top.id };
  }

  /**
   * Assert chip mass conservation throughout hand lifecycle
   *
   * VALIDATION RULES:
   * 1. Total chip mass must remain constant (stacks + pot - disbursed = initial)
   * 2. If requireFullySettled: pot must be fully disbursed and stacks restored
   *
   * @param state Current poker state
   * @param context Context description for error reporting
   * @param requireFullySettled Whether to enforce full settlement checks
   */
  private assertHandMassOrThrow(state: PokerState, context: string, requireFullySettled = false): void {
    const { settlementService } = this.deps;
    const totalStacksCents = this.sumStacksCents();
    const disbursedCents = settlementService.getCurrentHandPotDisbursedCents();
    const effectiveMassCents = totalStacksCents + state.potCents - disbursedCents;
    const totalCommittedCents = [...state.playersById.values()]
      .reduce((sum, player) => sum + (player.committedCents || 0), 0);

    // Compatibility fallback for tests that seed an in-progress hand directly
    // without running startHand() (which initializes initialChipMassCents).
    if (state.initialChipMassCents <= 0) {
      state.initialChipMassCents = effectiveMassCents;
    }
    
    // Rule 1: Total chip mass conservation
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        context,
        requireFullySettled,
        initialChipMassCents: state.initialChipMassCents,
        effectiveMassCents,
        totalStacksCents,
        totalCommittedCents,
        potCents: state.potCents,
        disbursedCents,
      },
      "CHIP_MASS_ASSERT",
    );
    if (effectiveMassCents !== state.initialChipMassCents) {
      throw new PokerError(
        "BAD_STATE",
        `${context}: hand chip mass mismatch (initial=${state.initialChipMassCents}, effective=${effectiveMassCents}, stacks=${totalStacksCents}, pot=${state.potCents}, disbursed=${disbursedCents}, hand=${state.handId}).`,
      );
    }
    
    // Rule 2: Full settlement validation (if required)
    if (requireFullySettled) {
      if (disbursedCents !== state.potCents) {
        throw new PokerError(
          "BAD_STATE",
          `${context}: expected pot disbursed to equal pot (pot=${state.potCents}, disbursed=${disbursedCents}, hand=${state.handId}).`,
        );
      }
      if (totalStacksCents !== state.initialChipMassCents) {
        throw new PokerError(
          "BAD_STATE",
          `${context}: ending stack mass mismatch (initial=${state.initialChipMassCents}, stacks=${totalStacksCents}, hand=${state.handId}).`,
        );
      }
    }
  }

  // ============================================================================
  // HAND LIFECYCLE METHODS
  // ============================================================================

  /**
   * Initialize and start a new poker hand
   * 
   * PROCESS:
   * 1. Reset hand state and clear previous data
   * 2. Validate minimum active players
   * 3. Resolve active players and update dealer position
   * 4. Initialize deck and deal hole cards
   * 5. Post blinds and set up first action
   * 6. Generate execution plans for Dealer
   * 
   * @returns Array of lifecycle plans to be executed
   */
  async startHand(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (state.roundState !== "HAND_COMPLETE") {
      logger.error(
        {
          tableId: state.tableId,
          handId: state.handId,
          street: state.street,
          roundState: state.roundState,
          toActSeat: state.toActSeat,
        },
        "HAND_START_WITH_INVALID_ROUND_STATE",
      );
    }
    this.deck = null;
    this.currentHandIncludesBotParticipants = false;
    this.currentHandInHandIds.clear();
    this.getHandStartingStacksByPlayerIdSafe().clear();
    if (countActiveHumanPlayers(state) === 0) return plans;
    state.runningSinceTs = Date.now();

    const handId = newId("hand");
    this.transitionRoundState("ROUND_INIT", "HAND_CREATE");
    state.handId = handId;
    state.handNumber += 1;
    this.deps.currentHandAutoActedUserIds.clear();
    this.deps.settlementService.resetHandCounters();
    this.getProcessedActionIdsSafe().clear();
    state.street = "PREFLOP";
    state.runoutMode = "NONE";
    state.board.clear();
    state.potCents = 0;
    state.handActionSeq = 0;
    state.toActSeat = -1;
    state.actionCount = 0;
    state.initialChipMassCents = 0;
    state.nextHandAtTs = 0;
    this.deps.setLastHandResult(undefined);
    this.deps.setLastAction(undefined);

    resetBettingRound(state);

    // Consume one-hand sit-out tokens and reset player states in single pass
    for (const player of state.playersById.values()) {
      player.sittingOutUntilNextHand = false;
      if (
        (player.connected || state.tournamentMode) &&
        player.status === "ABANDONED" &&
        player.stackCents > 0
      ) {
        player.status = "ACTIVE";
      }
      player.roundBetCents = 0;
      player.committedCents = 0;
      player.needsAction = false;
      if (player.status !== "OUT" && player.status !== "ABANDONED") {
        player.status = player.stackCents > 0 ? "ACTIVE" : "OUT";
      }
    }

    // Resolve active players for this hand after consuming sit-out-until-next-hand flags.
    const activePlayers = resolveActivePlayersForHand(state);

    // 🔴 CRITICAL: Capture financial participants snapshot for settlement
    // This freezes financial timeline regardless of player removal during hand
    this.handParticipants.clear();
    for (const player of activePlayers) {
      this.handParticipants.set(player.id, {
        committedCents: 0, // Will be updated as betting progresses
        stackAtStart: player.stackCents
      });
    }

    if (activePlayers.length < 2) {
      state.handId = "";
      state.street = "WAITING";
      state.runoutMode = "NONE";
      state.toActSeat = -1;
      this.transitionRoundState("HAND_COMPLETE", "START_HAND_INSUFFICIENT_PLAYERS");
      this.currentHandInHandIds.clear();
      plans.push({ kind: "EMIT_SNAPSHOT", reason: "AUTO_TRANSITION" });
      maybeAssertStateInvariants(state);
      return plans;
    }

    state.initialChipMassCents = this.sumStacksCents() + state.potCents;

    const activeSeats = activePlayers
      .map((player) => player.seat)
      .sort((a, b) => a - b);
    const nextSeatFrom = (fromSeat: number): number => {
      const next = activeSeats.find((seat) => seat > fromSeat);
      return next ?? activeSeats[0]!;
    };
    state.dealerSeat = nextSeatFrom(state.dealerSeat);

    this.deck = new DeckService();
    this.deck.shuffle();
    this.currentHandIncludesBotParticipants = activePlayers.some((player) => player.kind === "BOT");
    this.currentHandInHandIds = new Set(activePlayers.map((player) => player.id));

    const startingStacksByUserId = new Map<string, number>();
    for (const player of activePlayers) {
      startingStacksByUserId.set(player.id, player.stackCents);
      this.getHandStartingStacksByPlayerIdSafe().set(player.id, player.stackCents);
    }

    const holeCards = this.getHoleCardsByPlayerIdSafe();
    holeCards.clear();
    for (const player of activePlayers) {
      const cards = [this.drawCard(), this.drawCard()];
      holeCards.set(player.id, cards);
    }

    if (this.deps.persistence.enabled && typeof this.deps.persistence.handHistory?.startHand === "function") {
      await this.deps.persistence.handHistory.startHand({
        tableId: state.tableId,
        handId,
        dealerSeat: state.dealerSeat,
        smallBlindCents: state.smallBlindCents,
        bigBlindCents: state.bigBlindCents,
        players: activePlayers.map((player) => ({
          id: player.id,
          seat: player.seat,
          startingStackCents: startingStacksByUserId.get(player.id) ?? player.stackCents,
          holeCards: holeCards.get(player.id) ?? [],
        })),
      });
    }

    const isHeadsUp = activePlayers.length === 2;
    const sbSeat = isHeadsUp ? state.dealerSeat : nextSeatFrom(state.dealerSeat);
    const bbSeat = nextSeatFrom(sbSeat);
    state.sbSeat = sbSeat;
    state.bbSeat = bbSeat;

    const sbId = state.seats[sbSeat];
    const bbId = state.seats[bbSeat];

    let postedSb = 0;
    let postedBb = 0;

    // Assign handId (state assignment cannot throw)
    state.handId = handId;

    if (sbId) {
      const sb = state.playersById.get(sbId);
      if (!sb) throw new PokerError("BAD_STATE", "Small blind player missing.");
      if (sb.status !== "ACTIVE") {
        logger.error({ handId: state.handId, sbSeat, sbStatus: sb.status }, "SB not ACTIVE at hand start");
        throw new PokerError("BAD_STATE", "Small blind must be ACTIVE at hand start.");
      }
      postedSb = await this.deps.settlementService.postBlind(sb, "SB", state.smallBlindCents);
    }

    if (bbId) {
      const bb = state.playersById.get(bbId);
      if (!bb) throw new PokerError("BAD_STATE", "Big blind player missing.");
      if (bb.status !== "ACTIVE") {
        logger.error({ handId: state.handId, bbSeat, bbStatus: bb.status }, "BB not ACTIVE at hand start");
        throw new PokerError("BAD_STATE", "Big blind must be ACTIVE at hand start.");
      }
      postedBb = await this.deps.settlementService.postBlind(bb, "BB", state.bigBlindCents);
    }

    syncRoundCurrentBetCents(state);
    if (postedBb > 0) {
      state.roundCurrentBetCents = Math.max(state.roundCurrentBetCents, postedBb);
    } else if (postedSb > 0) {
      state.roundCurrentBetCents = Math.max(state.roundCurrentBetCents, postedSb);
    }
    state.minRaiseCents = state.bigBlindCents;
    this.applyNeedsActionForCurrentHand();

    // Preflop at hand start: players already matched to the current blind level
    // do not owe an action yet (e.g. BB before action reaches them).
    if (state.roundCurrentBetCents > 0) {
      for (const player of state.playersById.values()) {
        if (!this.currentHandInHandIds.has(player.id)) continue;
        if (!eligibleToAct(player)) continue;
        if (player.roundBetCents >= state.roundCurrentBetCents) {
          player.needsAction = false;
        }
      }
    }

    // Preflop always begins from the seat left of the BB among players who still need action.
    // Heads-up naturally resolves to SB first when SB is actionable.
    const firstToActSeat = findNextToActSeat(state, bbSeat);
    this.assignToActSeatWithTrace(state, firstToActSeat, "HAND_START_ASSIGN_FIRST_TO_ACT");
    if (state.toActSeat === -1) {
      if (allRemainingPlayersAllInOrFolded(state) || noFurtherBettingPossible(state)) {
        this.transitionRoundState("RUNOUT", "START_HAND_NO_ACTIONABLE_ACTOR");
        state.runoutMode = "STAGED";
        logger.info(
          { handId: state.handId, tableId: state.tableId, sbSeat, bbSeat },
          "HAND_START_NO_ACTIONABLE_ACTOR_RUNOUT",
        );
        plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_START" });
        plans.push(...(await this.finishHandShowdownWithSidePots()));
        maybeAssertStateInvariants(state);
        return plans;
      }
      throw new PokerError("BAD_STATE", "No seat needs action at hand start.");
    }
    const toActId = state.seats[state.toActSeat] ?? "";
    const toActPlayer = toActId ? state.playersById.get(toActId) : undefined;
    if (!toActPlayer || toActPlayer.status !== "ACTIVE" || !toActPlayer.needsAction) {
      throw new PokerError("BAD_STATE", "toAct must be ACTIVE with needsAction at hand start.");
    }
    this.transitionRoundState("WAITING_FOR_ACTION", "HAND_START_READY_FOR_ACTION");

    logger.info({ handId: state.handId }, "hand started");
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_START" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    maybeAssertBettingState(state);
    maybeAssertStateInvariants(state);
    return plans;
  }

  /**
   * Advance to next street or proceed to showdown
   * 
   * DECISION LOGIC:
   * 1. Check if betting is complete (all-in/folded or no further betting)
   * 2. If complete → runout to showdown
   * 3. If not complete → deal community cards for next street
   * 4. Set up next action and validate state
   * 
   * @returns Array of lifecycle plans for street transition
   */
  async advanceStreetOrShowdown(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (isRoundStateMachineEnabled() && state.roundState === "HAND_COMPLETE") {
      logger.warn(
        { tableId: state.tableId, handId: state.handId, street: state.street },
        "ADVANCE_STREET_OR_SHOWDOWN_SKIPPED_HAND_ALREADY_COMPLETE",
      );
      return plans;
    }
    state.turnDeadlineMs = 0;
    const totalStacksBeforeCents = this.sumStacksCents();
    const potCentsBefore = state.potCents;
    const disbursedBefore = this.deps.settlementService.getCurrentHandPotDisbursedCents();
    if (state.street === "WAITING") {
      throw new PokerError("BAD_STATE", "advanceStreetOrShowdown while WAITING.");
    }
    if (
      state.runoutMode === "STAGED" &&
      !allRemainingPlayersAllInOrFolded(state) &&
      !noFurtherBettingPossible(state)
    ) {
      throw new PokerError("BAD_STATE", "STAGED runout entered while betting is still possible.");
    }

    if (
      state.runoutMode === "STAGED" ||
      allRemainingPlayersAllInOrFolded(state) ||
      noFurtherBettingPossible(state)
    ) {
      this.transitionRoundState("ROUND_COMPLETE", "BETTING_CLOSED_OR_RUNOUT");
      this.transitionRoundState("RUNOUT", "RUNOUT_REQUIRED");
      state.runoutMode = "STAGED";
      return this.finishHandShowdownWithSidePots();
    }

    const next = this.nextStreet(state.street);
    if (next === "SHOWDOWN") {
      this.transitionRoundState("ROUND_COMPLETE", "RIVER_ROUND_COMPLETE");
      this.transitionRoundState("SHOWDOWN", "RIVER_TERMINAL");
      state.street = "SHOWDOWN";
      return this.finishHandShowdownWithSidePots();
    }

    this.transitionRoundState("ROUND_COMPLETE", "ROUND_COMPLETE_ADVANCE_STREET");
    state.street = next;
    state.runoutMode = "NONE";
    this.dealCommunityForStreet(next);
    this.transitionRoundState("ROUND_INIT", "STREET_ADVANCED_ROUND_INIT");

    resetBettingRound(state);
    this.applyNeedsActionForCurrentHand();
    this.assignToActSeatWithTrace(
      state,
      findNextToActSeat(state, state.dealerSeat),
      "HAND_LIFECYCLE_STREET_ADVANCE",
    );
    if (state.toActSeat === -1) {
      // Churn windows can transition streets with no actionable seat (all-in/folded/abandoned mix).
      // In this case run out directly to showdown instead of surfacing BAD_STATE.
      this.transitionRoundState("RUNOUT", "STREET_ADVANCE_NO_ACTIONABLE_ACTOR");
      state.runoutMode = "STAGED";
      return this.finishHandShowdownWithSidePots();
    }
    const toActUserId = state.seats[state.toActSeat] ?? "";
    const toActPlayer = toActUserId ? state.playersById.get(toActUserId) : undefined;
    if (!toActPlayer || toActPlayer.status !== "ACTIVE") {
      throw new PokerError("BAD_STATE", "Street advance selected non-ACTIVE toAct player.");
    }
    // Defensive self-heal: actionable toAct must require action on new street.
    if (!toActPlayer.needsAction) {
      logger.warn(
        {
          tableId: state.tableId,
          handId: state.handId,
          street: state.street,
          toActSeat: state.toActSeat,
          toActUserId,
        },
        "TO_ACT_NEEDS_ACTION_REPAIRED_AFTER_STREET_ADVANCE",
      );
      toActPlayer.needsAction = true;
    }
    this.transitionRoundState("WAITING_FOR_ACTION", "NEXT_STREET_ACTIONABLE");
    logger.info(
      { tableId: state.tableId, handId: state.handId, street: next, toActSeat: state.toActSeat, toActUserId },
      "STREET_ADVANCE_COMPLETED",
    );
    logger.info(
      { tableId: state.tableId, handId: state.handId, street: next, toActSeat: state.toActSeat, toActUserId },
      "NEXT_ACTOR_SELECTED",
    );

    plans.push({ kind: "EMIT_SNAPSHOT", reason: "AUTO_TRANSITION" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    assertMoneyConservationTransition({
      event: "STREET_SETTLE",
      actionType: "STREET_TRANSITION",
      street: state.street,
      state,
      potCentsBefore,
      potCentsAfter: state.potCents,
      totalStacksBeforeCents,
      totalStacksAfterCents: this.sumStacksCents(),
      potDisbursedCentsBefore: disbursedBefore,
      potDisbursedCentsAfter: this.deps.settlementService.getCurrentHandPotDisbursedCents(),
      expectedPotDeltaCents: 0,
      expectedMassDeltaCents: 0,
    });
    maybeAssertBettingState(state);
    maybeAssertStateInvariants(state);
    return plans;
  }

  // ============================================================================
  // HAND COMPLETION METHODS
  // ============================================================================

  /**
   * Complete hand when only one player remains (last standing)
   * 
   * SCENARIOS:
   * 1. NORMAL: One ACTIVE/ALL_IN player vs folded opponents
   * 2. DEFENSIVE: No active players (corruption/edge case)
   * 
   * PROCESS:
   * 1. Return uncalled chips to aggressor
   * 2. Credit remaining pot to winner
   * 3. Validate chip conservation
   * 4. Generate hand result and cleanup plans
   * 
   * @returns Array of lifecycle plans for hand completion
   */
  async finishHandByLastStanding(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (isRoundStateMachineEnabled() && state.roundState === "HAND_COMPLETE") {
      logger.warn(
        { tableId: state.tableId, handId: state.handId, street: state.street },
        "FINISH_HAND_LAST_STANDING_SKIPPED_HAND_ALREADY_COMPLETE",
      );
      return plans;
    }
    state.turnDeadlineMs = 0;
    const remaining = [...state.playersById.values()].filter(
      (p) => p.status === "ACTIVE" || p.status === "ALL_IN",
    );
    const notFoldedOrOut = [...state.playersById.values()].filter(
      (p) => p.status !== "FOLDED" && p.status !== "OUT" && p.status !== "ABANDONED",
    );

    // ── DEFENSIVE FALLBACK: no ACTIVE/ALL_IN players remain ──────────────────
    // e.g. a sole survivor who is ABANDONED with chips.
    if (remaining.length === 0) {
      this.transitionRoundState("HAND_COMPLETE", "LAST_PLAYER_DEFENSIVE_FALLBACK");
      let winner: typeof notFoldedOrOut[0];
      const payoutsByUserId: Record<string, number> = {};

      if (notFoldedOrOut.length === 1) {
        winner = notFoldedOrOut[0]!;
      } else {
        // Deterministic: pick earliest seat left of dealer among survivors
        winner = seatOrderLeftOfDealer(state)
          .map((id) => state.playersById.get(id))
          .find((p) => p && p.status !== "FOLDED" && p.status !== "OUT" && p.status !== "ABANDONED")!;
      }

      // Step 1: Return any uncalled chips (prevents pot inflation)
      const { cents: uncalledCents, playerId: uncalledPlayerId } = this.calculateUncalledCents(state);
      if (uncalledCents > 0 && uncalledPlayerId) {
        const uncalledPlayer = state.playersById.get(uncalledPlayerId);
        if (uncalledPlayer) {
          await this.deps.settlementService.creditRefundToPlayer(uncalledPlayer, uncalledCents, "UNCALLED_BET_RETURN");
          payoutsByUserId[uncalledPlayer.id] = (payoutsByUserId[uncalledPlayer.id] ?? 0) + uncalledCents;
        }
      }

      // Step 2: Disburse exactly what remains in the pot
      const disbursedCents = this.deps.settlementService.getCurrentHandPotDisbursedCents();
      const creditAmount = state.potCents - disbursedCents;
      await this.deps.settlementService.creditPayoutToPlayer(winner, creditAmount);
      payoutsByUserId[winner.id] = (payoutsByUserId[winner.id] ?? 0) + creditAmount;

      this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE_POST_PAYOUT", true);
      await this.deps.applyDisconnectedAutoActionCapForHand();
      syncRoundCurrentBetCents(state);
      await this.deps.settlementService.finalizePersistedHand("ALL_FOLDED");
      this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE_PRE_FINALIZE", true);
      this.assertHandResultPayoutsOrThrow(payoutsByUserId, state.potCents, "HAND_END_LAST_STANDING_DEFENSIVE");
      this.deps.setLastHandResult({
        handId: state.handId,
        reason: "LAST_PLAYER",
        potCents: state.potCents,
        winnerId: winner.id,
        payoutsByUserId,
        board: [...state.board],
      });
      this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE", true);
      plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });
      plans.push({
        kind: "HAND_ENDED",
        reason: "DEFENSIVE_FALLBACK",
        outcome: {
          potCents: state.potCents,
          winnerId: winner.id,
          payoutsByUserId,
        },
      });
      plans.push({ kind: "TRANSITION_TO_WAITING" });
      plans.push({ kind: "RELEASE_PENDING_SEATS" });
      plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: getHandResultHoldMs() });
      if (this.deps.persistence.enabled && this.shouldAssertLedgerForCurrentHand()) {
        await this.deps.persistence.assertHandBalanced(state.handId);
      }
      this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE", true);
      maybeAssertStateInvariants(state);
      return plans;
    }

    if (notFoldedOrOut.length > 1) {
      throw new PokerError("BAD_STATE", "finishHandByLastStanding: no ACTIVE/ALL_IN but multiple non-folded players.");
    }
    if (remaining.length !== 1) {
      throw new PokerError("BAD_STATE", "finishHandByLastStanding called with != 1 remaining player.");
    }

    // ── NORMAL LAST-STANDING: winner is the one remaining ACTIVE/ALL_IN player ──
    const winner = remaining[0]!;
    this.transitionRoundState("HAND_COMPLETE", "LAST_PLAYER_STANDING");
    const payoutsByUserId: Record<string, number> = {};
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        potCents: state.potCents,
        winnerIds: [winner.id],
        payoutsByUserId,
      },
      "PAYOUT_BEGIN",
    );

    // Step 1: Identify and return uncalled chips before touching the pot.
    // Example: A bets 1000, B (100 chips) folds → A's 900 is uncalled and must be returned.
    const { cents: uncalledCents, playerId: uncalledPlayerId } = this.calculateUncalledCents(state);
    if (uncalledCents > 0 && uncalledPlayerId) {
      const uncalledPlayer = state.playersById.get(uncalledPlayerId);
      if (uncalledPlayer) {
        logger.info(
          { handId: state.handId, playerId: uncalledPlayerId, uncalledCents },
          "Returning uncalled bet before last-standing payout",
        );
        await this.deps.settlementService.creditRefundToPlayer(uncalledPlayer, uncalledCents, "UNCALLED_BET_RETURN");
        payoutsByUserId[uncalledPlayer.id] = (payoutsByUserId[uncalledPlayer.id] ?? 0) + uncalledCents;
      }
    }

    // Step 2: Disburse exactly what remains in the pot after the refund.
    // creditRefundToPlayer increments disbursedCents, so this naturally clears the pot.
    const disbursedCents = this.deps.settlementService.getCurrentHandPotDisbursedCents();
    const creditAmount = state.potCents - disbursedCents;
    await this.deps.settlementService.creditPayoutToPlayer(winner, creditAmount);
    payoutsByUserId[winner.id] = (payoutsByUserId[winner.id] ?? 0) + creditAmount;
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        potCents: state.potCents,
        disbursedCents: this.deps.settlementService.getCurrentHandPotDisbursedCents(),
        payoutsByUserId,
        winnerIds: [winner.id],
      },
      "PAYOUT_APPLIED",
    );

    // Step 3: Assert 100% of the pot is cleared.
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_POST_PAYOUT", true);
    await this.deps.applyDisconnectedAutoActionCapForHand();
    syncRoundCurrentBetCents(state);
    await this.deps.settlementService.finalizePersistedHand("ALL_FOLDED");
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_PRE_FINALIZE", true);
    this.assertHandResultPayoutsOrThrow(payoutsByUserId, state.potCents, "HAND_END_LAST_STANDING");
    this.deps.setLastHandResult({
      handId: state.handId,
      reason: "LAST_PLAYER",
      potCents: state.potCents,
      winnerId: winner.id,
      payoutsByUserId,
      board: [...state.board],
    });
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING", true);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });
    plans.push({
      kind: "HAND_ENDED",
      reason: "LAST_PLAYER",
      outcome: {
        potCents: state.potCents,
        winnerId: winner.id,
        payoutsByUserId,
      },
    });
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: getHandResultHoldMs() });
    maybeAssertStateInvariants(state);
    if (this.deps.persistence.enabled && this.shouldAssertLedgerForCurrentHand()) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
    return plans;
  }

  /**
   * Complete hand with showdown and side pot distribution
   * 
   * PROCESS:
   * 1. Run out community cards if not already at showdown
   * 2. Evaluate all eligible hands using poker solver
   * 3. Build and distribute side pots to winners
   * 4. Reconcile any remainder chips (deterministic seat order)
   * 5. Validate total payouts equal pot size
   * 6. Generate hand result with hole cards for display
   * 
   * DETERMINISM:
   * - Remainder chips go to earliest seat left of dealer
   * - No randomness in any settlement calculations
   * 
   * @returns Array of lifecycle plans for showdown completion
   */
  async finishHandShowdownWithSidePots(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (isRoundStateMachineEnabled() && state.roundState === "HAND_COMPLETE") {
      logger.warn(
        { tableId: state.tableId, handId: state.handId, street: state.street },
        "FINISH_HAND_SHOWDOWN_SKIPPED_HAND_ALREADY_COMPLETE",
      );
      return plans;
    }
    console.log("[DEBUG_FLOW] RUNOUT START", state.street, "handId:", state.handId);
    state.turnDeadlineMs = 0;
    if (state.street !== "SHOWDOWN") {
      this.transitionRoundState("RUNOUT", "SHOWDOWN_RUNOUT_STAGE");
      plans.push(...this.runoutToRiverStaged());
      // Street is forced to SHOWDOWN after staged runout.
      this.transitionRoundState("SHOWDOWN", "RUNOUT_COMPLETE");
      state.street = "SHOWDOWN";
    }

    const playersAll = [...state.playersById.values()].filter((player) => player.status !== "OUT");
    const eligible = playersAll.filter(eligibleForShowdown);
    
    // Guard against eligibleForShowdown bugs - this should never fire if filter is correct
    if (eligible.some((p) => p.status === "FOLDED")) {
      throw new PokerError("BAD_STATE", "eligibleForShowdown returned folded player - filter logic bug.");
    }

    if (eligible.length <= 1) {
      return this.finishHandByLastStanding();
    }

    // 🔴 CRITICAL: Lock pot math before any lifecycle changes
    // This ensures sum(player.committedCents) === potCents invariant holds
    const totalCommittedCents = [...state.playersById.values()]
      .reduce((sum, player) => sum + (player.committedCents || 0), 0);
    if (totalCommittedCents !== state.potCents) {
      throw new PokerError("BAD_STATE", `POT_MATH_VIOLATION: potCents(${state.potCents}) < totalCommittedCents(${totalCommittedCents})`);
    }

    const pots = buildSidePots(playersAll, eligible);
    const board = [...state.board];
    const holeCards = this.getHoleCardsByPlayerIdSafe();
    const solved = new Map<string, SolvedHand>();
    for (const player of eligible) {
      const cards = holeCards.get(player.id) ?? [];
      if (cards.length !== 2) {
        throw new PokerError("BAD_STATE", `Missing hole cards at showdown for player ${player.id}.`);
      }
      solved.set(player.id, Hand.solve([...cards, ...board]) as SolvedHand);
    }

    const seatOrder = seatOrderLeftOfDealer(state);
    const payouts = new Map<string, number>();
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        potCents: state.potCents,
        winnerIds: eligible.map((player) => player.id),
      },
      "PAYOUT_BEGIN",
    );

    for (const pot of pots) {
      const contenders = pot.eligiblePlayerIds;
      if (contenders.length === 0) continue;

      const hands = contenders.map((id) => solved.get(id)).filter(Boolean);
      const winners = Hand.winners(hands);
      const winnerSet = new Set(winners);
      
      const winnerIds: string[] = [];
      for (const id of contenders) {
        const hand = solved.get(id);
        if (hand && winnerSet.has(hand)) winnerIds.push(id);
      }

      const split = splitPotCents(pot.amountCents, winnerIds, seatOrder);
      for (const [id, amount] of split.entries()) {
        payouts.set(id, (payouts.get(id) ?? 0) + amount);
      }
    }

    const totalPaidBeforeReconcile = [...payouts.values()].reduce((sum, amount) => sum + amount, 0);
    if (totalPaidBeforeReconcile < state.potCents && eligible.length > 0) {
      const remainder = state.potCents - totalPaidBeforeReconcile;
      const seatOrderIndex = new Map<string, number>();
      seatOrder.forEach((id, idx) => seatOrderIndex.set(id, idx));

      // Industry standard: remainder chip goes to the first eligible player
      // to the left of the dealer button (smallest seatOrderIndex).
      const fallbackRecipient = [...eligible].sort((a, b) => {
        const ai = seatOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bi = seatOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi; // deterministic: earliest seat left of dealer gets remainder
      })[0];

      if (fallbackRecipient) {
        if (shouldFailClosedMoneyPath()) {
          throw new PokerError(
            "BAD_STATE",
            `SHOWDOWN_REMAINDER_RECONCILED: pot=${state.potCents}, paid=${totalPaidBeforeReconcile}, remainder=${remainder}, recipient=${fallbackRecipient.id}, hand=${state.handId}`,
          );
        }
        payouts.set(fallbackRecipient.id, (payouts.get(fallbackRecipient.id) ?? 0) + remainder);
        // Production should alert on this event; silent chip reconciliation masks side-pot bugs.
        logger.warn(
          {
            handId: state.handId,
            potCents: state.potCents,
            paidCents: totalPaidBeforeReconcile,
            remainderCents: remainder,
            fallbackRecipientUserId: fallbackRecipient.id,
            event: "SHOWDOWN_REMAINDER_RECONCILED",
          },
          "showdown payout remainder reconciled; investigate uncalled/side-pot edge",
        );
      }
    }

    const payoutSum = [...payouts.values()].reduce((sum, amount) => sum + amount, 0);
    if (payoutSum !== state.potCents) {
      throw new PokerError("BAD_STATE", "Payout sum must equal pot.");
    }

    // Step 3: Finalize payouts using handParticipants snapshot (not playersById)
    // This ensures payouts happen even if players were removed during hand
    // Lazy-init for tests that build mid-hand state without going through startHand()
    if (this.handParticipants.size === 0) {
      for (const [id, player] of state.playersById.entries()) {
        this.handParticipants.set(id, { committedCents: player.committedCents, stackAtStart: player.stackCents });
      }
    }
    for (const [id, amount] of payouts.entries()) {
      if (!this.handParticipants.has(id)) {
        throw new PokerError("BAD_STATE", `SETTLEMENT_INVARIANT_VIOLATION: payout target ${id} not in handParticipants`);
      }
      const player = state.playersById.get(id);
      if (!player) {
        throw new PokerError("BAD_STATE", `SETTLEMENT_INVARIANT_VIOLATION: payout target ${id} missing from playersById`);
      }
      await this.deps.settlementService.creditPayoutToPlayer(player, amount);
    }
    logger.info(
      {
        tableId: state.tableId,
        handId: state.handId,
        street: state.street,
        roundState: state.roundState,
        potCents: state.potCents,
        disbursedCents: this.deps.settlementService.getCurrentHandPotDisbursedCents(),
        payoutsByUserId: Object.fromEntries(payouts.entries()),
        winnerIds: [...payouts.keys()],
      },
      "PAYOUT_APPLIED",
    );
    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_POST_PAYOUT_BATCH", true);

    const payoutsEntries = [...payouts.entries()];
    const primaryWinnerId = seatOrder.find((id) => payouts.has(id));
    const displayWinnerId = payoutsEntries.length === 1 ? primaryWinnerId : undefined;
    const primaryWinnerCards = primaryWinnerId ? holeCards.get(primaryWinnerId) : undefined;
    const primarySolved = primaryWinnerId ? solved.get(primaryWinnerId) : undefined;
    const winningDescr = primarySolved?.descr ?? primarySolved?.name;
    const showdownHoleCardsByUserId: Record<string, [string, string]> = {};
    for (const player of eligible) {
      const cards = holeCards.get(player.id);
      if (cards?.length === 2) {
        showdownHoleCardsByUserId[player.id] = [cards[0]!, cards[1]!];
      }
    }

    await this.deps.applyDisconnectedAutoActionCapForHand();
    syncRoundCurrentBetCents(state);
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_SHOWDOWN" });

    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_POST_FINALIZE", true);
    await this.deps.settlementService.finalizePersistedHand("SHOWDOWN");
    const payoutsByUserId = Object.fromEntries(payoutsEntries);
    this.assertHandResultPayoutsOrThrow(payoutsByUserId, state.potCents, "HAND_END_SHOWDOWN");
    this.deps.setLastHandResult({
      handId: state.handId,
      reason: "SHOWDOWN",
      potCents: state.potCents,
      winnerId: displayWinnerId,
      payoutsByUserId,
      board,
      showdownHoleCardsByUserId,
      winnerHoleCards: primaryWinnerCards?.length === 2 ? primaryWinnerCards : undefined,
      winningHandDescr: typeof winningDescr === "string" ? winningDescr : undefined,
    });
    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_POST_FINALIZE", true);
    this.transitionRoundState("HAND_COMPLETE", "SHOWDOWN_COMPLETE");
    console.log("[DEBUG_FLOW] HAND_END", state.handId);
    plans.push({ 
      kind: "HAND_ENDED", 
      reason: "SHOWDOWN", 
      outcome: { 
        potCents: state.potCents, 
        winnerId: displayWinnerId, 
        payoutsByUserId
      } 
    });
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: getHandResultHoldMs() });
    
    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_POST_FINALIZE", true);
    maybeAssertStateInvariants(state);
    if (this.deps.persistence.enabled && this.shouldAssertLedgerForCurrentHand()) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
    return plans;
  }

  // ============================================================================
  // HELPER METHODS - Street Transitions & Card Dealing
  // ============================================================================

  /**
   * Draw a card from the deck
   * @throws PokerError if deck is not initialized
   * @returns Next card from deck
   */
  private drawCard(): string {
    if (!this.deck) throw new PokerError("BAD_STATE", "Deck not initialized.");
    return this.deck.draw();
  }

  /**
   * Determine the next street in poker sequence
   * @param street Current street
   * @returns Next street or throws if invalid
   */
  private nextStreet(street: Street): Street {
    if (street === "PREFLOP") return "FLOP";
    if (street === "FLOP") return "TURN";
    if (street === "TURN") return "RIVER";
    if (street === "RIVER") return "SHOWDOWN";
    throw new PokerError("BAD_STATE", `Unknown street ${street}.`);
  }

  /**
   * Deal community cards for the specified street
   * 
   * DEALING RULES:
   * - FLOP: 3 cards
   * - TURN: 1 card
   * - RIVER: 1 card
   * 
   * @param street Street to deal cards for
   */
  private dealCommunityForStreet(street: Street): void {
    if (street === "FLOP") this.deps.state.board.push(this.drawCard(), this.drawCard(), this.drawCard());
    else if (street === "TURN" || street === "RIVER") this.deps.state.board.push(this.drawCard());
  }

  /**
   * Generate staged runout plans for all-in scenarios
   * 
   * PROCESS:
   * 1. Progress through remaining streets (FLOP → TURN → RIVER)
   * 2. Deal community cards with delays between streets
   * 3. Create snapshot and delay plans for each stage
   * 
   * NOTE: This mutates state while building plans
   * Execution layer must run plans in order to maintain proper timing
   * 
   * @returns Array of staged runout plans
   */
  private runoutToRiverStaged(): HandLifecyclePlan[] {
    const plans: HandLifecyclePlan[] = [];
    // NOTE: This function mutates state while constructing plans.
    // It is only called from lifecycle transitions where immediate mutation is intended.
    // The execution layer (Dealer) must run plans in order and honor DELAY steps;
    // skipping or reordering would show community cards without the intended pause.
    while (this.deps.state.street !== "RIVER") {
      const next = this.nextStreet(this.deps.state.street);
      if (next === "SHOWDOWN") break;
      this.deps.state.street = next;
      this.dealCommunityForStreet(next);
      maybeAssertBettingState(this.deps.state);
      plans.push({ kind: "EMIT_SNAPSHOT", reason: "RUNOUT_STAGE" });
      plans.push({ kind: "DELAY", ms: getRunoutStageDelayMs() });
    }
    return plans;
  }


}

