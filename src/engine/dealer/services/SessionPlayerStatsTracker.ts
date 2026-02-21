import type { HeroPlayerStats } from "@poker-champ/realtime-contract";

type PerUser = { handsDealt: number; vpipHands: number; pfrHands: number };

/** One decimal, no NaN; use for stable UI. */
function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

/**
 * In-memory session-scoped VPIP/PFR (and future stats). Updated only at hand end; no DB.
 */
export class SessionPlayerStatsTracker {
  private readonly byUserId = new Map<string, PerUser>();

  recordHandForUser(
    userId: string,
    params: { dealtIn: boolean; vpip: boolean; pfr: boolean },
  ): void {
    if (!params.dealtIn) return;
    const cur = this.byUserId.get(userId) ?? {
      handsDealt: 0,
      vpipHands: 0,
      pfrHands: 0,
    };
    cur.handsDealt += 1;
    if (params.vpip) cur.vpipHands += 1;
    if (params.pfr) cur.pfrHands += 1;
    this.byUserId.set(userId, cur);
  }

  get(userId: string): HeroPlayerStats | undefined {
    const cur = this.byUserId.get(userId);
    if (!cur || cur.handsDealt === 0) return undefined;
    return {
      hands: cur.handsDealt,
      vpipPct: pct(cur.vpipHands, cur.handsDealt),
      pfrPct: pct(cur.pfrHands, cur.handsDealt),
    };
  }

  resetAll(): void {
    this.byUserId.clear();
  }

  resetUser(userId: string): void {
    this.byUserId.delete(userId);
  }
}
