import type { DecisionPlayer, DecisionState } from "./types.js";

export type EngineQueries = {
  getToActPlayer: (state: DecisionState) => DecisionPlayer | undefined;
  startNextHandDue: (state: DecisionState, now: number) => boolean;
  bettingClosed: (state: DecisionState) => boolean;
  showdownRequired: (state: DecisionState) => boolean;
  botActionDue: (state: DecisionState, now: number) => boolean;
  humanTurnExpired: (state: DecisionState, now: number) => boolean;
};

/**
 * Phase 0 adapter boundary.
 * Rule logic should be delegated to existing engine services here in later phases.
 * This module intentionally avoids introducing a second poker-rules implementation.
 */
export function createEngineQueries(): EngineQueries {
  return {
    getToActPlayer: (state) => {
      const seat = state.hand?.toActSeat;
      if (seat == null || seat < 0) return undefined;
      return state.players.find((p) => p.seat === seat);
    },
    startNextHandDue: () => false,
    bettingClosed: () => false,
    showdownRequired: () => false,
    botActionDue: (state) => {
      const toAct = state.hand ? state.players.find((p) => p.seat === state.hand!.toActSeat) : undefined;
      return !!toAct && toAct.kind === "BOT" && toAct.status === "ACTIVE" && toAct.needsAction;
    },
    humanTurnExpired: (state, now) => {
      const toAct = state.hand ? state.players.find((p) => p.seat === state.hand!.toActSeat) : undefined;
      if (!toAct || toAct.kind !== "HUMAN" || !toAct.needsAction) return false;
      const deadline = state.hand?.turnDeadlineMs;
      if (deadline == null) return false;
      return now >= deadline;
    },
  };
}
