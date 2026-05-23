import type { ChipAmount } from "./types";
import { chips } from "./types";

export type TableAmountDisplayMode = "chips" | "bb";

export type TableMoneyContext = {
  mode: TableAmountDisplayMode;
  bigBlind: ChipAmount;
  smallBlind?: ChipAmount;
};

export type TableMoneyFormatter = {
  formatStack: (amount: ChipAmount) => string;
  formatPot: (amount: ChipAmount) => string;
  formatBet: (amount: ChipAmount) => string;
  formatBlinds: (smallBlind: ChipAmount, bigBlind: ChipAmount) => string;
  formatAnte: (amount: ChipAmount) => string;
};

export function chipsToBb(amount: ChipAmount, bigBlind: ChipAmount): number {
  if (bigBlind <= 0) return 0;
  return amount / bigBlind;
}

export function bbToChips(bb: number, bigBlind: ChipAmount): ChipAmount {
  return chips(Math.round(bb * bigBlind));
}

export function formatChipCount(amount: ChipAmount): string {
  return Math.max(0, Math.round(amount)).toLocaleString("en-US");
}

function formatBbUnits(bb: number): string {
  const abs = Math.abs(bb);
  if (abs >= 10) {
    const rounded = Math.round(bb * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text} BB`;
  }

  const oneDecimal = Math.round(bb * 10) / 10;
  if (Math.abs(bb - oneDecimal) < 0.005) {
    const text = Number.isInteger(oneDecimal) ? String(oneDecimal) : oneDecimal.toFixed(1);
    return `${text} BB`;
  }

  const twoDecimal = Math.round(bb * 100) / 100;
  const text =
    Number.isInteger(twoDecimal) ? String(twoDecimal) : twoDecimal.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text} BB`;
}

function formatTableChipAmount(amount: ChipAmount, mode: TableAmountDisplayMode, bigBlind: ChipAmount): string {
  if (mode === "chips") return formatChipCount(amount);
  return formatBbUnits(chipsToBb(amount, bigBlind));
}

export function createTableMoneyFormatter(ctx: TableMoneyContext): TableMoneyFormatter {
  const formatAmount = (amount: ChipAmount) => formatTableChipAmount(amount, ctx.mode, ctx.bigBlind);

  return {
    formatStack: formatAmount,
    formatPot: formatAmount,
    formatBet: formatAmount,
    formatAnte: (amount) => formatChipCount(amount),
    formatBlinds: (smallBlind, bigBlind) =>
      `${formatChipCount(smallBlind)} / ${formatChipCount(bigBlind)}`,
  };
}

export function resolveTournamentBigBlindChips(snapshot: {
  table?: {
    bigBlindCents?: number;
    tournament?: { bigBlindCents?: number } | null;
  } | null;
}): ChipAmount {
  const bb =
    snapshot.table?.tournament?.bigBlindCents ??
    snapshot.table?.bigBlindCents ??
    100;
  return chips(bb);
}

export function isTournamentTableSnapshot(snapshot: {
  table?: { tournament?: unknown } | null;
} | null | undefined): boolean {
  return Boolean(snapshot?.table?.tournament);
}
