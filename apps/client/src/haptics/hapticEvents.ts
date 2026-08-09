/**
 * Semantic haptic events. Mirrors the shape of `@/sound/soundEvents.ts` so the
 * two feedback layers stay easy to reason about together at call-sites, even
 * though haptics intentionally cover a smaller, higher-signal set of moments
 * than sound does (see docs/proposals/SOUND_FX_INTEGRATION_STATUS_AND_PROPOSAL.md
 * for the sound call-site inventory this was modeled on).
 */
export type HapticEvent =
  | "table.action.fold"
  | "table.action.check"
  | "table.action.call"
  | "table.action.bet"
  | "table.action.raise"
  | "table.action.allIn"
  | "table.cardDeal"
  | "table.potWin"
  | "table.turnTimeoutWarning"
  | "tournament.itmWin"
  | "tournament.eliminated";

/**
 * Per-event cooldown, mirroring SOUND_EVENT_COOLDOWN_MS. Keeps rapid-fire
 * game-state churn (e.g. a burst of board-reveal deltas) from turning into
 * haptic spam, independent of the pattern-level cooldown in `@/lib/haptics`.
 */
export const HAPTIC_EVENT_COOLDOWN_MS: Partial<Record<HapticEvent, number>> = {
  "table.action.fold": 120,
  "table.action.check": 100,
  "table.action.call": 100,
  "table.action.bet": 100,
  "table.action.raise": 120,
  "table.action.allIn": 180,
  "table.cardDeal": 40,
  "table.potWin": 200,
  "table.turnTimeoutWarning": 500,
  "tournament.itmWin": 500,
  "tournament.eliminated": 500,
};
