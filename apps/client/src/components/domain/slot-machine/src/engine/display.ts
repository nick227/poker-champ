import type { SlotOutcomeKind, SymbolKey } from "../games/types";

export function toOddsText(probability: number): string {
  if (probability <= 0) return "n/a";
  return `1 in ${Math.max(1, Math.round(1 / probability)).toLocaleString()}`;
}

export function outcomeLabel(kind: SlotOutcomeKind, combo: string, matchedSymbol?: SymbolKey): string {
  if (kind === "TRIPLE") return combo;
  if (kind === "PAIR") return `Pair`.trim();
  if (kind === "ANY_SEVEN") return "Any 7";
  return "No Match";
}
