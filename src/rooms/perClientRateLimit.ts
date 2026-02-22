/**
 * Per-client sliding-window rate limiter for WebSocket messages.
 * Used to drop ACTION/CHAT floods before enqueue.
 */
type Bucket = { count: number; resetAt: number };

export function createPerClientRateLimiter(options: {
  maxPerWindow: number;
  windowMs: number;
}) {
  const buckets = new Map<string, Bucket>();

  function sweep(now: number) {
    for (const [key, b] of buckets.entries()) {
      if (now > b.resetAt) buckets.delete(key);
    }
  }

  return {
    check(clientId: string): boolean {
      const now = Date.now();
      sweep(now); // TTL: remove stale buckets so map stays bounded
      const b = buckets.get(clientId);
      if (!b || now > b.resetAt) {
        buckets.set(clientId, { count: 1, resetAt: now + options.windowMs });
        return true;
      }
      if (b.count >= options.maxPerWindow) return false;
      b.count++;
      return true;
    },
  };
}
