const DEFAULT_RUNOUT_STAGE_DELAY_MS = 1000;
/** How long the completed board/result stays live before scheduling the next hand. */
const DEFAULT_HAND_RESULT_HOLD_MS = 4500;
export const NEXT_HAND_DELAY_MS = 0;

function readEnvMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readEnvMsAllowZero(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

/** Lazy so tests can override via env before first use (e.g. soak test). */
export function getRunoutStageDelayMs(): number {
  return readEnvMsAllowZero("RUNOUT_STAGE_DELAY_MS", DEFAULT_RUNOUT_STAGE_DELAY_MS);
}

/** Lazy so tests can override via env before first use (e.g. soak test). */
export function getHandResultHoldMs(): number {
  return readEnvMsAllowZero("HAND_RESULT_HOLD_MS", DEFAULT_HAND_RESULT_HOLD_MS);
}

// Bot \"thinking\" delay configuration (milliseconds)
export const BOT_ACTION_DELAY_MIN_MS = readEnvMs("BOT_ACTION_DELAY_MIN_MS", 0);
export const BOT_ACTION_DELAY_MAX_MS = readEnvMs("BOT_ACTION_DELAY_MAX_MS", 1000);

// Human turn timeout configuration (milliseconds)
// TURN_TIMEOUT_TOTAL_MS: total time before the server auto-sits-out the actor. Min 20 min outside tests.
const DEFAULT_TURN_TIMEOUT_MS = 20 * 60_000;
const raw = readEnvMs("TURN_TIMEOUT_TOTAL_MS", DEFAULT_TURN_TIMEOUT_MS);
export const TURN_TIMEOUT_TOTAL_MS =
  process.env.NODE_ENV === "test" ? raw : Math.max(raw, DEFAULT_TURN_TIMEOUT_MS);

// Default reconnect grace when a disconnected human is created without an explicit deadline
// (e.g. restore from session). Ensures auto-action cap and disconnect sweep never treat them
// as "past grace" immediately. Must be >= TURN_TIMEOUT_TOTAL_MS for consistent behavior.
export const RECONNECT_GRACE_DEFAULT_MS = 20 * 60_000;
