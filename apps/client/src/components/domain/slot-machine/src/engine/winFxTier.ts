export type WinFxTier = "small" | "big" | "mega" | "jackpot";

/** Industry-style named presentation gates for Classic3-scale payouts. */
export function resolveWinFxTier(isJackpot: boolean, winMultiplier: number): WinFxTier {
  if (isJackpot) return "jackpot";
  if (winMultiplier >= 25) return "mega";
  if (winMultiplier >= 10) return "big";
  return "small";
}

export function winFxLabel(tier: WinFxTier): string | null {
  if (tier === "big") return "BIG WIN";
  if (tier === "mega") return "MEGA WIN";
  if (tier === "jackpot") return "JACKPOT";
  return null;
}

export function winFxHasPresentation(tier: WinFxTier): boolean {
  return tier !== "small";
}
