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
