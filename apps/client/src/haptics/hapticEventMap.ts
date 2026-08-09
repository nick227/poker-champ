import type { HapticEvent } from "./hapticEvents";

/**
 * The finite set of physical feedback patterns `expo-haptics` exposes.
 * Unlike sound, haptics don't need an asset registry — there's nothing to
 * preload — so events map straight to a pattern instead of through a
 * separate "key" indirection.
 */
export type HapticPattern =
  | { kind: "impact"; style: "Light" | "Medium" | "Heavy" }
  | { kind: "notification"; type: "Success" | "Warning" | "Error" }
  | { kind: "selection" };

/**
 * Event -> pattern mapping. Intensity is chosen to match the moment:
 *  - light impact   : routine, low-stakes actions (check / call)
 *  - medium impact   : the player committing chips (bet / raise)
 *  - heavy impact   : all-in — the single highest-stakes button press
 *  - selection      : frequent, low-drama table beats (card deal)
 *  - success notif. : hero wins a pot / places in the money
 *  - warning notif. : fold, elimination, and the turn-timeout nudge
 */
export const HAPTIC_EVENT_MAP: Record<HapticEvent, HapticPattern> = {
  "table.action.fold": { kind: "notification", type: "Warning" },
  "table.action.check": { kind: "impact", style: "Light" },
  "table.action.call": { kind: "impact", style: "Light" },
  "table.action.bet": { kind: "impact", style: "Medium" },
  "table.action.raise": { kind: "impact", style: "Medium" },
  "table.action.allIn": { kind: "impact", style: "Heavy" },
  "table.cardDeal": { kind: "selection" },
  "table.potWin": { kind: "notification", type: "Success" },
  "table.turnTimeoutWarning": { kind: "notification", type: "Warning" },
  "tournament.itmWin": { kind: "notification", type: "Success" },
  "tournament.eliminated": { kind: "notification", type: "Warning" },
};
