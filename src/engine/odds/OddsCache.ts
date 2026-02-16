/**
 * Tiny in-memory cache for equity results.
 * - Safe for a single process Colyseus room (POC).
 * - Keyed by a deterministic string that includes hole cards + board.
 */
export class OddsCache<T> {
  private map = new Map<string, T>();

  constructor(private readonly maxEntries: number = 200) {}

  get(key: string): T | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    // refresh LRU
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: T) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);

    if (this.map.size > this.maxEntries) {
      // delete oldest
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest) this.map.delete(oldest);
    }
  }

  clear() {
    this.map.clear();
  }
}
