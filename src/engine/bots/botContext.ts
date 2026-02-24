import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { Street } from "../../state/PokerState.js";

export interface BotActionRng {
  next(): number; // [0, 1)
}

export interface BotActionContext {
  heroActionOptions: HeroActionOptions;
  handSnapshot: {
    street: Street;
    potCents: number;
    roundCurrentBetCents: number;
    board: string[];
  };
  seatSnapshot: {
    stackCents: number;
    roundBetCents: number;
    seat: number;
  };
  activePlayersInHand?: number;
  heroHoleCards?: string[];
  rng?: BotActionRng;
}
