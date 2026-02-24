import type { SlotGame, SlotOutcomeKind, SymbolKey } from "../games/types";

export type EvaluatedOutcome = {
  winUnits: number;
  kind: SlotOutcomeKind;
  key: string;
  matchedSymbol?: SymbolKey;
};

export function evaluate(game: SlotGame, result: SymbolKey[]): EvaluatedOutcome {
  const tripleKey = result.join(",");
  const tripleUnits = game.paytable[tripleKey] ?? 0;
  if (tripleUnits > 0) {
    return {
      winUnits: tripleUnits,
      kind: "TRIPLE",
      key: tripleKey,
      matchedSymbol: result[0],
    };
  }

  const symbolCounts = result.reduce(
    (acc, symbol) => {
      acc[symbol] = (acc[symbol] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<SymbolKey, number>>,
  );
  const pairSymbol = (Object.keys(symbolCounts) as SymbolKey[]).find((k) => (symbolCounts[k] ?? 0) >= 2);
  if (pairSymbol != null) {
    const pairUnits = game.pairPaytable?.[pairSymbol] ?? 0;
    if (pairUnits > 0) {
      return {
        winUnits: pairUnits,
        kind: "PAIR",
        key: `PAIR:${pairSymbol}`,
        matchedSymbol: pairSymbol,
      };
    }
  }

  const sevenCount = result.filter((s) => s === "7").length;
  if (sevenCount > 0 && (game.anySevenPayout ?? 0) > 0) {
    return {
      winUnits: game.anySevenPayout ?? 0,
      kind: "ANY_SEVEN",
      key: "ANY_SEVEN",
      matchedSymbol: "7",
    };
  }

  return {
    winUnits: 0,
    kind: "NONE",
    key: "NONE",
  };
}
