import type { UsdCents } from "./types";

/** Format real-money USD cents (bankroll, entry fees, payouts). */
export function formatUsd(cents: UsdCents | number): string {
  const value = typeof cents === "number" ? cents : cents;
  return `$${(value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
