import { useMemo, useState } from "react";
export type BetTier = "HALF" | "FULL" | "DOUBLE";
export function useBetTier(baseBetCents: number) {
  const [tier, setTier] = useState<BetTier>("FULL");
  const betCents = useMemo(() => {
    const mult = tier === "HALF" ? 0.5 : tier === "DOUBLE" ? 2 : 1;
    return Math.max(1, Math.round(baseBetCents * mult));
  }, [baseBetCents, tier]);
  return { tier, setTier, betCents };
}
