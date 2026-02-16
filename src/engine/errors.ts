export type PokerErrorCode =
  | "BAD_STATE"
  | "NOT_YOUR_TURN"
  | "NOT_ELIGIBLE"
  | "INVALID_ACTION"
  | "INVALID_BUYIN"
  | "INSUFFICIENT_STACK"
  | "INSUFFICIENT_BANKROLL"
  | "LEDGER_MISMATCH"
  | "TABLE_FULL"
  | "HAND_NOT_STARTED"
  | "DECK_ERROR";

export class PokerError extends Error {
  readonly code: PokerErrorCode;

  constructor(code: PokerErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
