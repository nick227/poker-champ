/** Format USD cents (bankroll, entry fees, payouts). Not for tournament table chips. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

/** Compact USD cents for width-constrained chrome (e.g. $12,345 -> $12.3K). */
export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  const compact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
  return `$${compact}`;
}
