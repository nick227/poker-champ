import { Client } from "@colyseus/core";
import { createHash } from "node:crypto";
import pokersolver from "pokersolver";
import { newId } from "../lib/ids.js";
import { logger } from "../lib/logger.js";
import type { ActionPayload } from "../messages/schemas.js";
import { PokerState, type Street } from "../state/PokerState.js";
import { PlayerState } from "../state/PlayerState.js";
import { DeckService } from "./cards/DeckService.js";
import {
  beginRound,
  bettingRoundComplete,
  clearPlayerNeedsAction,
  eligibleForShowdown,
  eligibleToAct,
  noFurtherBettingPossible,
  onNewBetLevel,
  resetBettingRound
} from "./rules/BettingRound.js";
import { buildSidePots, splitPotCents } from "./rules/SidePotManager.js";
import { PokerError } from "./errors.js";
import { PersistenceFacade } from "./persistence/PersistenceFacade.js";
import { CashierService } from "./economy/CashierService.js";
import { nanoid } from "nanoid";
import { TableOutboundMessageSchema, type HeroActionOptions, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { newBotId } from "./bots/botIds.js";
import { RandomBotBrain } from "./bots/BotBrain.js";
import type { BotBrain } from "./bots/BotBrain.js";

type SnapshotReason = TableSnapshotPayload["reason"];

const BOT_ACTION_DELAY_MS = 800;

const { Hand } = pokersolver as {
  Hand: {
    solve(cards: string[]): any;
    winners(hands: any[]): any[];
  };
};

/**
 * v3.0 Dealer (final milestone):
 * - Side pots + showdown payout
 * - Betting-round settlement via needsAction flags
 * - Multiway equity w/ warmup + in-flight de-dup + throttle
 * - Typed errors for clean client UX
 */
export class Dealer {
  private readonly state: PokerState;
  private readonly persistence: PersistenceFacade;
  private readonly clientsByUserId: Map<string, Client> = new Map();

  private holeCardsByPlayerId: Map<string, string[]> = new Map();
  private deck: DeckService | null = null;
  private pendingSeatReleaseUserIds: Set<string> = new Set();
  private lastHandResult: TableSnapshotPayload["lastHandResult"] | undefined = undefined;
  private readonly botBrain: BotBrain = new RandomBotBrain();

  private actionQueue: Promise<void> = Promise.resolve();

  constructor(state: PokerState, persistence?: PersistenceFacade) {
    this.state = state;
    this.persistence = persistence ?? new PersistenceFacade(this.state.tableId || "table_poc");
    if (this.state.seats.length === 0) {
      for (let i = 0; i < (this.state.maxSeats || 9); i++) this.state.seats.push("");
    }
  }

  bindClient(userId: string, client: Client) { this.clientsByUserId.set(userId, client); }
  unbindClient(userId: string) { this.clientsByUserId.delete(userId); }
  getClient(userId: string) { return this.clientsByUserId.get(userId); }
  hasPlayer(userId: string) { return this.state.playersById.has(userId); }
  emitSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string) {
    this.sendTableSnapshotToUser(userId, reason, actionId);
  }
  emitSnapshotsToAll(reason: SnapshotReason, actionId?: string) {
    this.sendTableSnapshotToAll(reason, actionId);
  }

  async addPlayer(userId: string, name: string, buyInCents: number) {
    if (this.state.playersById.has(userId)) return;
    const seat = this.findOpenSeat();
    if (seat === -1) throw new PokerError("TABLE_FULL", "Table is full.");
    this.assertValidBuyIn(buyInCents);

    // Process buy-in via CashierService (atomic bankroll -> table balance)
    // Use deterministic externalRef for idempotency and debugging
    const externalRef = `buyin_${this.state.tableId}_${userId}`;
    try {
      const result = await CashierService.processCashGameBuyIn({
        userId,
        tableId: this.state.tableId,
        amountCents: buyInCents,
        externalRef,
      });
      logger.info({ userId, buyInCents, newTableBalance: result.newTableBalance }, "buy-in processed");
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_BANKROLL") {
        throw new PokerError("INSUFFICIENT_BANKROLL", "Insufficient bankroll for this buy-in.");
      }
      throw err;
    }

    const p = new PlayerState();
    p.id = userId;
    p.userId = userId;
    p.kind = "HUMAN";
    p.name = name;
    p.seat = seat;
    p.status = "ACTIVE";
    p.connected = true;
    p.disconnectDeadlineTs = 0;
    p.stackCents = buyInCents;

    this.state.playersById.set(userId, p);
    this.state.seats[seat] = userId;

    await this.ensurePlayerPersistence(p);
    this.sendTableSnapshotToAll("SEAT_CHANGE");

    logger.info({ userId, seat }, "player joined");
    if (this.countNonOutPlayers() >= 2 && this.state.street === "WAITING") {
      await this.startHand();
    }
  }

  async addBot(botId: string, name: string, buyInCents: number) {
    if (this.state.playersById.has(botId)) return;
    const seat = this.findOpenSeat();
    if (seat === -1) throw new PokerError("TABLE_FULL", "Table is full.");
    this.assertValidBuyIn(buyInCents);

    const p = new PlayerState();
    p.id = botId;
    p.userId = "";
    p.kind = "BOT";
    p.name = name;
    p.seat = seat;
    p.status = "ACTIVE";
    p.connected = true;
    p.disconnectDeadlineTs = 0;
    p.stackCents = buyInCents;

    this.state.playersById.set(botId, p);
    this.state.seats[seat] = botId;

    if (this.persistence.enabled && this.persistence.handHistory) {
      await this.persistence.handHistory.ensureTableAndPlayers([{ id: p.id, name: p.name, seat: p.seat }]);
    }
    this.sendTableSnapshotToAll("SEAT_CHANGE");
    await this.maybeActForBot();

    logger.info({ botId, seat }, "bot joined");
    if (this.countNonOutPlayers() >= 2 && this.state.street === "WAITING") {
      await this.startHand();
    }
  }

  async removeBot(botId: string) {
    const p = this.state.playersById.get(botId);
    if (!p) return;

    this.pendingSeatReleaseUserIds.delete(botId);
    this.state.seats[p.seat] = "";
    this.state.playersById.delete(botId);
    this.holeCardsByPlayerId.delete(botId);
    this.sendTableSnapshotToAll("SEAT_CHANGE");
    await this.maybeActForBot();

    logger.info({ botId }, "bot left");

    if (this.state.street === "WAITING") {
      if (this.countNonOutPlayers() >= 2) await this.startHand();
      return;
    }
    if (this.countNotFoldedPlayers() <= 1) {
      await this.finishHandByLastStanding();
      return;
    }
    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
        await this.advanceStreetOrShowdown();
      } else {
        this.state.toActSeat = this.findNextToActSeat(p.seat);
      }
    }
  }

  async removePlayer(userId: string) {
    const p = this.state.playersById.get(userId);
    if (!p) return;

    // Cash out remaining stack via CashierService (atomic table balance -> bankroll)
    const remainingStack = p.stackCents;
    if (remainingStack > 0) {
      // Use deterministic externalRef for idempotency and debugging
      const externalRef = `cashout_${this.state.tableId}_${userId}`;
      try {
        await CashierService.processCashGameCashOut({
          userId,
          tableId: this.state.tableId,
          amountCents: remainingStack,
          externalRef,
        });
        logger.info({ userId, remainingStack }, "cash-out processed");
      } catch (err: any) {
        logger.error({ userId, err }, "cash-out failed, funds may be locked in PlayerBalance");
        // Continue with player removal even if cash-out fails
        // The PlayerBalance record will remain and can be recovered later
      }
    }

    this.pendingSeatReleaseUserIds.delete(userId);

    this.state.seats[p.seat] = "";
    this.state.playersById.delete(userId);
    this.holeCardsByPlayerId.delete(userId);
    this.sendTableSnapshotToAll("SEAT_CHANGE");
    await this.maybeActForBot();
    logger.info({ userId }, "player left");

    if (this.state.street === "WAITING") {
      if (this.countNonOutPlayers() >= 2) await this.startHand();
      return;
    }

    if (this.countNotFoldedPlayers() <= 1) {
      await this.finishHandByLastStanding();
      return;
    }

    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const toAct = toActId ? this.state.playersById.get(toActId) : undefined;
    if (!toAct || !eligibleToAct(toAct) || !toAct.needsAction) {
      if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
        await this.advanceStreetOrShowdown();
      } else {
        this.state.toActSeat = this.findNextToActSeat(p.seat);
      }
    }
  }

  markDisconnected(userId: string, disconnectDeadlineTs: number) {
    const p = this.state.playersById.get(userId);
    if (!p) return;
    p.connected = false;
    p.disconnectDeadlineTs = disconnectDeadlineTs;
    this.sendTableSnapshotToAll("SEAT_CHANGE");
  }

  markReconnected(userId: string) {
    const p = this.state.playersById.get(userId);
    if (!p) return;
    p.connected = true;
    p.disconnectDeadlineTs = 0;
    this.sendTableSnapshotToAll("RECONNECT");
  }

  async markAbandoned(userId: string) {
    const p = this.state.playersById.get(userId);
    if (!p) return;

    p.connected = false;
    p.disconnectDeadlineTs = 0;
    p.status = "ABANDONED";
    p.needsAction = false;
    this.pendingSeatReleaseUserIds.add(userId);
    this.sendTableSnapshotToAll("SEAT_CHANGE");

    if (this.state.street === "WAITING") {
      await this.releasePendingSeats();
      return;
    }

    if (this.countNotFoldedPlayers() <= 1) {
      await this.finishHandByLastStanding();
      return;
    }

    if (this.state.toActSeat === p.seat) {
      if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
        await this.advanceStreetOrShowdown();
      } else {
        this.state.toActSeat = this.findNextToActSeat(p.seat);
      }
    }
  }

  async kickUser(userId: string, reason: string) {
    const client = this.clientsByUserId.get(userId);
    if (client) {
      try {
        client.leave();
      } catch {}
    }
    await this.markAbandoned(userId);
  }
  async handleAction(userId: string, msg: ActionPayload) {
    // Action serialization queue (mutex)
    return this.actionQueue = this.actionQueue.then(async () => {
      try {
        await this._handleAction(userId, msg);
      } catch (err) {
        logger.error({ err, userId, action: msg.action }, "Action failed");
        throw err;
      }
    });
  }

  private async _handleAction(userId: string, msg: ActionPayload) {
    const p = this.state.playersById.get(userId);
    if (!p) throw new PokerError("BAD_STATE", "Unknown player.");
    if (this.state.street === "WAITING") throw new PokerError("HAND_NOT_STARTED", "Hand not started.");
    if (!eligibleToAct(p)) throw new PokerError("NOT_ELIGIBLE", "Player not eligible to act.");
    if (p.seat !== this.state.toActSeat) throw new PokerError("NOT_YOUR_TURN", "Not your turn.");

    const callAmount = Math.max(0, this.state.roundCurrentBetCents - p.roundBetCents);

    switch (msg.action) {
      case "FOLD":
        p.status = "FOLDED";
        clearPlayerNeedsAction(p);
        break;

      case "CHECK":
        if (callAmount !== 0) throw new PokerError("INVALID_ACTION", "Cannot check; must call/fold/raise.");
        clearPlayerNeedsAction(p);
        break;

      case "CALL":
        if (callAmount > 0) {
          this.assertCanAfford(p, callAmount);
          await this.debitAndPayExact(p, callAmount, "CALL");
        }
        clearPlayerNeedsAction(p);
        break;

      case "BET": {
        if (this.state.roundCurrentBetCents !== 0) throw new PokerError("INVALID_ACTION", "Cannot BET; use RAISE.");
        const amt = msg.amountCents ?? 0;
        if (amt <= 0) throw new PokerError("INVALID_ACTION", "BET requires amountCents > 0.");

        this.assertCanAfford(p, amt);
        await this.debitAndPayExact(p, amt, "BET");

        this.state.roundCurrentBetCents = p.roundBetCents;
        this.state.minRaiseCents = Math.max(this.state.bigBlindCents, amt);
        onNewBetLevel(this.state, p.id);
        break;
      }

      case "RAISE": {
        if (this.state.roundCurrentBetCents === 0) throw new PokerError("INVALID_ACTION", "Cannot RAISE; use BET.");
        const raiseTo = msg.amountCents ?? 0;
        if (raiseTo <= this.state.roundCurrentBetCents) throw new PokerError("INVALID_ACTION", "RAISE must be > current bet.");

        const delta = raiseTo - this.state.roundCurrentBetCents;
        if (delta < this.state.minRaiseCents && p.stackCents > (raiseTo - p.roundBetCents)) {
          throw new PokerError("INVALID_ACTION", "RAISE below minRaise.");
        }

        const needed = Math.max(0, raiseTo - p.roundBetCents);
        this.assertCanAfford(p, needed);
        await this.debitAndPayExact(p, needed, "RAISE", { raiseTo });

        const newLevel = p.roundBetCents;
        this.state.minRaiseCents = Math.max(this.state.minRaiseCents, newLevel - this.state.roundCurrentBetCents);
        this.state.roundCurrentBetCents = Math.max(this.state.roundCurrentBetCents, newLevel);

        onNewBetLevel(this.state, p.id);
        break;
      }

      case "ALL_IN": {
        const pay = p.stackCents;
        if (pay <= 0) throw new PokerError("INVALID_ACTION", "No chips to go all-in.");
        await this.debitAndPayExact(p, pay, "ALL_IN");

        if (p.roundBetCents > this.state.roundCurrentBetCents) {
          const delta = p.roundBetCents - this.state.roundCurrentBetCents;
          this.state.minRaiseCents = Math.max(this.state.minRaiseCents, delta);
          this.state.roundCurrentBetCents = p.roundBetCents;
          onNewBetLevel(this.state, p.id);
        } else {
          clearPlayerNeedsAction(p);
        }

        p.status = "ALL_IN";
        break;
      }
    }

    if (this.countNotFoldedPlayers() <= 1) {
      await this.finishHandByLastStanding();
      return;
    }

    if (bettingRoundComplete(this.state) || noFurtherBettingPossible(this.state)) {
      await this.advanceStreetOrShowdown();
      return;
    }

    this.state.toActSeat = this.findNextToActSeat(this.state.toActSeat);
    const reason: SnapshotReason = p.kind === "BOT" ? "BOT_ACTION" : "ACTION_ACCEPTED";
    this.sendTableSnapshotToAll(reason, `act_${this.state.handId}_${nanoid(8)}`);
    await this.maybeActForBot();
  }

  // -------------------------
  // Hand lifecycle
  // -------------------------

  private async startHand() {
    if (this.countHumanPlayers() === 0) return;
    this.state.runningSinceTs = Date.now();

    this.state.dealerSeat = this.findNextActiveSeat(this.state.dealerSeat) ?? 0;

    this.state.handId = newId("hand");
    this.state.handNumber += 1;
    this.state.street = "PREFLOP";
    this.state.board.clear();
    this.state.potCents = 0;
    this.state.actionCount = 0;
    this.lastHandResult = undefined;

    resetBettingRound(this.state);

    for (const p of this.state.playersById.values()) {
      p.roundBetCents = 0;
      p.committedCents = 0;
      p.needsAction = false;
      if (p.status !== "OUT" && p.status !== "ABANDONED") {
        p.status = p.stackCents > 0 ? "ACTIVE" : "OUT";
      }
    }

    const activeCount = [...this.state.playersById.values()].filter((p) => p.status === "ACTIVE").length;
    if (activeCount < 2) {
      this.state.street = "WAITING";
      this.sendTableSnapshotToAll("AUTO_TRANSITION");
      return;
    }

    this.deck = new DeckService();
    this.deck.shuffle();

    this.holeCardsByPlayerId.clear();
    for (const p of this.iterPlayersInSeatOrder()) {
      if (p.status !== "ACTIVE") continue;
      const cards = [this.drawCard(), this.drawCard()];
      this.holeCardsByPlayerId.set(p.id, cards);
    }

    const sbSeat = this.findNextActiveSeat(this.state.dealerSeat) ?? this.state.dealerSeat;
    const bbSeat = this.findNextActiveSeat(sbSeat) ?? sbSeat;

    const sbId = this.state.seats[sbSeat];
    const bbId = this.state.seats[bbSeat];

    if (sbId) {
      const sb = this.state.playersById.get(sbId);
      if (!sb) throw new PokerError("BAD_STATE", "Small blind player missing.");
      this.assertCanAfford(sb, this.state.smallBlindCents);
      const next = await this.persistence.postBlind({
        userId: sb.id,
        handId: this.state.handId,
        blindType: "SB",
        amountCents: this.state.smallBlindCents,
        currentBalance: sb.stackCents,
        player: sb,
      });
      sb.stackCents = next;
      sb.roundBetCents += this.state.smallBlindCents;
      sb.committedCents += this.state.smallBlindCents;
      this.state.potCents += this.state.smallBlindCents;
    }
    if (bbId) {
      const bb = this.state.playersById.get(bbId);
      if (!bb) throw new PokerError("BAD_STATE", "Big blind player missing.");
      this.assertCanAfford(bb, this.state.bigBlindCents);
      const next = await this.persistence.postBlind({
        userId: bb.id,
        handId: this.state.handId,
        blindType: "BB",
        amountCents: this.state.bigBlindCents,
        currentBalance: bb.stackCents,
        player: bb,
      });
      bb.stackCents = next;
      bb.roundBetCents += this.state.bigBlindCents;
      bb.committedCents += this.state.bigBlindCents;
      this.state.potCents += this.state.bigBlindCents;
    }

    this.state.roundCurrentBetCents = this.state.bigBlindCents;
    this.state.minRaiseCents = this.state.bigBlindCents;

    this.state.toActSeat = this.findNextToActSeat(bbSeat);
    beginRound(this.state);

    if (bbId) {
      const bb = this.state.playersById.get(bbId);
      if (bb) bb.needsAction = false;
    }

    logger.info({ handId: this.state.handId }, "hand started");
    this.sendTableSnapshotToAll("HAND_START");
    await this.maybeActForBot();
  }

  private async advanceStreetOrShowdown() {
    if (noFurtherBettingPossible(this.state)) {
      this.runoutToRiver();
      this.state.street = "SHOWDOWN";
      await this.finishHandShowdownWithSidePots();
      return;
    }

    const next = this.nextStreet(this.state.street);
    if (next === "SHOWDOWN") {
      this.state.street = "SHOWDOWN";
      await this.finishHandShowdownWithSidePots();
      return;
    }

    this.state.street = next;
    this.dealCommunityForStreet(next);

    resetBettingRound(this.state);
    beginRound(this.state);

    this.state.toActSeat = this.findNextToActSeat(this.state.dealerSeat);

    this.sendTableSnapshotToAll("AUTO_TRANSITION");
    await this.maybeActForBot();
  }

  private runoutToRiver() {
    while (this.state.street !== "RIVER") {
      const next = this.nextStreet(this.state.street);
      if (next === "SHOWDOWN") break;
      this.state.street = next;
      this.dealCommunityForStreet(next);
    }
  }

  private async finishHandByLastStanding() {
    const winner = [...this.state.playersById.values()].find(p => p.status !== "FOLDED" && p.status !== "OUT");
    if (!winner) { this.state.street = "WAITING"; return; }

    const next = await this.persistence.creditPayout({
      userId: winner.id,
      handId: this.state.handId,
      amountCents: this.state.potCents,
      currentBalance: winner.stackCents,
      player: winner,
    });
    winner.stackCents = next;

    this.lastHandResult = {
      handId: this.state.handId,
      reason: "LAST_PLAYER",
      potCents: this.state.potCents,
      winnerId: winner.id,
      payoutsByUserId: { [winner.id]: this.state.potCents },
      board: [...this.state.board],
    };
    this.sendTableSnapshotToAll("HAND_END");

    this.state.street = "WAITING";
    await this.releasePendingSeats();
    this.scheduleNextHand("HAND_END");
    await this.persistence.assertHandBalanced(this.state.handId);
  }

  private async finishHandShowdownWithSidePots() {
    if (this.state.street !== "SHOWDOWN") this.runoutToRiver();

    const playersAll = [...this.state.playersById.values()].filter(p => p.status !== "OUT");
    const eligible = playersAll.filter(eligibleForShowdown);

    if (eligible.length <= 1) {
      await this.finishHandByLastStanding();
      return;
    }

    const pots = buildSidePots(playersAll, eligible);

    const board = [...this.state.board];
    const solved = new Map<string, any>();
    for (const p of eligible) {
      const cards = this.holeCardsByPlayerId.get(p.id) ?? [];
      solved.set(p.id, Hand.solve([...cards, ...board]));
    }

    const seatOrder = this.seatOrderLeftOfDealer();
    const payouts = new Map<string, number>();

    for (const pot of pots) {
      const contenders = pot.eligiblePlayerIds;
      if (contenders.length === 0) continue;

      const hands = contenders.map(id => solved.get(id)).filter(Boolean);
      const winners = Hand.winners(hands);

      const winnerIds: string[] = [];
      for (const id of contenders) {
        const h = solved.get(id);
        if (h && winners.includes(h)) winnerIds.push(id);
      }

      const split = splitPotCents(pot.amountCents, winnerIds, seatOrder);
      for (const [id, amt] of split.entries()) payouts.set(id, (payouts.get(id) ?? 0) + amt);
    }

    const totalPaidBeforeReconcile = [...payouts.values()].reduce((sum, amt) => sum + amt, 0);
    if (totalPaidBeforeReconcile < this.state.potCents && eligible.length > 0) {
      const remainder = this.state.potCents - totalPaidBeforeReconcile;
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
            handId: this.state.handId,
            potCents: this.state.potCents,
            paidCents: totalPaidBeforeReconcile,
            remainderCents: remainder,
            fallbackRecipientUserId: fallbackRecipient.id,
          },
          "showdown payout remainder reconciled; investigate uncalled/side-pot edge",
        );
      }
    }

    for (const [id, amt] of payouts.entries()) {
      const p = this.state.playersById.get(id);
      if (p) {
        const next = await this.persistence.creditPayout({
          userId: id,
          handId: this.state.handId,
          amountCents: amt,
          currentBalance: p.stackCents,
          player: p,
        });
        p.stackCents = next;
      }
    }

    this.lastHandResult = {
      handId: this.state.handId,
      reason: "SHOWDOWN",
      potCents: this.state.potCents,
      payoutsByUserId: Object.fromEntries(payouts.entries()),
      board,
    };
    this.sendTableSnapshotToAll("HAND_END");

    this.state.street = "WAITING";
    await this.releasePendingSeats();
    this.scheduleNextHand("HAND_END");
    await this.persistence.assertHandBalanced(this.state.handId);
  }

// -------------------------
// Hand lifecycle helpers
// -------------------------
private nextHandScheduled = false;

  private scheduleNextHand(reason: string) {
  if (this.nextHandScheduled) return;
  this.nextHandScheduled = true;

  // Allow previous snapshot emit to flush before restarting.
  setTimeout(() => {
    this.nextHandScheduled = false;

    const seated = [...this.state.playersById.values()]
      .filter(p => p.seat >= 0 && p.status !== "OUT");

    if (this.state.street === "WAITING" && seated.length >= 2) {
      this.startHand().catch((err) => {
        logger.error({ err, reason }, "Failed to auto-start next hand");
      });
    }
  }, 0);
}

  private async releasePendingSeats() {
    const toRelease = [...this.pendingSeatReleaseUserIds];
    this.pendingSeatReleaseUserIds.clear();
    for (const userId of toRelease) {
      await this.removePlayer(userId);
    }
  }

  // -------------------------
  // Chip accounting
  // -------------------------

  private async debitAndPayExact(
    p: PlayerState,
    amountCents: number,
    action: any, // Action type like "CALL", "BET", etc.
    meta?: any,
  ) {
    if (amountCents <= 0) return;

    this.state.actionCount++;
    const next = await this.persistence.debitBet({
      userId: p.id,
      handId: this.state.handId,
      street: this.state.street,
      action: action === "POST_SB" || action === "POST_BB" ? "BET" : action,
      amountCents,
      sequenceNum: this.state.actionCount,
      currentBalance: p.stackCents,
      player: p,
    });

    p.stackCents = next;
    p.roundBetCents += amountCents;
    p.committedCents += amountCents;
    this.state.potCents += amountCents;

    if (p.stackCents === 0) {
      p.status = "ALL_IN";
      p.needsAction = false;
    }
  }

  private assertCanAfford(p: PlayerState, amountCents: number) {
    if (amountCents > p.stackCents) {
      throw new PokerError("INSUFFICIENT_STACK", "Insufficient stack for this action.");
    }
  }

  private assertValidBuyIn(buyInCents: number) {
    if (!Number.isInteger(buyInCents) || buyInCents <= 0) {
      throw new PokerError("INVALID_BUYIN", "buyInCents must be a positive integer.");
    }
    if (buyInCents < this.state.minBuyInCents) {
      throw new PokerError("INVALID_BUYIN", `buyInCents must be >= ${this.state.minBuyInCents}.`);
    }
    if (buyInCents > this.state.maxBuyInCents) {
      throw new PokerError("INVALID_BUYIN", `buyInCents must be <= ${this.state.maxBuyInCents}.`);
    }
  }

  private async ensurePlayerPersistence(p: PlayerState) {
    if (!this.persistence.enabled || !this.persistence.handHistory || !this.persistence.ledger) return;
    try {
      await this.persistence.handHistory.ensureTableAndPlayers([{ id: p.id, name: p.name, seat: p.seat }]);
      await this.persistence.ledger.ensureBalances([p.id], { [p.id]: 0 });
    } catch (err) {
      logger.warn({ err, userId: p.id }, "player persistence ensure failed; continuing in-memory");
    }
  }

  // -------------------------
  // Helpers
  // -------------------------

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

  private dealCommunityForStreet(street: Street) {
    if (street === "FLOP") this.state.board.push(this.drawCard(), this.drawCard(), this.drawCard());
    else if (street === "TURN" || street === "RIVER") this.state.board.push(this.drawCard());
  }

  private findOpenSeat(): number {
    for (let i = 0; i < this.state.seats.length; i++) if (!this.state.seats[i]) return i;
    return -1;
  }

  private findNextOccupiedSeat(fromSeat: number): number | null {
    const n = this.state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (fromSeat + i) % n;
      if (this.state.seats[seat]) return seat;
    }
    return null;
  }

  private findNextActiveSeat(fromSeat: number): number | null {
    const n = this.state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (fromSeat + i) % n;
      const id = this.state.seats[seat];
      if (!id) continue;
      const p = this.state.playersById.get(id);
      if (!p) continue;
      if (p.status === "ACTIVE" && p.stackCents > 0) return seat;
    }
    return null;
  }

  private findNextToActSeat(fromSeat: number): number {
    const n = this.state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (fromSeat + i) % n;
      const id = this.state.seats[seat];
      if (!id) continue;
      const p = this.state.playersById.get(id);
      if (!p) continue;
      if (eligibleToAct(p) && p.needsAction) return seat;
    }
    for (let i = 0; i < n; i++) {
      const id = this.state.seats[i];
      if (!id) continue;
      const p = this.state.playersById.get(id);
      if (p && eligibleToAct(p)) return i;
    }
    return fromSeat;
  }

  private *iterPlayersInSeatOrder(): Generator<PlayerState> {
    for (let i = 0; i < this.state.seats.length; i++) {
      const id = this.state.seats[i];
      if (!id) continue;
      const p = this.state.playersById.get(id);
      if (p) yield p;
    }
  }

  private seatOrderLeftOfDealer(): string[] {
    const order: string[] = [];
    const n = this.state.seats.length;
    for (let i = 1; i <= n; i++) {
      const seat = (this.state.dealerSeat + i) % n;
      const id = this.state.seats[seat];
      if (!id) continue;
      const p = this.state.playersById.get(id);
      if (p && p.status !== "OUT") order.push(id);
    }
    return order;
  }

  private countNonOutPlayers(): number {
    let c = 0;
    for (const p of this.state.playersById.values()) if (p.status !== "OUT") c++;
    return c;
  }

  private countHumanPlayers(): number {
    let c = 0;
    for (const p of this.state.playersById.values()) if (p.kind === "HUMAN" && p.status !== "OUT") c++;
    return c;
  }

  private async maybeActForBot(): Promise<void> {
    if (this.state.street === "WAITING") return;
    const toActId = this.state.seats[this.state.toActSeat] ?? "";
    const p = this.state.playersById.get(toActId);
    if (!toActId || !p || p.kind !== "BOT") return;
    if (!eligibleToAct(p) || !p.needsAction) return;

    const options = this.buildHeroActionOptions(toActId);
    if (!options) return;

    const ctx = {
      heroActionOptions: options,
      handSnapshot: {
        street: this.state.street,
        potCents: this.state.potCents,
        roundCurrentBetCents: this.state.roundCurrentBetCents,
        board: [...this.state.board],
      },
      seatSnapshot: { stackCents: p.stackCents, roundBetCents: p.roundBetCents, seat: p.seat },
    };
    await new Promise((r) => setTimeout(r, BOT_ACTION_DELAY_MS));
    const payload = this.botBrain.pickAction(ctx);
    await this.handleAction(toActId, payload);
  }

  private countNotFoldedPlayers(): number {
    let c = 0;
    for (const p of this.state.playersById.values()) {
      if (p.status !== "FOLDED" && p.status !== "ABANDONED" && p.status !== "OUT") c++;
    }
    return c;
  }

  private sendTableSnapshotToAll(reason: SnapshotReason, actionId?: string) {
    for (const [userId, client] of this.clientsByUserId.entries()) {
      const payload = this.buildTableSnapshot(userId, reason, actionId);
      const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload });
      if (!parsed.success) {
        logger.warn({ reason, userId, errors: parsed.error.flatten() }, "Dropping invalid TABLE_SNAPSHOT payload");
        continue;
      }
      client.send("TABLE_SNAPSHOT", payload);
      logger.debug({
        snapshotVersion: payload.version,
        handId: payload.hand?.handId ?? "",
        actionId: payload.actionId ?? "",
        reason,
        userId,
      }, "TABLE_SNAPSHOT emitted");
    }
  }

  private sendTableSnapshotToUser(userId: string, reason: SnapshotReason, actionId?: string) {
    const client = this.clientsByUserId.get(userId);
    if (!client) return;

    const payload = this.buildTableSnapshot(userId, reason, actionId);
    const parsed = TableOutboundMessageSchema.safeParse({ type: "TABLE_SNAPSHOT", payload });
    if (!parsed.success) {
      logger.warn({ reason, userId, errors: parsed.error.flatten() }, "Dropping invalid TABLE_SNAPSHOT payload");
      return;
    }

    client.send("TABLE_SNAPSHOT", payload);
    logger.debug({
      snapshotVersion: payload.version,
      handId: payload.hand?.handId ?? "",
      actionId: payload.actionId ?? "",
      reason,
      userId,
    }, "TABLE_SNAPSHOT emitted (single user)");
  }

  private buildTableSnapshot(userId: string, reason: SnapshotReason, actionId?: string): TableSnapshotPayload {
    const nowTs = Date.now();
    const hero = this.state.playersById.get(userId);
    const seats = this.state.seats.map((occupantUserId, seat) => {
      const p = occupantUserId ? this.state.playersById.get(occupantUserId) : undefined;
      return {
        seat,
        occupied: Boolean(p),
        userId: p?.id,
        isBot: p?.kind === "BOT",
        name: p?.name || "Empty",
        status: p?.status ?? "OUT",
        stackCents: p?.stackCents ?? 0,
        roundBetCents: p?.roundBetCents ?? 0,
        committedCents: p?.committedCents ?? 0,
        connected: p?.connected ?? false,
        isDealer: this.state.dealerSeat === seat,
        isToAct: this.state.toActSeat === seat,
      };
    });

    const hand = this.state.street === "WAITING"
      ? undefined
      : {
          handId: this.state.handId,
          handNumber: this.state.handNumber,
          street: this.state.street,
          dealerSeat: this.state.dealerSeat,
          toActSeat: this.state.toActSeat,
          actionCount: this.state.actionCount,
          roundCurrentBetCents: this.state.roundCurrentBetCents,
          minRaiseCents: this.state.minRaiseCents,
          potCents: this.state.potCents,
          board: [...this.state.board],
        };

    const payloadWithoutHash = {
      version: 1 as const,
      snapshotId: `snap_${this.state.tableId}_${nanoid(10)}`,
      emittedAtTs: nowTs,
      serverTimeTs: nowTs,
      reason,
      actionId,
      table: {
        tableId: this.state.tableId,
        tableName: this.state.tableName,
        visibility: this.state.visibility,
        maxSeats: this.state.maxSeats,
        smallBlindCents: this.state.smallBlindCents,
        bigBlindCents: this.state.bigBlindCents,
        minBuyInCents: this.state.minBuyInCents,
        maxBuyInCents: this.state.maxBuyInCents,
      },
      hand,
      seats,
      hero: {
        userId,
        youAreSeated: Boolean(hero),
        seat: hero?.seat,
        holeCards: hero ? this.holeCardsByPlayerId.get(userId) : undefined,
        actionOptions: this.buildHeroActionOptions(userId),
      },
      lastHandResult: this.lastHandResult,
    };

    const stateHash = createHash("sha1").update(JSON.stringify(payloadWithoutHash)).digest("hex");
    return {
      ...payloadWithoutHash,
      stateHash,
    };
  }

  private buildHeroActionOptions(userId: string): HeroActionOptions | undefined {
    const p = this.state.playersById.get(userId);
    if (!p || this.state.street === "WAITING") return undefined;

    const isHeroTurn = p.seat === this.state.toActSeat && eligibleToAct(p);
    const callAmount = Math.max(0, this.state.roundCurrentBetCents - p.roundBetCents);
    const minRaiseTo = this.state.roundCurrentBetCents + this.state.minRaiseCents;
    const maxRaiseTo = p.roundBetCents + p.stackCents;

    const canCheck = isHeroTurn && callAmount === 0;
    const canCall = isHeroTurn && callAmount > 0 && p.stackCents >= callAmount;
    const canBet = isHeroTurn && this.state.roundCurrentBetCents === 0 && p.stackCents > 0;
    const canRaise = isHeroTurn && this.state.roundCurrentBetCents > 0 && maxRaiseTo >= minRaiseTo && p.stackCents > callAmount;
    const canAllIn = isHeroTurn && p.stackCents > 0;
    const canFold = isHeroTurn;

    return {
      canFold,
      canCheck,
      canCall,
      canBet,
      canRaise,
      canAllIn,
      callAmount,
      minRaiseTo: canRaise ? minRaiseTo : undefined,
      maxRaiseTo: maxRaiseTo > 0 ? maxRaiseTo : undefined,
    };
  }
}
