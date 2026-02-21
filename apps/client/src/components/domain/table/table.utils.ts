/** True if any hero calculation value is present (equity, pot odds, outs). */
export function hasHeroCalculations(
  calc: { equity?: number; potOdds?: number; outs?: number } | undefined
): boolean {
  if (!calc) return false;
  return (
    typeof calc.equity === "number" ||
    typeof calc.potOdds === "number" ||
    typeof calc.outs === "number"
  );
}
