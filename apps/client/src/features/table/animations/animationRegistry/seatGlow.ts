import type { TableAnimationDefinition, TableAnimationRequest } from "../animationTypes";
import { FX_ANCHOR, FX_CHANNEL, FX_EVENT } from "../animationTypes";
import { CHOREO_RING_MS } from "../animationConstants";

/** Seat-area glow for e.g. SHOWDOWN winner (companion to TABLE). Runs on SEAT channel. */
export const SEAT_GLOW_SHOWDOWN: TableAnimationDefinition = {
  id: "SEAT_GLOW_SHOWDOWN",
  event: FX_EVENT.SHOWDOWN,
  tier: 2,
  channel: FX_CHANNEL.SEAT,
  anchor: FX_ANCHOR.SEAT,
  durationMs: 900,
  layers: [{ type: "SEAT_GLOW", durationMs: 700, delayMs: CHOREO_RING_MS }],
};

export function getSeatGlowDefinition(
  event: TableAnimationRequest["event"],
  payload?: TableAnimationRequest["payload"]
): TableAnimationDefinition | undefined {
  if (event !== FX_EVENT.SHOWDOWN || payload?.anchorSeat == null) return undefined;
  return SEAT_GLOW_SHOWDOWN;
}
