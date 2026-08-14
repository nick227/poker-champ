import { formatCents } from "./format";
import type { SlotOutcomeKind, SymbolKey } from "../games/types";

export const SYMBOL_NAMES: Record<SymbolKey, string> = {
  A: "Crown",
  B: "Cherries",
  C: "Plum",
  D: "Heart",
  E: "Bar",
  F: "Diamond",
  "7": "Seven",
};

const SYMBOL_PLURALS: Record<SymbolKey, string> = {
  A: "crowns",
  B: "cherries",
  C: "plums",
  D: "hearts",
  E: "bars",
  F: "diamonds",
  "7": "sevens",
};

export type MachinePhase = "idle" | "spinning" | "win" | "miss" | "failed";

export type MachineReadout = {
  phase: MachinePhase;
  kind: SlotOutcomeKind | "SPINNING" | "IDLE" | "FAILED";
  headline: string;
  detail: string;
  winCents: number;
  isJackpot: boolean;
  matchedSymbol?: SymbolKey;
  result?: readonly SymbolKey[];
};

export const IDLE_READOUT: MachineReadout = {
  phase: "idle",
  kind: "IDLE",
  headline: "Good luck",
  detail: "Press spin",
  winCents: 0,
  isJackpot: false,
};

export const SPINNING_READOUT: MachineReadout = {
  phase: "spinning",
  kind: "SPINNING",
  headline: "Spinning",
  detail: "Reels in play",
  winCents: 0,
  isJackpot: false,
};

export const FAILED_READOUT: MachineReadout = {
  phase: "failed",
  kind: "FAILED",
  headline: "Spin failed",
  detail: "Try again",
  winCents: 0,
  isJackpot: false,
};

export function toOddsText(probability: number): string {
  if (probability <= 0) return "n/a";
  return `1 in ${Math.max(1, Math.round(1 / probability)).toLocaleString()}`;
}

export function outcomeHeadline(
  kind: SlotOutcomeKind,
  matchedSymbol?: SymbolKey,
  isJackpot = false,
): string {
  if (kind === "NONE") return "No match";
  if (isJackpot || (kind === "TRIPLE" && matchedSymbol === "7")) return "Jackpot";
  if (kind === "ANY_SEVEN") return "Lucky seven";
  if (!matchedSymbol) return kind === "PAIR" ? "Pair" : "Three of a kind";
  if (kind === "PAIR") return `Pair of ${SYMBOL_PLURALS[matchedSymbol]}`;
  return `Three ${SYMBOL_PLURALS[matchedSymbol]}`;
}

export function outcomeLabel(kind: SlotOutcomeKind, combo: string, matchedSymbol?: SymbolKey): string {
  return outcomeHeadline(kind, matchedSymbol, kind === "TRIPLE" && combo === "7-7-7");
}

export function settleReadout(args: {
  kind: SlotOutcomeKind;
  matchedSymbol?: SymbolKey;
  isJackpot: boolean;
  winCents: number;
  result: readonly SymbolKey[];
}): MachineReadout {
  const headline = outcomeHeadline(args.kind, args.matchedSymbol, args.isJackpot);
  if (args.kind === "NONE" || args.winCents <= 0) {
    return {
      phase: "miss",
      kind: "NONE",
      headline: "No match",
      detail: "Payline is clear",
      winCents: 0,
      isJackpot: false,
      result: args.result,
    };
  }
  return {
    phase: "win",
    kind: args.kind,
    headline,
    detail: args.isJackpot ? `Jackpot pays ${formatCents(args.winCents)}` : `Payline pays ${formatCents(args.winCents)}`,
    winCents: args.winCents,
    isJackpot: args.isJackpot,
    matchedSymbol: args.matchedSymbol,
    result: args.result,
  };
}

export function litReelsForOutcome(
  result: readonly string[] | undefined,
  kind: MachineReadout["kind"],
  matchedSymbol?: SymbolKey,
): [boolean, boolean, boolean] {
  if (!result || result.length < 3) return [false, false, false];
  if (kind === "TRIPLE") return [true, true, true];
  if (kind === "PAIR" && matchedSymbol) {
    return [result[0] === matchedSymbol, result[1] === matchedSymbol, result[2] === matchedSymbol];
  }
  if (kind === "ANY_SEVEN") {
    return [result[0] === "7", result[1] === "7", result[2] === "7"];
  }
  return [false, false, false];
}

export function isNearWin(result: readonly string[], isJackpot: boolean): boolean {
  if (isJackpot) return false;
  return result.filter((s) => s === "7").length === 2;
}
