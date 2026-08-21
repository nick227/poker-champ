import { request } from "@poker-champ/sdk";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { DEFAULT_HISTORY_LIMIT } from "@/constants";
import { withApiError } from "./_helpers/withApiError";
import type { ServiceResult } from "./_helpers/serviceTypes";

// Types for hand history API responses
export interface HandHistoryListItem {
  id: string;
  playedAt: Date;
  tableName: string;
  netResultCents: number;
  bigBlindCents: number;
  heroWonCents: number;
  heroActionSummary?: string;
  hasReplay?: boolean;
  boardCards: string[];
  heroCards: string[];
  totalPotCents: number;
  winners: Array<{
    userId?: string | null;
    displayName?: string | null;
    amountCents: number;
  }>;
  reason: string | null;
}

export interface HandHistoryDetail {
  id: string;
  snapshots: TableSnapshotPayload[]; // HAND REPLAY: Add snapshots field
  boardCards: string[];
  bigBlindCents: number;
  reason: string | null;
  players: Array<{
    userId: string;
    displayName: string;
    seat: number;
    holeCards?: string[];
    finalStack: number;
  }>;
  actions: Array<{
    street: string;
    actorUserId: string;
    actorDisplayName: string;
    action: string;
    amountCents: number;
  }>;
  payouts: Array<{
    userId: string;
    displayName: string;
    amountCents: number;
  }>;
}

export interface HandsResponse {
  hands: HandHistoryListItem[];
  nextCursor: string | null;
}

export interface HistoryOverview {
  totalHands: number;
  totalProfitCents: number;
  winningHands: number;
  losingHands: number;
  breakEvenHands: number;
  winRate: number;
  avgProfitPerHandCents: number;
  bbPer100: number;
  avgPotCents: number;
  biggestPotCents: number;
  biggestWinCents: number;
  biggestLossCents: number;
  showdownHands: number;
  showdownRate: number;
  vpipHands: number;
  vpipPct: number;
  pfrHands: number;
  pfrPct: number;
  threeBetHands: number;
  threeBetOpportunities: number;
  threeBetPct: number;
  foldToThreeBetHands: number;
  foldToThreeBetOpportunities: number;
  foldToThreeBetPct: number;
  stealAttempts: number;
  stealOpportunities: number;
  stealAttemptPct: number;
  foldBbToStealHands: number;
  foldBbToStealOpportunities: number;
  foldBbToStealPct: number;
  grossWonCents: number;
  grossLostCents: number;
  profitFactor: number | null;
}

export interface HistoryService {
  getOverview: (input: { token: string }) => Promise<ServiceResult<HistoryOverview>>;
  getHands: (input: { token: string; cursor?: string; limit?: number }) => Promise<ServiceResult<HandsResponse>>;
  getHandDetail: (input: { token: string; handId: string }) => Promise<ServiceResult<HandHistoryDetail>>;
}

class HistoryServiceImpl implements HistoryService {
  async getOverview(input: { token: string }): Promise<ServiceResult<HistoryOverview>> {
    return withApiError(() =>
      request<HistoryOverview>("GET", "/api/history/overview", undefined, {
        token: input.token,
      }),
    );
  }

  async getHands(input: { token: string; cursor?: string; limit?: number }): Promise<ServiceResult<HandsResponse>> {
    return withApiError(async () => {
      const data = await request<{
        hands?: Array<Omit<HandHistoryListItem, "playedAt"> & { playedAt: string }>;
        nextCursor?: string | null;
      }>("GET", "/api/history/hands", undefined, {
        token: input.token,
        query: {
          cursor: input.cursor,
          limit: input.limit ?? DEFAULT_HISTORY_LIMIT,
          _t: Date.now(),
        },
      });

      const rawHands = Array.isArray(data.hands) ? data.hands : [];
      if (!Array.isArray(data.hands) && data.hands != null) {
        console.warn("[history] getHands: unexpected response shape, hands not an array", data);
      }

      const hands = rawHands.map((hand) => ({
        ...hand,
        playedAt: new Date(hand.playedAt),
      }));

      return { hands, nextCursor: data.nextCursor ?? null };
    });
  }

  async getHandDetail(input: { token: string; handId: string }): Promise<ServiceResult<HandHistoryDetail>> {
    return withApiError(() =>
      request<HandHistoryDetail>("GET", `/api/history/hands/${encodeURIComponent(input.handId)}`, undefined, {
        token: input.token,
      }),
    );
  }
}

// Singleton instance
export const historyService = new HistoryServiceImpl();
