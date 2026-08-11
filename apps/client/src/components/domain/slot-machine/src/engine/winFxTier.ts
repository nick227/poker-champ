export type WinFxTier = "small" | "big" | "mega" | "jackpot";

export type WinFxScale = {
  holdMs: number;
  peak: number;
  coinCount: number;
  showRays: boolean;
  rayCount: number;
};

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

/**
 * Background FX scale from win multiplier.
 * Length and particle count grow aggressively with value so even 1–2x hits feel visible.
 */
export function scaleWinFx(winMultiplier: number, isJackpot = false): WinFxScale {
  const m = Math.max(1, winMultiplier);
  const holdMs = Math.min(10_000, Math.round(500 + m * 90 + Math.pow(m, 1.2) * 14));
  const peak = Math.min(1, 0.42 + Math.log10(m + 1) * 0.5);
  const coinCount = Math.min(48, Math.max(5, Math.round(4 + m * 1.1)));
  const showRays = isJackpot || m >= 2;
  const rayCount = Math.min(14, Math.max(4, Math.round(4 + m / 6)));
  return { holdMs, peak, coinCount, showRays, rayCount };
}
