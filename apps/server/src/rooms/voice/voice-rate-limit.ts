/**
 * create -> voice rate limiter
 * Token bucket per sessionId to protect server CPU.
 *
 * Defaults:
 * - refillRate: 20 tokens/sec
 * - burst: 40
 *
 * Each VOICE_SIGNAL costs 1 token.
 */
export function createVoiceRateLimiter(params?: {
  refillRatePerSec?: number;
  burst?: number;
}) {
  const refillRate = params?.refillRatePerSec ?? 20;
  const burst = params?.burst ?? 40;

  const buckets = new Map<string, { tokens: number; lastTs: number }>();

  function allow(key: string): boolean {
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: burst, lastTs: now };
    const elapsedSec = Math.max(0, (now - b.lastTs) / 1000);
    b.tokens = Math.min(burst, b.tokens + elapsedSec * refillRate);
    b.lastTs = now;

    if (b.tokens < 1) {
      buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
  }

  return { allow };
}
