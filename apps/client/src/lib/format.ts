/** Format cents as dollar string e.g. 12345 -> "$123.45" */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}
