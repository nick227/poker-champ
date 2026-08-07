/**
 * Application-wide constants
 */

// API defaults
export const DEFAULT_API_URL = "http://localhost:3000";

// Realtime connection
/** Base delay (ms) for exponential backoff reconnect attempts, before jitter is applied. */
export const RECONNECT_BASE_DELAY_MS = 1000;
/** Hard cap (ms) on reconnect backoff delay, even after many attempts. Seconds, not minutes. */
export const RECONNECT_MAX_DELAY_MS = 15000;
export const MAX_RECONNECT_ATTEMPTS = 3;
/** Cap reconnect retries even when a Colyseus token exists (prevents infinite loops on dead rooms). */
export const MAX_RECONNECT_ATTEMPTS_WITH_TOKEN = 12;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_HISTORY_LIMIT = 50;

// Sound preloading
export const PRELOAD_SOUNDS = ["tap", "modalOpen", "check", "call", "bet", "cardDeal"] as const;
