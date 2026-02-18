import { request } from "@poker-champ/sdk";

// Types for hand history API responses
export interface HandHistoryListItem {
  id: string;
  playedAt: Date;
  tableName: string;
  netResultCents: number;
  bigBlindCents: number;
  potCents: number;
  heroActionSummary?: string;
}

export interface HandHistoryDetail {
  id: string;
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

export interface HistoryService {
  getHands: (input: { token: string; cursor?: string; limit?: number }) => Promise<HandsResponse>;
  getHandDetail: (input: { token: string; handId: string }) => Promise<HandHistoryDetail>;
}

class HistoryServiceImpl implements HistoryService {
  async getHands(input: { token: string; cursor?: string; limit?: number }): Promise<HandsResponse> {
    const data = await request<{
      hands: Array<Omit<HandHistoryListItem, "playedAt"> & { playedAt: string }>;
      nextCursor: string | null;
    }>("GET", "/api/history/hands", undefined, {
      token: input.token,
      query: {
        cursor: input.cursor,
        limit: input.limit ?? 50,
      },
    });

    // Convert date strings to Date objects
    const hands = data.hands.map((hand) => ({
      ...hand,
      playedAt: new Date(hand.playedAt),
    }));

    return {
      hands,
      nextCursor: data.nextCursor,
    };
  }

  async getHandDetail(input: { token: string; handId: string }): Promise<HandHistoryDetail> {
    return request<HandHistoryDetail>("GET", `/api/history/hands/${encodeURIComponent(input.handId)}`, undefined, {
      token: input.token,
    });
  }
}

// Singleton instance
export const historyService = new HistoryServiceImpl();
