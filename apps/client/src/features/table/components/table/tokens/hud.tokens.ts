/**
 * HUD visual tokens: gradient/border treatments for the top info bar, the ALL-IN
 * status banner, and the primary action buttons (Fold / Check-Call / Bet-Raise / All-In).
 *
 * New file (not editing existing tokens/*.ts or the shared surfaceRegistry/tailwind
 * config) so parallel agents editing board-area/table-layout and
 * player-panel/opponent-strip/opponent-item/hero-zone don't collide with this work.
 *
 * Values are Tailwind/NativeWind utility class strings built from the app's existing
 * color tokens (danger/success/gold/warn/panel-elevated/panel in tailwind.config.cjs),
 * not new raw colors — this keeps the HUD visually consistent with the rest of the app.
 */

export type PokerActionVariant = "fold" | "checkCall" | "betRaise" | "allIn";

/** Bold, color-coded gradient fill per action — red=fold, green=check/call, gold=bet/raise, red/orange=all-in. */
export const HUD_ACTION_GRADIENT: Record<PokerActionVariant, string> = {
  fold: "bg-gradient-to-b from-danger to-danger/75",
  checkCall: "bg-gradient-to-b from-success to-success/75",
  betRaise: "bg-gradient-to-b from-gold to-warn",
  allIn: "bg-gradient-to-b from-warn to-danger",
};

/** Matching border accent per action, used for depth/definition against the felt. */
export const HUD_ACTION_BORDER: Record<PokerActionVariant, string> = {
  fold: "border border-danger/50",
  checkCall: "border border-success/50",
  betRaise: "border border-gold/60",
  allIn: "border border-danger/60",
};

/** Same red/orange treatment as the all-in action button, reused by the ALL-IN status banner. */
export const HUD_ALL_IN_GRADIENT = HUD_ACTION_GRADIENT.allIn;
export const HUD_ALL_IN_BORDER = HUD_ACTION_BORDER.allIn;

/** Subtle vertical shading for the top info bar — distinct from the flat ancestor background
 * without touching the shared surfaceRegistry entry (also used by the lobby masthead). */
export const HUD_TOPBAR_GRADIENT = "bg-gradient-to-b from-panel-elevated to-panel";
