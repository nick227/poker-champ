import { formatInputFromCents, parseInputToCents } from "./actionBar.logic";

export type WagerState = {
  cents: number;
  display: string;
};

export type WagerAction =
  | { type: "SET_INPUT"; display: string }
  | { type: "SET_CENTS"; cents: number }
  | { type: "NORMALIZE"; resolve: (raw: number) => number }
  | { type: "RESET_TO_MIN"; min: number };

export function wagerReducer(state: WagerState, action: WagerAction): WagerState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, display: action.display };

    case "SET_CENTS":
      return {
        cents: action.cents,
        display: formatInputFromCents(action.cents),
      };

    case "NORMALIZE": {
      const parsed = parseInputToCents(state.display);
      const resolved = action.resolve(parsed);
      return {
        cents: resolved,
        display: formatInputFromCents(resolved),
      };
    }

    case "RESET_TO_MIN":
      return {
        cents: action.min,
        display: formatInputFromCents(action.min),
      };

    default:
      return state;
  }
}

export function initialWagerState(minCents: number): WagerState {
  return {
    cents: minCents,
    display: formatInputFromCents(minCents),
  };
}
