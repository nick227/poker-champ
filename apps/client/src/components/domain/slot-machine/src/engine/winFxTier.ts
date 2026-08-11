export type WinFxTier = "small" | "big" | "mega" | "jackpot";

/** Full-screen background FX mode behind the cabinet. */
export type ScreenFxMode = "glow" | "shower" | "pandemonium";

export type WinFxScale = {
  mode: ScreenFxMode;
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
 * Screen FX scale from win multiplier.
 * Small = glow only; real wins = full-screen shower for seconds; jackpot = pandemonium.
 */
export function scaleWinFx(winMultiplier: number, isJackpot = false): WinFxScale {
  const m = Math.max(1, winMultiplier);

  if (isJackpot) {
    return {
      mode: "pandemonium",
      holdMs: Math.min(14_000, Math.round(7000 + m * 18)),
      peak: 1,
      coinCount: 110,
      showRays: true,
      rayCount: 18,
    };
  }

  if (m >= 10) {
    // Big / mega shower — fills the screen for several seconds
    const mega = m >= 25;
    return {
      mode: "shower",
      holdMs: Math.min(10_000, Math.round((mega ? 4200 : 2800) + m * 85)),
      peak: Math.min(1, mega ? 0.95 : 0.75),
      coinCount: Math.min(96, Math.round((mega ? 36 : 22) + m * 1.6)),
      showRays: true,
      rayCount: Math.min(16, Math.round(mega ? 12 : 8) + Math.floor(m / 20)),
    };
  }

  // Small wins — soft full-screen glow only
  return {
    mode: "glow",
    holdMs: Math.min(2200, Math.round(700 + m * 180)),
    peak: Math.min(0.7, 0.35 + m * 0.06),
    coinCount: 0,
    showRays: false,
    rayCount: 0,
  };
}
