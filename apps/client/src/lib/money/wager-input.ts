import type { TableAmountDisplayMode } from "./table-money";
import { bbToChips, chipsToBb } from "./table-money";
import { chips } from "./types";

/** Format USD cents as decimal string for input e.g. 1100 -> "11.00" */
export function formatInputFromCents(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

/** Parse USD money input string to cents. Empty/invalid returns 0. */
export function parseInputToCents(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

/** Restrict input to money pattern: digits, optional decimal, max 2 decimal places. */
export function normalizeMoneyInput(text: string): string {
  const digitsAndDot = text.replace(/[^0-9.]/g, "");
  const parts = digitsAndDot.split(".");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 12);
  const integer = parts[0].slice(0, 12);
  const decimal = parts.slice(1).join("").slice(0, 2);
  return decimal.length > 0 ? `${integer}.${decimal}` : integer || "0";
}

export type WagerInputMode = "usd" | "chips" | "bb";

export type WagerInputHelpers = {
  formatFromChips: (amount: number) => string;
  parseToChips: (display: string) => number;
  normalizeInput: (text: string) => string;
};

export const USD_WAGER_INPUT_HELPERS: WagerInputHelpers = {
  formatFromChips: formatInputFromCents,
  parseToChips: parseInputToCents,
  normalizeInput: normalizeMoneyInput,
};

export function resolveWagerInputMode(
  isTournamentTable: boolean,
  tableMode: TableAmountDisplayMode,
): WagerInputMode {
  if (!isTournamentTable) return "usd";
  return tableMode === "bb" ? "bb" : "chips";
}

function formatBbInputValue(bb: number): string {
  const oneDecimal = Math.round(bb * 10) / 10;
  if (Math.abs(bb - oneDecimal) < 0.005) {
    return Number.isInteger(oneDecimal) ? String(oneDecimal) : oneDecimal.toFixed(1);
  }
  const twoDecimal = Math.round(bb * 100) / 100;
  return twoDecimal.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function createWagerInputHelpers(mode: WagerInputMode, bigBlind: number): WagerInputHelpers {
  if (mode === "usd") return USD_WAGER_INPUT_HELPERS;

  if (mode === "chips") {
    return {
      formatFromChips: (amount) => String(Math.max(0, Math.round(amount))),
      parseToChips: (display) => {
        const trimmed = display.trim().replace(/,/g, "");
        if (!trimmed) return 0;
        const numeric = Number.parseInt(trimmed, 10);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
      },
      normalizeInput: (text) => text.replace(/\D/g, "").slice(0, 12),
    };
  }

  const bb = Math.max(1, bigBlind);
  return {
    formatFromChips: (amount) => formatBbInputValue(chipsToBb(chips(amount), chips(bb))),
    parseToChips: (display) => {
      const trimmed = display.trim();
      if (!trimmed) return 0;
      const numeric = Number.parseFloat(trimmed);
      if (!Number.isFinite(numeric) || numeric < 0) return 0;
      return bbToChips(numeric, chips(bb));
    },
    normalizeInput: normalizeMoneyInput,
  };
}
