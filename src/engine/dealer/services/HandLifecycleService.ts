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
} from "../../rules/BettingRound.js";
import { buildSidePots, splitPotCents } from "../../rules/SidePotManager.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { PokerState, Street } from "../../../state/PokerState.js";
import { SettlementService } from "./SettlementService.js";
import {
  countActiveHumanPlayers,
  findNextActiveSeat,
  findNextToActSeat,
  iterPlayersInSeatOrder,
  seatOrderLeftOfDealer,
} from "../utils/TableNavigator.js";
import type { SnapshotReason } from "./SnapshotService.js";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import pokersolver from "pokersolver";
import { maybeAssertStateInvariants } from "../../invariants/assertState.js";
import { maybeAssertBettingState } from "../../invariants/assertBettingState.js";
import { HAND_RESULT_HOLD_MS, RUNOUT_STAGE_DELAY_MS } from "../timing.js";

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): any;
    winners(hands: any[]): any[];
  };
};

export type HandLifecyclePlan =
  | { kind: "EMIT_SNAPSHOT"; reason: SnapshotReason; actionId?: string }
  | { kind: "DELAY"; ms: number }
  | { kind: "MAYBE_AUTOMATE_TURN" }
  | { kind: "TRANSITION_TO_WAITING" }
  | { kind: "RELEASE_PENDING_SEATS" }
  | { kind: "SCHEDULE_NEXT_HAND"; reason: string; delayMs?: number };

export class HandLifecycleService {
  private deck: DeckService | null = null;
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

  async startHand(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (countActiveHumanPlayers(state) === 0) return plans;
    state.runningSinceTs = Date.now();

    state.dealerSeat = findNextActiveSeat(state, state.dealerSeat) ?? 0;

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
    state.nextHandAtTs = 0;
    this.deps.setLastHandResult(undefined);
    this.deps.setLastAction(undefined);

    resetBettingRound(state);

    for (const player of state.playersById.values()) {
      player.roundBetCents = 0;
      player.committedCents = 0;
      player.needsAction = false;
      if (player.status !== "OUT" && player.status !== "ABANDONED") {
        player.status = player.stackCents > 0 ? "ACTIVE" : "OUT";
      }
    }

    let activePlayers = [...iterPlayersInSeatOrder(state)].filter(
      (player) => player.status === "ACTIVE" && player.sittingOutUntilNextHand !== true,
    );
    for (const p of state.playersById.values()) {
      p.sittingOutUntilNextHand = false;
    }
    if (activePlayers.length < 2) {
      const fromMap = [...state.playersById.values()]
        .filter((p) => p.status === "ACTIVE" && p.sittingOutUntilNextHand !== true)
        .sort((a, b) => a.seat - b.seat);
      if (fromMap.length >= 2) activePlayers = fromMap;
    }
    if (activePlayers.length < 2) {
      const anyActive = [...state.playersById.values()]
        .filter((p) => p.status === "ACTIVE")
        .sort((a, b) => a.seat - b.seat);
      if (anyActive.length >= 2) activePlayers = anyActive;
    }

    if (activePlayers.length < 2) {
      state.street = "WAITING";
      state.runoutMode = "NONE";
      plans.push({ kind: "EMIT_SNAPSHOT", reason: "AUTO_TRANSITION" });
      maybeAssertStateInvariants(state);
      return plans;
    }

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
    const sbSeat = isHeadsUp
      ? state.dealerSeat
      : (findNextActiveSeat(state, state.dealerSeat) ?? state.dealerSeat);
    const bbSeat = findNextActiveSeat(state, sbSeat) ?? sbSeat;
    state.sbSeat = sbSeat;
    state.bbSeat = bbSeat;

    const sbId = state.seats[sbSeat];
    const bbId = state.seats[bbSeat];

    if (sbId) {
      const sb = state.playersById.get(sbId);
      if (!sb) throw new PokerError("BAD_STATE", "Small blind player missing.");
      await this.deps.settlementService.postBlind(sb, "SB", state.smallBlindCents);
    }

    if (bbId) {
      const bb = state.playersById.get(bbId);
      if (!bb) throw new PokerError("BAD_STATE", "Big blind player missing.");
      await this.deps.settlementService.postBlind(bb, "BB", state.bigBlindCents);
    }

    state.roundCurrentBetCents = state.bigBlindCents;
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
      plans.push(...this.runoutToRiverStaged());
      state.street = "SHOWDOWN";
      const showdownPlans = await this.finishHandShowdownWithSidePots();
      return [...plans, ...showdownPlans];
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
    maybeAssertBettingState(state);
    maybeAssertStateInvariants(state);
    return plans;
  }

  async finishHandByLastStanding(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    const winner = [...state.playersById.values()].find((player) => player.status !== "FOLDED" && player.status !== "OUT");
    if (!winner) {
      state.street = "WAITING";
      state.runoutMode = "NONE";
      return plans;
    }

    await this.deps.settlementService.creditPayoutToPlayer(winner, state.potCents);
    await this.deps.applyDisconnectedAutoActionCapForHand();

    this.deps.setLastHandResult({
      handId: state.handId,
      reason: "LAST_PLAYER",
      potCents: state.potCents,
      winnerId: winner.id,
      payoutsByUserId: { [winner.id]: state.potCents },
      board: [...state.board],
    });
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });

    await this.deps.settlementService.finalizePersistedHand("ALL_FOLDED");
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: HAND_RESULT_HOLD_MS });
    if (!this.currentHandIncludesBotParticipants) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
    maybeAssertStateInvariants(state);
    return plans;
  }

  async finishHandShowdownWithSidePots(): Promise<HandLifecyclePlan[]> {
    const plans: HandLifecyclePlan[] = [];
    const { state } = this.deps;
    if (state.street !== "SHOWDOWN") {
      plans.push(...this.runoutToRiverStaged());
    }

    const playersAll = [...state.playersById.values()].filter((player) => player.status !== "OUT");
    const eligible = playersAll.filter(eligibleForShowdown);

    if (eligible.length <= 1) {
      return this.finishHandByLastStanding();
    }

    const pots = buildSidePots(playersAll, eligible);
    const board = [...state.board];

    const solved = new Map<string, any>();
    for (const player of eligible) {
      const cards = this.deps.holeCardsByPlayerId.get(player.id) ?? [];
      solved.set(player.id, Hand.solve([...cards, ...board]));
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
        payouts.set(fallbackRecipient.id, (payouts.get(fallbackRecipient.id) ?? 0) + remainder);
        logger.warn(
          {
            handId: state.handId,
            potCents: state.potCents,
            paidCents: totalPaidBeforeReconcile,
            remainderCents: remainder,
            fallbackRecipientUserId: fallbackRecipient.id,
          },
          "showdown payout remainder reconciled; investigate uncalled/side-pot edge",
        );
      }
    }

    for (const [id, amount] of payouts.entries()) {
      const player = state.playersById.get(id);
      if (player) {
        await this.deps.settlementService.creditPayoutToPlayer(player, amount);
      }
    }

    const payoutsEntries = [...payouts.entries()];
    const primaryWinnerId = payoutsEntries[0]?.[0];
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
      winnerId: payoutsEntries.length === 1 ? primaryWinnerId : undefined,
      payoutsByUserId: Object.fromEntries(payoutsEntries),
      board,
      showdownHoleCardsByUserId,
      winnerHoleCards: primaryWinnerCards?.length === 2 ? primaryWinnerCards : undefined,
      winningHandDescr: typeof winningDescr === "string" ? winningDescr : undefined,
    });

    await this.deps.applyDisconnectedAutoActionCapForHand();
    plans.push({ kind: "EMIT_SNAPSHOT", reason: "HAND_END" });

    await this.deps.settlementService.finalizePersistedHand("SHOWDOWN");
    plans.push({ kind: "TRANSITION_TO_WAITING" });
    plans.push({ kind: "RELEASE_PENDING_SEATS" });
    plans.push({ kind: "SCHEDULE_NEXT_HAND", reason: "HAND_END", delayMs: HAND_RESULT_HOLD_MS });
    if (!this.currentHandIncludesBotParticipants) {
      await this.deps.persistence.assertHandBalanced(state.handId);
    }
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
    return "WAITING";
  }

  private dealCommunityForStreet(street: Street): void {
    if (street === "FLOP") this.deps.state.board.push(this.drawCard(), this.drawCard(), this.drawCard());
    else if (street === "TURN" || street === "RIVER") this.deps.state.board.push(this.drawCard());
  }

  private runoutToRiverStaged(): HandLifecyclePlan[] {
    const plans: HandLifecyclePlan[] = [];
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
