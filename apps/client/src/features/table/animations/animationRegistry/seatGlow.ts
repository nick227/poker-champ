import type { TableAnimationDefinition, TableAnimationRequest } from "../animationTypes";
import { FX_ANCHOR, FX_CHANNEL, FX_EVENT } from "../animationTypes";
import { CHOREO_RING_MS } from "../animationConstants";

/** Seat-area glow for the SHOWDOWN winner (companion to TABLE). Runs on SEAT channel. */
export const SEAT_GLOW_SHOWDOWN: TableAnimationDefinition = {
  id: "SEAT_GLOW_SHOWDOWN",
  event: FX_EVENT.SHOWDOWN,
  tier: 2,
  channel: FX_CHANNEL.SEAT,
  anchor: FX_ANCHOR.SEAT,
  durationMs: 900,
  layers: [{ type: "SEAT_GLOW", durationMs: 700, delayMs: CHOREO_RING_MS }],
};

/** "This seat just won the pot" pulse — the winning-seat-pulse migrated onto the request/channel
 *  system (formerly WinningSeatPulse, rendered inline in SeatPlate.tsx off a local isWinner prop).
 *  Fires for every winner reveal regardless of how the hand ended (fold-out or showdown, hero or
 *  opponent) — see resolveWinnerRevealAnimationDecision in animationTriggers.ts for the exact
 *  gating/delay, which is preserved unchanged from the pre-migration behavior. Same duration and
 *  color (POT_WIN's ring, via the WINNER_REVEAL palette override) as the original. */
export const SEAT_GLOW_WINNER_REVEAL: TableAnimationDefinition = {
  id: "SEAT_GLOW_WINNER_REVEAL",
  event: FX_EVENT.WINNER_REVEAL,
  tier: 0,
  channel: FX_CHANNEL.SEAT,
  anchor: FX_ANCHOR.SEAT,
  durationMs: 900,
  layers: [{ type: "SEAT_GLOW", durationMs: 900 }],
};

export function getSeatGlowDefinition(
  event: TableAnimationRequest["event"],
  payload?: TableAnimationRequest["payload"]
): TableAnimationDefinition | undefined {
  if (payload?.anchorSeat == null) return undefined;
  if (event === FX_EVENT.SHOWDOWN) return SEAT_GLOW_SHOWDOWN;
  if (event === FX_EVENT.WINNER_REVEAL) return SEAT_GLOW_WINNER_REVEAL;
  return undefined;
}
