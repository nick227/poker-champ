import { createEngineQueries, type EngineQueries } from "./engineQueries.js";
import type { DecisionState, EngineStep } from "./types.js";

export function computeNextStep(
  state: DecisionState,
  now: number,
  queries: EngineQueries = createEngineQueries(),
): EngineStep {
  if (!state.hand || state.hand.street === "WAITING") {
    return queries.startNextHandDue(state, now) ? "START_NEXT_HAND" : "NO_OP";
  }

  if (queries.showdownRequired(state)) return "RUN_SHOWDOWN";
  if (queries.bettingClosed(state)) return "ADVANCE_STREET";

  const toAct = queries.getToActPlayer(state);
  if (!toAct) return "NO_OP";

  if (queries.botActionDue(state, now)) return "RUN_BOT_ACTION";
  if (queries.humanTurnExpired(state, now)) return "AUTO_ACTION_TIMEOUT";
  if (toAct.kind === "HUMAN") {
    if (toAct.connected === false) return "NO_OP";
    return "WAIT_FOR_HUMAN";
  }
  return "NO_OP";
}
