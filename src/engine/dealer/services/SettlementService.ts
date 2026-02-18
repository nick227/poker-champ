import type { PersistenceFacade } from "../../persistence/PersistenceFacade.js";
import { PokerError } from "../../errors.js";
import type { PlayerState } from "../../../state/PlayerState.js";
import type { PokerState } from "../../../state/PokerState.js";

type DebitActionKind = "CALL" | "BET" | "RAISE" | "ALL_IN" | "POST_SB" | "POST_BB";

export class SettlementService {
  private currentHandActionIndex = 0;
  private currentHandPayoutIndex = 0;

  constructor(private readonly deps: {
    state: PokerState;
    persistence: PersistenceFacade;
  }) {}

  resetHandCounters(): void {
    this.currentHandActionIndex = 0;
    this.currentHandPayoutIndex = 0;
  }

  assertCanAfford(player: PlayerState, amountCents: number): void {
    if (amountCents > player.stackCents) {
      throw new PokerError("INSUFFICIENT_STACK", "Insufficient stack for this action.");
    }
  }

  async postBlind(player: PlayerState, blindType: "SB" | "BB", amountCents: number): Promise<void> {
    this.assertCanAfford(player, amountCents);

    const next = await this.deps.persistence.postBlind({
      userId: player.id,
      handId: this.deps.state.handId,
      blindType,
      amountCents,
      currentBalance: player.stackCents,
      player,
    });

    player.stackCents = next;
    player.roundBetCents += amountCents;
    player.committedCents += amountCents;
    this.deps.state.potCents += amountCents;
  }

  async persistDebitForAction(
    player: PlayerState,
    amountCents: number,
    action: DebitActionKind,
    _meta?: Record<string, unknown>,
  ): Promise<number> {
    if (amountCents <= 0) return player.stackCents;

    const next = await this.deps.persistence.debitBet({
      userId: player.id,
      handId: this.deps.state.handId,
      street: this.deps.state.street,
      action: action === "POST_SB" || action === "POST_BB" ? "BET" : action,
      amountCents,
      sequenceNum: this.deps.state.actionCount + 1,
      currentBalance: player.stackCents,
      player,
    });

    return next;
  }

  async applyActionDebit(
    player: PlayerState,
    amountCents: number,
    action: DebitActionKind,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const next = await this.persistDebitForAction(player, amountCents, action, meta);
    this.applyDebitToRuntimeState(player, amountCents, next);
  }

  applyDebitToRuntimeState(
    player: PlayerState,
    amountCents: number,
    nextStackCents: number,
  ): void {
    if (amountCents <= 0) return;

    this.deps.state.actionCount++;
    player.stackCents = nextStackCents;
    player.roundBetCents += amountCents;
    player.committedCents += amountCents;
    this.deps.state.potCents += amountCents;

    if (player.stackCents === 0) {
      player.status = "ALL_IN";
      player.needsAction = false;
    }
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
    await this.recordAcceptedPayout(player.id, amountCents);
    const next = await this.deps.persistence.creditPayout({
      userId: player.id,
      handId: this.deps.state.handId,
      amountCents,
      currentBalance: player.stackCents,
      player,
    });
    player.stackCents = next;
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
  }
}
