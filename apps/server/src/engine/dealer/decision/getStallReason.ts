import { createEngineQueries, type EngineQueries } from "./engineQueries.js";
import type { DecisionState, StallReason } from "./types.js";

export function getStallReason(
  state: DecisionState,
  now: number,
  queries: EngineQueries = createEngineQueries(),
): StallReason | null {
  if (!state.hand || state.hand.street === "WAITING" || state.hand.street === "SHOWDOWN") {
    return null;
  }

  const toAct = queries.getToActPlayer(state);
  if (!toAct) return "INVALID_TO_ACT";

  if (queries.botActionDue(state, now)) return "BOT_OVERDUE";
  if (queries.humanTurnExpired(state, now)) return "TURN_TIMEOUT_OVERDUE";
  if (queries.bettingClosed(state)) return "STREET_ADVANCE_OVERDUE";
  if (queries.showdownRequired(state)) return "SHOWDOWN_OVERDUE";
  return null;
}
