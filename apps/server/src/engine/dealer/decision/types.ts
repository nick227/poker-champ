export type DecisionStreet = "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";

export type DecisionPlayer = {
  id: string;
  seat: number;
  kind: "HUMAN" | "BOT";
  status: "WAITING" | "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT" | "ABANDONED";
  connected?: boolean;
  connectionState?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "GONE";
  needsAction: boolean;
};

export type DecisionState = {
  tableId: string;
  players: DecisionPlayer[];
  hand?: {
    handId: string;
    street: DecisionStreet;
    toActSeat: number;
    turnDeadlineMs?: number;
  };
};

export type EngineStep =
  | "WAIT_FOR_HUMAN"
  | "RUN_BOT_ACTION"
  | "AUTO_ACTION_TIMEOUT"
  | "ADVANCE_STREET"
  | "RUN_SHOWDOWN"
  | "START_NEXT_HAND"
  | "NO_OP";

export type StallReason =
  | "INVALID_TO_ACT"
  | "BOT_OVERDUE"
  | "TURN_TIMEOUT_OVERDUE"
  | "STREET_ADVANCE_OVERDUE"
  | "SHOWDOWN_OVERDUE";

/**
 * Explicit ownership of the next progression step in an active hand.
 * The Dealer sets this after every state mutation so "who drives next?" is
 * always inspectable without reasoning across multiple service layers.
 *
 * WAITING_FOR_HUMAN     — a connected human has been given a turn deadline
 * WAITING_FOR_AUTOMATION — a bot or disconnected-human auto-action is scheduled
 * RUNNING_LIFECYCLE     — a hand/street transition is actively executing
 * BETWEEN_HANDS         — next-hand timer is counting down
 * IDLE                  — no active hand (WAITING street or initial state)
 */
export type NextStepOwner =
  | "WAITING_FOR_HUMAN"
  | "WAITING_FOR_AUTOMATION"
  | "RUNNING_LIFECYCLE"
  | "BETWEEN_HANDS"
  | "IDLE";
