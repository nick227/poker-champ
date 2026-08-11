export type WinFxTier = "small" | "big" | "mega" | "jackpot";

/** Full-screen background FX mode behind the cabinet. */
export type ScreenFxMode = "glow" | "shower" | "pandemonium";

export type WinFxScale = {
  mode: ScreenFxMode;
  holdMs: number;
  peak: number;
  coinCount: number;
  sparkCount: number;
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
 * Screen FX scale — arcade-loud, not subtle web washes.
 * Small = hard glow blast; real wins = screen-filling shower; jackpot = pandemonium.
 */
export function scaleWinFx(winMultiplier: number, isJackpot = false): WinFxScale {
  const m = Math.max(1, winMultiplier);

  if (isJackpot) {
    return {
      mode: "pandemonium",
      holdMs: Math.min(16_000, Math.round(8000 + m * 22)),
      peak: 1,
      coinCount: 140,
      sparkCount: 48,
      showRays: true,
      rayCount: 24,
    };
  }

  if (m >= 10) {
    const mega = m >= 25;
    return {
      mode: "shower",
      holdMs: Math.min(12_000, Math.round((mega ? 5000 : 3400) + m * 110)),
      peak: 1,
      coinCount: Math.min(120, Math.round((mega ? 48 : 32) + m * 2.2)),
      sparkCount: Math.min(40, Math.round((mega ? 22 : 14) + m * 0.6)),
      showRays: true,
      rayCount: Math.min(20, Math.round((mega ? 14 : 10) + m / 12)),
    };
  }

  return {
    mode: "glow",
    holdMs: Math.min(2800, Math.round(900 + m * 220)),
    peak: Math.min(1, 0.65 + m * 0.08),
    coinCount: Math.min(18, Math.round(6 + m * 2)),
    sparkCount: Math.min(16, Math.round(4 + m * 2)),
    showRays: m >= 3,
    rayCount: m >= 3 ? 8 : 0,
  };
}
