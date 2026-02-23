import type { ActionPayload } from "../../../messages/schemas.js";
import type { PokerState } from "../../../state/PokerState.js";
import { getAutoActionHandCap } from "../../../config/seats.js";
import { logger } from "../../../lib/logger.js";
import { eligibleToAct } from "../../rules/BettingRound.js";
import { BotResolver } from "../../bots/BotResolver.js";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import { BOT_ACTION_DELAY_MS } from "../timing.js";

export class TurnAutomationService {
  constructor(private readonly deps: {
    state: PokerState;
    botResolver: BotResolver;
    getHoleCardsByPlayerId: () => Map<string, string[]>;
    autoActionsByUserId: Map<string, number>;
    currentHandAutoActedUserIds: Set<string>;
    getHeroActionOptions: (userId: string) => HeroActionOptions | undefined;
    enqueueAction: (userId: string, payload: ActionPayload, delayMs?: number) => void;
    onAutoSitOutReachedCap?: (args: { userId: string; stackCents: number }) => Promise<void> | void;
  }) {}

  maybeActForBot(): void {
    const state = this.deps.state;
    if (state.street === "WAITING") return;
    if (state.runoutMode === "STAGED") return;

    const toActId = state.seats[state.toActSeat] ?? "";
    const player = state.playersById.get(toActId);
    if (!toActId || !player) return;
    if (!eligibleToAct(player) || !player.needsAction) return;

    const options = this.deps.getHeroActionOptions(toActId);
    if (!options) return;

    if (player.kind !== "BOT" && player.connected) return;

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
    this.deps.enqueueAction(toActId, payload, BOT_ACTION_DELAY_MS);
  }

  async applyDisconnectedAutoActionCapForHand(): Promise<void> {
    const cap = getAutoActionHandCap();
    if (cap <= 0) return;

    for (const player of this.deps.state.playersById.values()) {
      if (player.kind !== "HUMAN") continue;

      const autoActed = this.deps.currentHandAutoActedUserIds.has(player.id);
      if (autoActed && !player.connected) {
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
