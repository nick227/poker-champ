import { AnimationLayerSeatGlow } from "./layers";
import { getAnimationTheme } from "./animationTheme";

const POT_WIN_SEAT_GLOW_DURATION_MS = 900;

export type WinningSeatPulseProps = {
  /** Match the wrapped tile's own corner radius (e.g. a square hero zone uses 0). */
  borderRadius: number;
};

/**
 * "This seat just won the pot" pulse, shown directly on an opponent tile or the hero zone —
 * player-tile-local, not a table-overlay FX (those anchor via measured AnchorBounds, which a
 * per-tile win indicator doesn't need). Reuses the canonical POT_WIN theme color and the same
 * AnimationLayerSeatGlow primitive the FX registry's own seat-glow companion renders, so there
 * is exactly one definition of what a "winning seat" looks like, not a second hand-rolled ring.
 */
export function WinningSeatPulse({ borderRadius }: WinningSeatPulseProps) {
  return (
    <AnimationLayerSeatGlow
      durationMs={POT_WIN_SEAT_GLOW_DURATION_MS}
      color={getAnimationTheme("POT_WIN").palette.ring}
      borderRadius={borderRadius}
    />
  );
}
