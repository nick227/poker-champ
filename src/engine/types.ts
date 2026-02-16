export type Street = "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

export type PlayerStatus =
  | "WAITING"
  | "ACTIVE"
  | "FOLDED"
  | "ALL_IN"
  | "OUT";

export type Action =
  | "FOLD"
  | "CHECK"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN";

export type BettingContext = {
  street: Street;
  currentBetCents: number;
  minRaiseCents: number;
  lastAggressorSeat: number | null;
};
