import { newId } from "../../../lib/ids.js";
import { logger } from "../../../lib/logger.js";
import { DeckService } from "../../cards/DeckService.js";
import { PokerError } from "../../errors.js";
import type { PersistenceFacade } from "../../persistence/PersistenceFacade.js";
import {
  allRemainingPlayersAllInOrFolded,
  beginRound,
  eligibleForShowdown,
  noFurtherBettingPossible,
  resetBettingRound,
  syncRoundCurrentBetCents,
} from "../../rules/BettingRound.js";
import { buildSidePots, splitPotCents } from "../../rules/SidePotManager.js";
import type { PokerState, Street } from "../../../state/PokerState.js";
import { SettlementService } from "./SettlementService.js";
import {
  countActiveHumanPlayers,
  findNextToActSeat,
  resolveActivePlayersForHand,
  seatOrderLeftOfDealer,
} from "../utils/TableNavigator.js";
import type { SnapshotReason } from "./SnapshotService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import pokersolver from "pokersolver";
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";
import { maybeAssertBettingState } from "../../invariants/assertBettingState.js";
import { assertMoneyConservationTransition } from "../../invariants/assertMoneyConservation.js";
import { shouldFailClosedMoneyPath } from "../../invariants/moneyStrictMode.js";
import { HAND_RESULT_HOLD_MS, RUNOUT_STAGE_DELAY_MS } from "../timing.js";

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): unknown;
    winners(hands: unknown[]): unknown[];
  };
};

type SolvedHand = { descr?: string; name?: string };

export type HandLifecyclePlan =
  | { kind: "EMIT_SNAPSHOT"; reason: SnapshotReason; actionId?: string }
  | { kind: "DELAY"; ms: number }
  | { kind: "MAYBE_AUTOMATE_TURN" }
  | { kind: "TRANSITION_TO_WAITING" }
  | { kind: "RELEASE_PENDING_SEATS" }
  | { kind: "SCHEDULE_NEXT_HAND"; reason: string; delayMs?: number };

export class HandLifecycleService {
  /** Lifetime: one hand. Set in startHand after we have 2+ active players; cleared at start of startHand. */
  private deck: DeckService | null = null;
  /** Set in startHand when we have 2+ active players; reset at start of startHand. Meaningful only after a successful hand start. */
  private currentHandIncludesBotParticipants = false;

  constructor(private readonly deps: {
    state: PokerState;
    persistence: PersistenceFacade;
    settlementService: SettlementService;
    holeCardsByPlayerId: Map<string, string[]>;
    currentHandAutoActedUserIds: Set<string>;
    processedActionIds: Set<string>;
    applyDisconnectedAutoActionCapForHand: () => Promise<void>;
    setLastHandResult: (value: TableSnapshotPayload["lastHandResult"] | undefined) => void;
    setLastAction: (value: TableSnapshotPayload["lastAction"] | undefined) => void;
  }) {}

  private sumStacksCents(): number {
    let sum = 0;
    for (const p of this.deps.state.playersById.values()) {
      sum += p.stackCents;
    }
    return sum;
  }

  private assertHandMassOrThrow(state: PokerState, context: string, requireFullySettled = false): void {
    const { settlementService } = this.deps;
    const totalStacksCents = this.sumStacksCents();
    const disbursedCents = settlementService.getCurrentHandPotDisbursedCents();
    const effectiveMassCents = totalStacksCents + state.potCents - disbursedCents;
    if (effectiveMassCents !== state.initialChipMassCents) {
      throw new PokerError(
        "BAD_STATE",
        `${context}: hand chip mass mismatch (initial=${state.initialChipMassCents}, effective=${effectiveMassCents}, stacks=${totalStacksCents}, pot=${state.potCents}, disbursed=${disbursedCents}, hand=${state.handId}).`,
      );
    }
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

  async startHand(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    this.deck = null;
    this.currentHandIncludesBotParticipants = false;
    if (countActiveHumanPlayers(state) === 0) return plans;
    state.runningSinceTs = Date.now();

    const handId = newId("hand");
    state.handNumber += 1;
    this.deps.currentHandAutoActedUserIds.clear();
    this.deps.settlementService.resetHandCounters();
    this.deps.processedActionIds.clear();
    state.street = "PREFLOP";
    state.runoutMode = "NONE";
    state.board.clear();
    state.potCents = 0;
    state.handActionSeq = 0;
    state.actionCount = 0;
    state.initialChipMassCents = 0;
    state.nextHandAtTs = 0;
    this.deps.setLastHandResult(undefined);
    this.deps.setLastAction(undefined);

    resetBettingRound(state);

    // Consume one-hand sit-out tokens before selecting participants for this hand.
    for (const player of state.playersById.values()) {
      player.sittingOutUntilNextHand = false;
    }

    for (const player of state.playersById.values()) {
      if (player.connected && player.status === "ABANDONED" && player.stackCents > 0) {
        player.status = "ACTIVE";
      }
    }

    for (const player of state.playersById.values()) {
      player.roundBetCents = 0;
      player.committedCents = 0;
      player.needsAction = false;
      if (player.status !== "OUT" && player.status !== "ABANDONED") {
        player.status = player.stackCents > 0 ? "ACTIVE" : "OUT";
      }
    }

    // Resolve active players for this hand after consuming sit-out-until-next-hand flags.
    const activePlayers = resolveActivePlayersForHand(state);

    if (activePlayers.length < 2) {
      state.street = "WAITING";
      state.runoutMode = "NONE";
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

    const startingStacksByUserId = new Map<string, number>();
    for (const player of activePlayers) {
      startingStacksByUserId.set(player.id, player.stackCents);
    }

    this.deps.holeCardsByPlayerId.clear();
    for (const player of activePlayers) {
      const cards = [this.drawCard(), this.drawCard()];
      this.deps.holeCardsByPlayerId.set(player.id, cards);
    }

    if (this.deps.persistence.enabled && this.deps.persistence.handHistory) {
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
          holeCards: this.deps.holeCardsByPlayerId.get(player.id) ?? [],
        })),
      });
    }
    state.handId = handId;

    const isHeadsUp = activePlayers.length === 2;
    const sbSeat = isHeadsUp ? state.dealerSeat : nextSeatFrom(state.dealerSeat);
    const bbSeat = nextSeatFrom(sbSeat);
    state.sbSeat = sbSeat;
    state.bbSeat = bbSeat;

    const sbId = state.seats[sbSeat];
    const bbId = state.seats[bbSeat];

    let postedSb = 0;
    let postedBb = 0;

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
    beginRound(state);
    state.toActSeat = findNextToActSeat(state, bbSeat);
    if (state.toActSeat === -1) {
      throw new PokerError("BAD_STATE", "No seat needs action at hand start.");
    }

    if (bbId && !isHeadsUp) {
      const bb = state.playersById.get(bbId);
      if (bb) bb.needsAction = false;
    }

    logger.info({ handId: state.handId }, "hand started");
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_START" });
    plans.push({ kind: "MAYBE_AUTOMATE_TURN" });
    maybeAssertBettingState(state);
    maybeAssertStateInvariants(state);
    return plans;
  }

  async advanceStreetOrShowdown(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
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
      state.runoutMode = "STAGED";
      return this.finishHandShowdownWithSidePots();
    }

    const next = this.nextStreet(state.street);
    if (next === "SHOWDOWN") {
      state.street = "SHOWDOWN";
      return this.finishHandShowdownWithSidePots();
    }

    state.street = next;
    state.runoutMode = "NONE";
    this.dealCommunityForStreet(next);

    resetBettingRound(state);
    beginRound(state);
    state.toActSeat = findNextToActSeat(state, state.dealerSeat);
    if (state.toActSeat === -1) {
      throw new PokerError("BAD_STATE", "No seat needs action after street transition.");
    }

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

  async finishHandByLastStanding(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    const remaining = [...state.playersById.values()].filter(
      (p) => p.status === "ACTIVE" || p.status === "ALL_IN",
    );
    if (remaining.length === 0) {
      const notFoldedOrOut = [...state.playersById.values()].filter(
        (p) => p.status !== "FOLDED" && p.status !== "OUT",
      );
      if (notFoldedOrOut.length === 1) {
        // Defensive: e.g. sole survivor is ABANDONED; credit pot so it is never left uncredited.
        const winner = notFoldedOrOut[0]!;
        await this.deps.settlementService.creditPayoutToPlayer(winner, state.potCents);
        this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE_POST_PAYOUT", true);
        await this.deps.applyDisconnectedAutoActionCapForHand();
        this.deps.setLastHandResult({
          handId: state.handId,
          reason: "LAST_PLAYER",
          potCents: state.potCents,
          winnerId: winner.id,
          payoutsByUserId: { [winner.id]: state.potCents },
          board: [...state.board],
        });
        this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE_PRE_FINALIZE", true);
        await this.deps.settlementService.finalizePersistedHand("ALL_FOLDED");
        plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });
        plans.push({ kind: "TRANSITION_TO_WAITING" });
        plans.push({ kind: "RELEASE_PENDING_SEATS" });
        plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: HAND_RESULT_HOLD_MS });
        if (this.deps.persistence.enabled && !this.currentHandIncludesBotParticipants) {
          await this.deps.persistence.assertHandBalanced(state.handId);
        }
        this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_DEFENSIVE", true);
        maybeAssertStateInvariants(state);
        return plans;
      }
      if (notFoldedOrOut.length > 1) {
        throw new PokerError("BAD_STATE", "finishHandByLastStanding: no ACTIVE/ALL_IN but multiple non-folded players.");
      }
      state.street = "WAITING";
      state.runoutMode = "NONE";
      return plans;
    }
    if (remaining.length !== 1) {
      throw new PokerError("BAD_STATE", "finishHandByLastStanding called with != 1 remaining player.");
    }
    const winner = remaining[0]!;

    await this.deps.settlementService.creditPayoutToPlayer(winner, state.potCents);
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_POST_PAYOUT", true);
    await this.deps.applyDisconnectedAutoActionCapForHand();

    this.deps.setLastHandResult({
      handId: state.handId,
      reason: "LAST_PLAYER",
      potCents: state.potCents,
      winnerId: winner.id,
      payoutsByUserId: { [winner.id]: state.potCents },
      board: [...state.board],
    });
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING_PRE_FINALIZE", true);
    await this.deps.settlementService.finalizePersistedHand("ALL_FOLDED");
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: HAND_RESULT_HOLD_MS });
    if (this.deps.persistence.enabled && !this.currentHandIncludesBotParticipants) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
    this.assertHandMassOrThrow(state, "HAND_END_LAST_STANDING", true);
    maybeAssertStateInvariants(state);
    return plans;
  }

  async finishHandShowdownWithSidePots(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (state.street !== "SHOWDOWN") {
      plans.push(...this.runoutToRiverStaged());
      // Street is forced to SHOWDOWN after staged runout.
      state.street = "SHOWDOWN";
    }

    const playersAll = [...state.playersById.values()].filter((player) => player.status !== "OUT");
    const eligible = playersAll.filter(eligibleForShowdown);
    if (eligible.some((p) => p.status === "FOLDED")) {
      throw new PokerError("BAD_STATE", "Folded player eligible for showdown.");
    }

    if (eligible.length <= 1) {
      return this.finishHandByLastStanding();
    }

    const pots = buildSidePots(playersAll, eligible);
    const board = [...state.board];

    const solved = new Map<string, SolvedHand>();
    for (const player of eligible) {
      const cards = this.deps.holeCardsByPlayerId.get(player.id) ?? [];
      if (cards.length !== 2) {
        throw new PokerError("BAD_STATE", `Missing hole cards at showdown for player ${player.id}.`);
      }
      solved.set(player.id, Hand.solve([...cards, ...board]) as SolvedHand);
    }

    const seatOrder = seatOrderLeftOfDealer(state);
    const payouts = new Map<string, number>();

    for (const pot of pots) {
      const contenders = pot.eligiblePlayerIds;
      if (contenders.length === 0) continue;

      const hands = contenders.map((id) => solved.get(id)).filter(Boolean);
      const winners = Hand.winners(hands);

      const winnerIds: string[] = [];
      for (const id of contenders) {
        const hand = solved.get(id);
        if (hand && winners.includes(hand)) winnerIds.push(id);
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

      const fallbackRecipient = [...eligible].sort((a, b) => {
        if (b.committedCents !== a.committedCents) return b.committedCents - a.committedCents;
        const ai = seatOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bi = seatOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
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

    for (const [id, amount] of payouts.entries()) {
      const player = state.playersById.get(id);
      if (player) {
        await this.deps.settlementService.creditPayoutToPlayer(player, amount);
      }
    }
    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_POST_PAYOUT_BATCH", true);

    const payoutsEntries = [...payouts.entries()];
    const primaryWinnerId = seatOrder.find((id) => payouts.has(id));
    const displayWinnerId = payoutsEntries.length === 1 ? primaryWinnerId : undefined;
    const primaryWinnerCards = primaryWinnerId ? this.deps.holeCardsByPlayerId.get(primaryWinnerId) : undefined;
    const primarySolved = primaryWinnerId ? solved.get(primaryWinnerId) : undefined;
    const winningDescr = primarySolved?.descr ?? primarySolved?.name;
    const showdownHoleCardsByUserId: Record<string, [string, string]> = {};
    for (const player of eligible) {
      const cards = this.deps.holeCardsByPlayerId.get(player.id);
      if (cards?.length === 2) {
        showdownHoleCardsByUserId[player.id] = [cards[0]!, cards[1]!];
      }
    }

    this.deps.setLastHandResult({
      handId: state.handId,
      reason: "SHOWDOWN",
      potCents: state.potCents,
      winnerId: displayWinnerId,
      payoutsByUserId: Object.fromEntries(payoutsEntries),
      board,
      showdownHoleCardsByUserId,
      winnerHoleCards: primaryWinnerCards?.length === 2 ? primaryWinnerCards : undefined,
      winningHandDescr: typeof winningDescr === "string" ? winningDescr : undefined,
    });

    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_SHOWDOWN" });
    await this.deps.applyDisconnectedAutoActionCapForHand();
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });

    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN_PRE_FINALIZE", true);
    await this.deps.settlementService.finalizePersistedHand("SHOWDOWN");
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: HAND_RESULT_HOLD_MS });
    if (this.deps.persistence.enabled && !this.currentHandIncludesBotParticipants) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
    this.assertHandMassOrThrow(state, "HAND_END_SHOWDOWN", true);
    maybeAssertStateInvariants(state);
    return plans;
  }

  private drawCard(): string {
    if (!this.deck) throw new PokerError("DECK_ERROR", "Deck not initialized.");
    return this.deck.draw();
  }

  private nextStreet(street: Street): Street {
    if (street === "PREFLOP") return "FLOP";
    if (street === "FLOP") return "TURN";
    if (street === "TURN") return "RIVER";
    if (street === "RIVER") return "SHOWDOWN";
    throw new PokerError("BAD_STATE", `Unknown street ${street}.`);
  }

  private dealCommunityForStreet(street: Street): void {
    if (street === "FLOP") this.deps.state.board.push(this.drawCard(), this.drawCard(), this.drawCard());
    else if (street === "TURN" || street === "RIVER") this.deps.state.board.push(this.drawCard());
  }

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
      plans.push({ kind: "DELAY", ms: RUNOUT_STAGE_DELAY_MS });
    }
    return plans;
  }
}
