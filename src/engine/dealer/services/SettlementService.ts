import type { PersistenceFacade } from "../../persistence/PersistenceFacade.js";
import { PokerError } from "../../errors.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { PokerState } from "../../../state/PokerState.js";
import { assertMoneyConservationTransition } from "../../invariants/assertMoneyConservation.js";
import { logger } from "../../../lib/logger.js";

type DebitActionKind = "CALL" | "BET" | "RAISE" | "ALL_IN" | "POST_SB" | "POST_BB";

function resolveHeroTraceUserId(): string | null {
  const value = process.env.HERO_TRACE_USER_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function shouldTraceUser(userId: string): boolean {
  const heroTraceUserId = resolveHeroTraceUserId();
  return !heroTraceUserId || heroTraceUserId === userId;
}

function traceHero(event: string, payload: Record<string, unknown>): void {
  try {
    console.log(`[HERO_TRACE] ${event} ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[HERO_TRACE] ${event}`);
  }
}

export class SettlementService {
  private currentHandActionIndex = 0;
  private currentHandPayoutIndex = 0;
  private currentHandPotDisbursedCents = 0;

  constructor(private readonly deps: {
    state: PokerState;
    persistence: PersistenceFacade;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    getHandStartingStacksByPlayerId: () => Map<string, number>;
  }) {}

  resetHandCounters(): void {
    this.currentHandActionIndex = 0;
    this.currentHandPayoutIndex = 0;
    this.currentHandPotDisbursedCents = 0;
  }

  assertCanAfford(player: PlayerState, amountCents: number): void {
    if (amountCents > player.stackCents) {
      throw new PokerError("INSUFFICIENT_STACK", "Insufficient stack for this action.");
    }
  }

  private assertTrackedPlayer(player: PlayerState, context: string): void {
    const tracked = this.deps.state.playersById.get(player.id);
    if (!tracked || tracked !== player) {
      throw new PokerError("BAD_STATE", `${context}: player must be tracked in state.playersById.`);
    }
  }

  private assertDebitDelta(
    amountCents: number,
    prevStackCents: number,
    nextStackCents: number,
    context: string,
  ): void {
    if (amountCents < 0) {
      throw new PokerError("BAD_STATE", `${context}: debit amount cannot be negative.`);
    }
    if (amountCents > prevStackCents) {
      throw new PokerError("BAD_STATE", `${context}: debit exceeds player stack.`);
    }
    const expectedNext = prevStackCents - amountCents;
    if (nextStackCents !== expectedNext) {
      throw new PokerError(
        "BAD_STATE",
        `${context}: stack delta mismatch (expected ${expectedNext}, got ${nextStackCents}).`,
      );
    }
  }

  private assertCreditDelta(
    amountCents: number,
    prevStackCents: number,
    nextStackCents: number,
    context: string,
  ): void {
    if (amountCents < 0) {
      throw new PokerError("BAD_STATE", `${context}: credit amount cannot be negative.`);
    }
    const expectedNext = prevStackCents + amountCents;
    if (nextStackCents !== expectedNext) {
      throw new PokerError(
        "BAD_STATE",
        `${context}: stack delta mismatch (expected ${expectedNext}, got ${nextStackCents}).`,
      );
    }
  }

  private sumStacksCents(): number {
    let sum = 0;
    for (const p of this.deps.state.playersById.values()) {
      sum += p.stackCents;
    }
    return sum;
  }

  private formatMoneyDump(params: {
    actionType: string;
    actorUserId: string;
    expectedNext: number;
    persistedNext: number;
    stackBefore: number;
    stackAfter: number;
    roundBetBefore: number;
    roundBetAfter: number;
    potBefore: number;
    potAfter: number;
  }): string {
    const state = this.deps.state;
    return [
      `table=${state.tableId}`,
      `hand=${state.handId}`,
      `user=${params.actorUserId}`,
      `action=${params.actionType}`,
      `street=${state.street}`,
      `toActSeat=${state.toActSeat}`,
      `actionCount=${state.actionCount}`,
      `handActionSeq=${state.handActionSeq}`,
      `expectedNext=${params.expectedNext}`,
      `persistedNext=${params.persistedNext}`,
      `stackBefore=${params.stackBefore}`,
      `stackAfter=${params.stackAfter}`,
      `roundBetBefore=${params.roundBetBefore}`,
      `roundBetAfter=${params.roundBetAfter}`,
      `potBefore=${params.potBefore}`,
      `potAfter=${params.potAfter}`,
      `roundCurrentBet=${state.roundCurrentBetCents}`,
      `minRaise=${state.minRaiseCents}`,
    ].join(" ");
  }

  private traceMoneyEvent(params: {
    event: "POST_BLIND" | "ACTION_DEBIT" | "SHOWDOWN_PAYOUT" | "UNCALLED_RETURN";
    actionType: string;
    player: PlayerState;
    amountCents: number;
    stackBefore: number;
    stackAfter: number;
    roundBetBefore: number;
    roundBetAfter: number;
    potBefore: number;
    potAfter: number;
  }): void {
    if (!shouldTraceUser(params.player.id)) return;
    const state = this.deps.state;
    traceHero("MONEY_EVENT", {
      tableId: state.tableId,
      handId: state.handId,
      userId: params.player.id,
      seat: params.player.seat,
      event: params.event,
      actionType: params.actionType,
      street: state.street,
      amountCents: params.amountCents,
      stackBefore: params.stackBefore,
      stackAfter: params.stackAfter,
      roundBetBefore: params.roundBetBefore,
      roundBetAfter: params.roundBetAfter,
      potBefore: params.potBefore,
      potAfter: params.potAfter,
      committedCents: params.player.committedCents,
      status: params.player.status,
      roundCurrentBetCents: state.roundCurrentBetCents,
      minRaiseCents: state.minRaiseCents,
      toActSeat: state.toActSeat,
      actionCount: state.actionCount,
      handActionSeq: state.handActionSeq,
    });
  }

  getCurrentHandPotDisbursedCents(): number {
    return this.currentHandPotDisbursedCents;
  }

  async postBlind(player: PlayerState, blindType: "SB" | "BB", amountCents: number): Promise<number> {
    this.assertTrackedPlayer(player, "POST_BLIND");
    const postedAmount = Math.min(amountCents, player.stackCents);
    if (postedAmount <= 0) return 0;
    const prevStackCents = player.stackCents;
    const prevRoundBetCents = player.roundBetCents;
    const totalStacksBeforeCents = this.sumStacksCents();
    const potCentsBefore = this.deps.state.potCents;
    const disbursedBefore = this.currentHandPotDisbursedCents;
    const nextStackCents = prevStackCents - postedAmount;

    player.stackCents = nextStackCents;
    player.roundBetCents += postedAmount;
    player.committedCents += postedAmount;
    this.deps.state.potCents += postedAmount;
    this.assertDebitDelta(postedAmount, prevStackCents, player.stackCents, "POST_BLIND");
    if (player.roundBetCents !== prevRoundBetCents + postedAmount) {
      throw new PokerError("BAD_STATE", "POST_BLIND: round bet delta mismatch.");
    }
    if (this.deps.state.potCents !== potCentsBefore + postedAmount) {
      throw new PokerError("BAD_STATE", "POST_BLIND: pot delta mismatch.");
    }
    if (player.stackCents === 0) {
      player.status = "ALL_IN";
      player.needsAction = false;
    }
    assertMoneyConservationTransition({
      event: "POST_BLIND",
      actionType: blindType === "SB" ? "POST_SB" : "POST_BB",
      actorUserId: player.id,
      street: this.deps.state.street,
      state: this.deps.state,
      actor: {
        userId: player.id,
        stackCentsBefore: prevStackCents,
        stackCentsAfter: player.stackCents,
        roundBetCentsBefore: prevRoundBetCents,
        roundBetCentsAfter: player.roundBetCents,
      },
      potCentsBefore,
      potCentsAfter: this.deps.state.potCents,
      totalStacksBeforeCents,
      totalStacksAfterCents: this.sumStacksCents(),
      potDisbursedCentsBefore: disbursedBefore,
      potDisbursedCentsAfter: this.currentHandPotDisbursedCents,
      expectedActorStackDeltaCents: -postedAmount,
      expectedActorRoundBetDeltaCents: postedAmount,
      expectedPotDeltaCents: postedAmount,
      expectedMassDeltaCents: 0,
    });
    this.traceMoneyEvent({
      event: "POST_BLIND",
      actionType: blindType === "SB" ? "POST_SB" : "POST_BB",
      player,
      amountCents: postedAmount,
      stackBefore: prevStackCents,
      stackAfter: player.stackCents,
      roundBetBefore: prevRoundBetCents,
      roundBetAfter: player.roundBetCents,
      potBefore: potCentsBefore,
      potAfter: this.deps.state.potCents,
    });

    const persistedNext = await this.deps.persistence.postBlind({
      userId: player.id,
      handId: this.deps.state.handId,
      blindType,
      amountCents: postedAmount,
      currentBalance: prevStackCents,
      player,
    });
    if (persistedNext !== nextStackCents) {
      const dump = this.formatMoneyDump({
        actionType: blindType === "SB" ? "POST_SB" : "POST_BB",
        actorUserId: player.id,
        expectedNext: nextStackCents,
        persistedNext,
        stackBefore: prevStackCents,
        stackAfter: player.stackCents,
        roundBetBefore: prevRoundBetCents,
        roundBetAfter: player.roundBetCents,
        potBefore: potCentsBefore,
        potAfter: this.deps.state.potCents,
      });
      throw new PokerError(
        "BAD_STATE",
        `LEDGER_BALANCE_MISMATCH ${dump}`,
      );
    }
    return postedAmount;
  }

  async persistDebitForAction(
    player: PlayerState,
    amountCents: number,
    action: DebitActionKind,
    currentBalanceCents: number,
    _meta?: Record<string, unknown>,
  ): Promise<number> {
    if (amountCents <= 0) return currentBalanceCents;

    return await this.deps.persistence.debitBet({
      userId: player.id,
      handId: this.deps.state.handId,
      street: this.deps.state.street,
      action: action === "POST_SB" || action === "POST_BB" ? "BET" : action,
      amountCents,
      sequenceNum: this.deps.state.actionCount + 1,
      currentBalance: currentBalanceCents,
      player,
    });
  }

  async applyActionDebit(
    player: PlayerState,
    amountCents: number,
    action: DebitActionKind,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    if (amountCents <= 0) return;
    this.assertTrackedPlayer(player, "ACTION_DEBIT");
    const prevStackCents = player.stackCents;
    const prevRoundBetCents = player.roundBetCents;
    const potCentsBefore = this.deps.state.potCents;
    const expectedNextStackCents = prevStackCents - amountCents;
    this.applyDebitToRuntimeState(player, amountCents, expectedNextStackCents);
    const persistedNext = await this.persistDebitForAction(player, amountCents, action, prevStackCents, meta);
    if (persistedNext !== expectedNextStackCents) {
      const dump = this.formatMoneyDump({
        actionType: action,
        actorUserId: player.id,
        expectedNext: expectedNextStackCents,
        persistedNext,
        stackBefore: prevStackCents,
        stackAfter: player.stackCents,
        roundBetBefore: prevRoundBetCents,
        roundBetAfter: player.roundBetCents,
        potBefore: potCentsBefore,
        potAfter: this.deps.state.potCents,
      });
      throw new PokerError(
        "BAD_STATE",
        `LEDGER_BALANCE_MISMATCH ${dump}`,
      );
    }
  }

  applyDebitToRuntimeState(
    player: PlayerState,
    amountCents: number,
    nextStackCents: number,
  ): void {
    if (amountCents <= 0) return;
    const prevStackCents = player.stackCents;
    const prevRoundBetCents = player.roundBetCents;
    const totalStacksBeforeCents = this.sumStacksCents();
    const potCentsBefore = this.deps.state.potCents;
    const disbursedBefore = this.currentHandPotDisbursedCents;
    this.assertDebitDelta(amountCents, prevStackCents, nextStackCents, "ACTION_DEBIT");

    this.deps.state.actionCount++;
    player.stackCents = nextStackCents;
    player.roundBetCents += amountCents;
    player.committedCents += amountCents;
    this.deps.state.potCents += amountCents;
    if (player.roundBetCents !== prevRoundBetCents + amountCents) {
      throw new PokerError("BAD_STATE", "ACTION_DEBIT: round bet delta mismatch.");
    }
    if (this.deps.state.potCents !== potCentsBefore + amountCents) {
      throw new PokerError("BAD_STATE", "ACTION_DEBIT: pot delta mismatch.");
    }

    if (player.stackCents === 0) {
      player.status = "ALL_IN";
      player.needsAction = false;
    }
    assertMoneyConservationTransition({
      event: "ACTION_DEBIT",
      actionType: "ACTION_DEBIT",
      actorUserId: player.id,
      street: this.deps.state.street,
      state: this.deps.state,
      actor: {
        userId: player.id,
        stackCentsBefore: prevStackCents,
        stackCentsAfter: player.stackCents,
        roundBetCentsBefore: prevRoundBetCents,
        roundBetCentsAfter: player.roundBetCents,
      },
      potCentsBefore,
      potCentsAfter: this.deps.state.potCents,
      totalStacksBeforeCents,
      totalStacksAfterCents: this.sumStacksCents(),
      potDisbursedCentsBefore: disbursedBefore,
      potDisbursedCentsAfter: this.currentHandPotDisbursedCents,
      expectedActorStackDeltaCents: -amountCents,
      expectedActorRoundBetDeltaCents: amountCents,
      expectedPotDeltaCents: amountCents,
      expectedMassDeltaCents: 0,
    });
    this.traceMoneyEvent({
      event: "ACTION_DEBIT",
      actionType: "ACTION_DEBIT",
      player,
      amountCents,
      stackBefore: prevStackCents,
      stackAfter: player.stackCents,
      roundBetBefore: prevRoundBetCents,
      roundBetAfter: player.roundBetCents,
      potBefore: potCentsBefore,
      potAfter: this.deps.state.potCents,
    });
  }

  async recordAcceptedAction(params: {
    player: PlayerState;
    action: "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
    amountCents: number;
    potBeforeCents: number;
    potAfterCents: number;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const { state, persistence } = this.deps;
    if (!persistence.enabled || !persistence.handHistory) return;
    if (!state.handId) throw new PokerError("BAD_STATE", "Cannot persist action without active handId.");

    const nextActionIndex = this.currentHandActionIndex + 1;
    await persistence.handHistory.recordAction({
      tableId: state.tableId,
      handId: state.handId,
      playerId: params.player.id,
      seat: params.player.seat,
      actionIndex: nextActionIndex,
      street: state.street,
      action: params.action,
      amountCents: params.amountCents,
      potBeforeCents: params.potBeforeCents,
      potAfterCents: params.potAfterCents,
      meta: params.meta,
    });
    this.currentHandActionIndex = nextActionIndex;
  }

  async recordAcceptedPayout(playerId: string, amountCents: number): Promise<void> {
    const { state, persistence } = this.deps;
    if (!persistence.enabled || !persistence.handHistory) return;
    if (!state.handId) throw new PokerError("BAD_STATE", "Cannot persist payout without active handId.");

    const nextPayoutIndex = this.currentHandPayoutIndex + 1;
    await persistence.handHistory.recordPayout({
      tableId: state.tableId,
      handId: state.handId,
      playerId,
      payoutIndex: nextPayoutIndex,
      amountCents,
    });
    this.currentHandPayoutIndex = nextPayoutIndex;
  }

  async creditPayoutToPlayer(player: PlayerState, amountCents: number): Promise<void> {
    this.assertTrackedPlayer(player, "SHOWDOWN_PAYOUT");
    const prevStackCents = player.stackCents;
    const prevRoundBetCents = player.roundBetCents;
    const totalStacksBeforeCents = this.sumStacksCents();
    const potCentsBefore = this.deps.state.potCents;
    const disbursedBefore = this.currentHandPotDisbursedCents;
    const next = prevStackCents + amountCents;
    player.stackCents = next;
    this.currentHandPotDisbursedCents += amountCents;
    this.assertCreditDelta(amountCents, prevStackCents, player.stackCents, "SHOWDOWN_PAYOUT");
    assertMoneyConservationTransition({
      event: "SHOWDOWN_PAYOUT",
      actionType: "PAYOUT",
      actorUserId: player.id,
      street: this.deps.state.street,
      state: this.deps.state,
      actor: {
        userId: player.id,
        stackCentsBefore: prevStackCents,
        stackCentsAfter: player.stackCents,
        roundBetCentsBefore: prevRoundBetCents,
        roundBetCentsAfter: player.roundBetCents,
      },
      potCentsBefore,
      potCentsAfter: this.deps.state.potCents,
      totalStacksBeforeCents,
      totalStacksAfterCents: this.sumStacksCents(),
      potDisbursedCentsBefore: disbursedBefore,
      potDisbursedCentsAfter: this.currentHandPotDisbursedCents,
      expectedActorStackDeltaCents: amountCents,
      expectedActorRoundBetDeltaCents: 0,
      expectedPotDeltaCents: 0,
      expectedMassDeltaCents: 0,
    });
    this.traceMoneyEvent({
      event: "SHOWDOWN_PAYOUT",
      actionType: "PAYOUT",
      player,
      amountCents,
      stackBefore: prevStackCents,
      stackAfter: player.stackCents,
      roundBetBefore: prevRoundBetCents,
      roundBetAfter: player.roundBetCents,
      potBefore: potCentsBefore,
      potAfter: this.deps.state.potCents,
    });
    await this.recordAcceptedPayout(player.id, amountCents);
    const persistedNext = await this.deps.persistence.creditPayout({
      userId: player.id,
      handId: this.deps.state.handId,
      amountCents,
      currentBalance: prevStackCents,
      player,
    });
    if (persistedNext !== next) {
      const dump = this.formatMoneyDump({
        actionType: "PAYOUT",
        actorUserId: player.id,
        expectedNext: next,
        persistedNext,
        stackBefore: prevStackCents,
        stackAfter: player.stackCents,
        roundBetBefore: prevRoundBetCents,
        roundBetAfter: player.roundBetCents,
        potBefore: potCentsBefore,
        potAfter: this.deps.state.potCents,
      });
      throw new PokerError(
        "BAD_STATE",
        `LEDGER_BALANCE_MISMATCH ${dump}`,
      );
    }
  }

  async creditRefundToPlayer(player: PlayerState, amountCents: number, reason: string): Promise<void> {
    if (amountCents <= 0) return;
    this.assertTrackedPlayer(player, "UNCALLED_RETURN");
    const prevStackCents = player.stackCents;
    const prevRoundBetCents = player.roundBetCents;
    const totalStacksBeforeCents = this.sumStacksCents();
    const potCentsBefore = this.deps.state.potCents;
    const disbursedBefore = this.currentHandPotDisbursedCents;
    const next = prevStackCents + amountCents;
    player.stackCents = next;
    this.currentHandPotDisbursedCents += amountCents;
    this.assertCreditDelta(amountCents, prevStackCents, player.stackCents, "UNCALLED_RETURN");
    assertMoneyConservationTransition({
      event: "UNCALLED_RETURN",
      actionType: "REFUND",
      actorUserId: player.id,
      street: this.deps.state.street,
      state: this.deps.state,
      actor: {
        userId: player.id,
        stackCentsBefore: prevStackCents,
        stackCentsAfter: player.stackCents,
        roundBetCentsBefore: prevRoundBetCents,
        roundBetCentsAfter: player.roundBetCents,
      },
      potCentsBefore,
      potCentsAfter: this.deps.state.potCents,
      totalStacksBeforeCents,
      totalStacksAfterCents: this.sumStacksCents(),
      potDisbursedCentsBefore: disbursedBefore,
      potDisbursedCentsAfter: this.currentHandPotDisbursedCents,
      expectedActorStackDeltaCents: amountCents,
      expectedActorRoundBetDeltaCents: 0,
      expectedPotDeltaCents: 0,
      expectedMassDeltaCents: 0,
    });
    this.traceMoneyEvent({
      event: "UNCALLED_RETURN",
      actionType: "REFUND",
      player,
      amountCents,
      stackBefore: prevStackCents,
      stackAfter: player.stackCents,
      roundBetBefore: prevRoundBetCents,
      roundBetAfter: player.roundBetCents,
      potBefore: potCentsBefore,
      potAfter: this.deps.state.potCents,
    });
    const persistedNext = await this.deps.persistence.creditRefund({
      userId: player.id,
      handId: this.deps.state.handId,
      amountCents,
      reason,
      currentBalance: prevStackCents,
      player,
    });
    if (persistedNext !== next) {
      const dump = this.formatMoneyDump({
        actionType: "REFUND",
        actorUserId: player.id,
        expectedNext: next,
        persistedNext,
        stackBefore: prevStackCents,
        stackAfter: player.stackCents,
        roundBetBefore: prevRoundBetCents,
        roundBetAfter: player.roundBetCents,
        potBefore: potCentsBefore,
        potAfter: this.deps.state.potCents,
      });
      throw new PokerError(
        "BAD_STATE",
        `LEDGER_BALANCE_MISMATCH ${dump}`,
      );
    }
  }

  async finalizePersistedHand(reason: "SHOWDOWN" | "ALL_FOLDED"): Promise<void> {
    const { state, persistence } = this.deps;
    if (!persistence.enabled || !persistence.handHistory) return;
    if (!state.handId) throw new PokerError("BAD_STATE", "Cannot finalize hand without handId.");

    await persistence.handHistory.endHand({
      tableId: state.tableId,
      handId: state.handId,
      reason,
      board: [...state.board],
      endingStacks: [...state.playersById.values()].map((player) => ({
        playerId: player.id,
        endingStackCents: player.stackCents,
      })),
    });

    if (!persistence.botStats) return;

    const dealtBotIds: string[] = [];
    const deltaByBotId: Record<string, number> = {};
    const holeCardsByPlayerId = this.deps.getHoleCardsByPlayerId();
    for (const dealtPlayerId of holeCardsByPlayerId.keys()) {
      const player = state.playersById.get(dealtPlayerId);
      if (!player || player.kind !== "BOT") continue;
      const characterBotId = player.botId || player.id;
      const startingStack = this.deps.getHandStartingStacksByPlayerId().get(player.id);
      if (startingStack == null) continue;
      const delta = player.stackCents - startingStack;
      deltaByBotId[characterBotId] = (deltaByBotId[characterBotId] ?? 0) + delta;
      dealtBotIds.push(characterBotId);
    }

    try {
      await persistence.botStats.recordHandResult({
        handId: state.handId,
        dealtBotIds,
        deltaByBotId,
      });
    } catch (err) {
      logger.warn(
        {
          err,
          handId: state.handId,
          tableId: state.tableId,
          dealtBotIds,
        },
        "BOT_STATS_RECORDING_FAILED_POST_SETTLEMENT",
      );
    }
  }
}
