import type { DecisionState } from "./types.js";

type RuntimePlayerShape = {
  id: string;
  seat: number;
  kind: "HUMAN" | "BOT";
  status: "WAITING" | "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT" | "ABANDONED";
  connected?: boolean;
  connectionState?: "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "GONE";
  needsAction: boolean;
};

type RuntimeStateShape = {
  tableId: string;
  hand?: DecisionState["hand"];
  handId?: string;
  street?: "WAITING" | "PREFLOP" | "FLOP" | "TURN" | "RIVER" | "SHOWDOWN";
  toActSeat?: number;
  turnDeadlineMs?: number;
  players: RuntimePlayerShape[];
};

export function projectDecisionState(runtime: RuntimeStateShape): DecisionState {
  const handFromRuntime = runtime.hand;
  const handId = runtime.handId ?? "";
  const street = runtime.street ?? "WAITING";
  const toActSeat = runtime.toActSeat ?? -1;
  const hand =
    handFromRuntime ??
    (handId.length > 0
      ? {
          handId,
          street,
          toActSeat,
          turnDeadlineMs: runtime.turnDeadlineMs,
        }
      : undefined);

  return {
    tableId: runtime.tableId,
    // Keep array/object references stable unless translation is required.
    players: runtime.players as DecisionState["players"],
    hand,
  };
}
