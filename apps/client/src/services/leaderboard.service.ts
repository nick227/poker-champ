import { request } from "@poker-champ/sdk";

export type LeaderboardPeriod = "daily" | "weekly" | "all_time";
export type LeaderboardCategory =
  | "biggest_winner"
  | "biggest_donor"
  | "showdown_sniper"
  | "all_in_maniac"
  | "ice_cold"
  | "heater"
  | "tight_rock"
  | "action_junkie";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  displayName: string;
  value: string;
  valueNumerator: number;
  valueDenominator: number | null;
  handCount: number;
};

export type LeaderboardResponse = {
  period: LeaderboardPeriod;
  category: LeaderboardCategory;
  computedAt: string | null;
  totalEntries: number;
  entries: LeaderboardEntry[];
};

class LeaderboardService {
  async getLeaderboard(input: {
    token: string;
    period?: LeaderboardPeriod;
    category: LeaderboardCategory;
    limit?: number;
  }): Promise<LeaderboardResponse> {
    return request<LeaderboardResponse>("GET", "/api/leaderboard", undefined, {
      token: input.token,
      query: {
        period: input.period ?? "weekly",
        category: input.category,
        limit: input.limit ?? 20,
      },
    });
  }
}

export const leaderboardService = new LeaderboardService();
