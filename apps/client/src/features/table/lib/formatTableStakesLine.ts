import { formatCents } from "@/lib/format";

/** Dense stakes line: "Blinds $1 | $2  ·  Min $100". Null when nothing to show. */
export function formatTableStakesLine(
  smallBlindCents?: number,
  bigBlindCents?: number,
  minBuyInCents?: number,
): string | null {
  const hasBlinds =
    smallBlindCents != null && bigBlindCents != null && smallBlindCents > 0 && bigBlindCents > 0;
  const hasMin = minBuyInCents != null && minBuyInCents > 0;
  if (!hasBlinds && !hasMin) return null;
  const blinds = hasBlinds ? `Blinds ${formatCents(smallBlindCents)} | ${formatCents(bigBlindCents)}` : "";
  const min = hasMin ? `Min ${formatCents(minBuyInCents)}` : "";
  return [blinds, min].filter(Boolean).join("  ·  ");
}
