import { randomUUID } from "node:crypto";
import type { HeroPlayerStats } from "@poker-champ/realtime-contract";

type PerUser = {
  /** Unique per user per "session"; set when user first gets a hand (rejoins get new id). */
  sessionId: string;
  handsDealt: number;
  vpipHands: number;
  pfrHands: number;
  consecutiveWins: number;
};

/** One decimal, no NaN; use for stable UI. */
function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

/**
 * In-memory session-scoped VPIP/PFR and win streak. Updated only at hand end; no DB.
 */
export class SessionPlayerStatsTracker {
  private readonly byUserId = new Map<string, PerUser>();

  recordHandForUser(
    userId: string,
    params: { dealtIn: boolean; vpip: boolean; pfr: boolean },
  ): void {
    if (!params.dealtIn) return;
    const cur = this.byUserId.get(userId) ?? {
      sessionId: randomUUID(),
      handsDealt: 0,
      vpipHands: 0,
      pfrHands: 0,
      consecutiveWins: 0,
    };
    cur.handsDealt += 1;
    if (params.vpip) cur.vpipHands += 1;
    if (params.pfr) cur.pfrHands += 1;
    this.byUserId.set(userId, cur);
  }

  /** Call at hand end for each dealt user; updates consecutive win streak. */
  recordHandResult(userId: string, won: boolean): void {
    const cur = this.byUserId.get(userId);
    if (!cur) return;
    if (won) cur.consecutiveWins += 1;
    else cur.consecutiveWins = 0;
  }

  getSessionHands(userId: string): number {
    return this.byUserId.get(userId)?.handsDealt ?? 0;
  }

  getConsecutiveWins(userId: string): number {
    return this.byUserId.get(userId)?.consecutiveWins ?? 0;
  }

  /** Session identity for award triggerKeys; new id when user (re)joins (resetUser clears). */
  getSessionId(userId: string): string {
    return this.byUserId.get(userId)?.sessionId ?? "";
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
