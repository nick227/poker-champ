import type { WagerInputHelpers } from "@/lib/money/wager-input";
import { USD_WAGER_INPUT_HELPERS } from "@/lib/money/wager-input";

export type WagerState = {
  cents: number;
  display: string;
};

export type WagerAction =
  | { type: "SET_INPUT"; display: string }
  | { type: "SET_CENTS"; cents: number }
  | { type: "NORMALIZE"; resolve: (raw: number) => number }
  | { type: "RESET_TO_MIN"; min: number };

export function wagerReducer(
  state: WagerState,
  action: WagerAction,
  helpers: WagerInputHelpers = USD_WAGER_INPUT_HELPERS,
): WagerState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, display: action.display };

    case "SET_CENTS":
      return {
        cents: action.cents,
        display: helpers.formatFromChips(action.cents),
      };

    case "NORMALIZE": {
      const parsed = helpers.parseToChips(state.display);
      const resolved = action.resolve(parsed);
      return {
        cents: resolved,
        display: helpers.formatFromChips(resolved),
      };
    }

    case "RESET_TO_MIN":
      return {
        cents: action.min,
        display: helpers.formatFromChips(action.min),
      };

    default:
      return state;
  }
}

export function initialWagerState(minCents: number, helpers: WagerInputHelpers = USD_WAGER_INPUT_HELPERS): WagerState {
  return {
    cents: minCents,
    display: helpers.formatFromChips(minCents),
  };
}

export function createWagerReducer(helpers: WagerInputHelpers) {
  return (state: WagerState, action: WagerAction) => wagerReducer(state, action, helpers);
}
