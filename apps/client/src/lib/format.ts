/** Format USD cents (bankroll, entry fees, payouts). Not for tournament table chips. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}
