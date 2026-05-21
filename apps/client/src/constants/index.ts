/**
 * Application-wide constants
 */

// API defaults
export const DEFAULT_API_URL = "http://localhost:3000";

// Realtime connection
export const RECONNECT_DELAY_MS = 2000;
export const MAX_RECONNECT_ATTEMPTS = 3;
/** Cap reconnect retries even when a Colyseus token exists (prevents infinite loops on dead rooms). */
export const MAX_RECONNECT_ATTEMPTS_WITH_TOKEN = 12;

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_HISTORY_LIMIT = 50;

// Sound preloading
export const PRELOAD_SOUNDS = ["tap", "modalOpen", "check", "call", "bet", "cardDeal"] as const;
