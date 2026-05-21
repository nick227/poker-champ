export type PokerErrorCode =
  | "TOURNAMENT_SPECTATOR_READONLY"
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
  | "HAND_ALREADY_FINISHED"
  | "DECK_ERROR"
  | "QUEUE_FULL"
  | "RATE_LIMITED";

export class PokerError extends Error {
  readonly code: PokerErrorCode;
  readonly meta?: Record<string, unknown>;

  constructor(code: PokerErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}
