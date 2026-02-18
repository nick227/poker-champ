import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { PokerState } from "../../../state/PokerState.js";
import { eligibleToAct } from "../../rules/BettingRound.js";

export class ActionOptionsService {
  buildHeroActionOptions(state: PokerState, userId: string): HeroActionOptions | undefined {
    const player = state.playersById.get(userId);
    if (!player || state.street === "WAITING" || state.runoutMode === "STAGED") return undefined;

    const isHeroTurn = player.seat === state.toActSeat && eligibleToAct(player);
    const rawCallAmount = Math.max(0, state.roundCurrentBetCents - player.roundBetCents);
    const minRaiseTo = state.roundCurrentBetCents + state.minRaiseCents;
    const maxRaiseTo = player.roundBetCents + player.stackCents;
    const canOpenBet = state.roundCurrentBetCents === 0 && player.stackCents > 0;
    const canRaiseOverCall = state.roundCurrentBetCents > 0 && maxRaiseTo >= minRaiseTo && player.stackCents > rawCallAmount;

    const canCheck = isHeroTurn && rawCallAmount === 0;
    const canCall = isHeroTurn && rawCallAmount > 0 && player.stackCents >= rawCallAmount;
    const canBet = isHeroTurn && canOpenBet;
    const canRaise = isHeroTurn && canRaiseOverCall;
    const canAllIn = isHeroTurn && player.stackCents > 0;
    const canFold = isHeroTurn;
    const callAmount = isHeroTurn ? rawCallAmount : 0;
    const minOpenBetTo = canBet ? Math.min(state.bigBlindCents, maxRaiseTo) : undefined;
    const minActionTo = canRaise ? minRaiseTo : minOpenBetTo;
    const maxActionTo = canBet || canRaise ? maxRaiseTo : undefined;

    const primaryWagerAction = canRaise ? "RAISE" : canBet ? "BET" : "NONE";

    return {
      canFold,
      canCheck,
      canCall,
      canBet,
      canRaise,
      canAllIn,
      primaryWagerAction,
      callAmount,
      minRaiseTo: minActionTo,
      maxRaiseTo: maxActionTo,
    };
  }
}
