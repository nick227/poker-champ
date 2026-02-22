import { OddsCache } from "./OddsCache.js";
import { calcMultiwayEquity, makeEquityCacheKey } from "./OddsService.js";

type Equity = { equitiesPct: number[] };

/**
 * Coordinates equity computation with:
 * - LRU cache
 * - in-flight de-duplication (same key)
 * - basic throttle (same key within a short window)
 *
 * Important: This is a per-room helper. Instantiate once in Dealer.
 */
export class OddsCoordinator {
  private cache = new OddsCache<Equity>(50);
  private inFlight = new Map<string, Promise<Equity>>();
  private lastComputedAt = new Map<string, number>();

  constructor(private readonly throttleMs: number = 200) {}

  clear() {
    this.cache.clear();
    this.inFlight.clear();
    this.lastComputedAt.clear();
  }

  /**
   * Compute or return cached equity for a given game snapshot.
   * Players should include ALL eligible (non-folded) players with hole cards.
   * The returned equities correspond to the players array order.
   */
  async getEquity(params: {
    handId: string;
    street: string;
    board: string[];
    players: { id: string; cards: string[] }[];
  }): Promise<{ key: string; equity: Equity }> {
    const { handId, street, board, players } = params;
    const key = makeEquityCacheKey(handId, street, board, players);

    const cached = this.cache.get(key);
    if (cached) return { key, equity: cached };

    const now = Date.now();
    const last = this.lastComputedAt.get(key) ?? 0;

    // If we've computed very recently (rare here), don't start another compute—use inFlight if present.
    const existing = this.inFlight.get(key);
    if (existing) {
      const eq = await existing;
      return { key, equity: eq };
    }

    // Throttle guard: still compute if not cached, but avoids rapid duplicate triggers
    if (now - last < this.throttleMs) {
      // Another call likely just computed; re-check cache once.
      const recheck = this.cache.get(key);
      if (recheck) return { key, equity: recheck };
    }

    const promise = (async () => {
      const hands = players.map(p => p.cards);
      const equity = calcMultiwayEquity(hands, board);
      this.cache.set(key, equity);
      this.lastComputedAt.set(key, Date.now());
      return equity;
    })();

    this.inFlight.set(key, promise);

    try {
      const eq = await promise;
      return { key, equity: eq };
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Synchronous variant used by snapshot-time compute paths.
   * Keeps the same cache keying and cache reuse behavior.
   */
  getEquitySync(params: {
    handId: string;
    street: string;
    board: string[];
    players: { id: string; cards: string[] }[];
  }): { key: string; equity: Equity } {
    const { handId, street, board, players } = params;
    const key = makeEquityCacheKey(handId, street, board, players);

    const cached = this.cache.get(key);
    if (cached) return { key, equity: cached };

    const hands = players.map((p) => p.cards);
    const equity = calcMultiwayEquity(hands, board);
    this.cache.set(key, equity);
    this.lastComputedAt.set(key, Date.now());
    return { key, equity };
  }
}
