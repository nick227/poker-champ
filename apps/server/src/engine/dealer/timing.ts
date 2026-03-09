export const RUNOUT_STAGE_DELAY_MS = 1000;
export const HAND_RESULT_HOLD_MS = 2500;
export const NEXT_HAND_DELAY_MS = 0;

// Bot \"thinking\" delay configuration (milliseconds)
export const BOT_ACTION_DELAY_MIN_MS = 0;
export const BOT_ACTION_DELAY_MAX_MS = 1000;

// Human turn timeout configuration (milliseconds)
// TURN_TIMEOUT_TOTAL_MS: total time before the server auto-sits-out the actor.
export const TURN_TIMEOUT_TOTAL_MS = 20 * 60_000;

// Default reconnect grace when a disconnected human is created without an explicit deadline
// (e.g. restore from session). Ensures auto-action cap and disconnect sweep never treat them
// as "past grace" immediately. Must be >= TURN_TIMEOUT_TOTAL_MS for consistent behavior.
export const RECONNECT_GRACE_DEFAULT_MS = 20 * 60_000;
