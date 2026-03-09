import { awardCatalog, resolveReason } from "./awardCatalog.js";
import type { GrantCandidate } from "./types.js";

/** Data for one hand at end; same for all users. bigBlindCents from table state. */
export type HandSummary = {
  handId: string;
  reason: "LAST_PLAYER" | "SHOWDOWN" | "DEFENSIVE_FALLBACK";
  potCents: number;
  bigBlindCents: number;
  payoutsByUserId: Record<string, number>;
  winnerId?: string;
  allInPlayerIds: string[];
};

/** Per-user session state for award evaluation. sessionId (e.g. tableId) scopes REPEATABLE session milestones. */
export type HandAwardSessionState = {
  sessionId: string;
  sessionHands: number;
  consecutiveWins: number;
};

/**
 * Pure: returns candidates for bulkGrant. Does not touch DB.
 * Caller must pass earnedAwardIds (UserAward) and lifetimeHands (UserHandCount after increment).
 */
export function evaluateHandAwards(
  handSummary: HandSummary,
  userId: string,
  sessionState: HandAwardSessionState,
  earnedAwardIds: Set<string>,
  lifetimeHands: number
): GrantCandidate[] {
  const { handId, reason, potCents, bigBlindCents, payoutsByUserId, allInPlayerIds } = handSummary;
  const { sessionId, sessionHands, consecutiveWins } = sessionState;
  const won = (payoutsByUserId[userId] ?? 0) > 0;
  const wentToShowdown = reason === "SHOWDOWN";
  const wasAllIn = allInPlayerIds.includes(userId);
  const bigPotWin = won && bigBlindCents > 0 && potCents >= 50 * bigBlindCents;

  const candidates: GrantCandidate[] = [];

  const add = (awardId: string, triggerKey?: string) => {
    const entry = awardCatalog.getById(awardId);
    const reasonStr = entry ? resolveReason(entry.reasonTemplate, {}) : "";
    candidates.push({
      awardId,
      reason: reasonStr,
      contextType: "HAND",
      contextId: handId,
      ...(triggerKey && { triggerKey }),
    });
  };

  if (!earnedAwardIds.has("first_hand_played")) add("first_hand_played");
  if (won && !earnedAwardIds.has("first_win")) add("first_win");

  const sessionMilestones = [
    [10, "hands_10"],
    [50, "hands_50"],
    [100, "hands_100"],
  ] as const;
  for (const [threshold, awardId] of sessionMilestones) {
    if (sessionHands >= threshold) add(awardId, `session_${sessionId}_${threshold}`);
  }

  const lifeMilestones = [
    [100, "hands_100_life"],
    [500, "hands_500_life"],
    [1000, "hands_1000_life"],
    [5000, "hands_5000_life"],
  ] as const;
  for (const [threshold, awardId] of lifeMilestones) {
    if (lifetimeHands >= threshold && !earnedAwardIds.has(awardId)) add(awardId);
  }

  if (won && consecutiveWins >= 2) add("win_streak_2", handId);
  if (won && wentToShowdown) add("showdown_win", handId);
  if (won && wasAllIn) add("all_in_win", handId);
  if (bigPotWin) add("big_pot_win", handId);

  return candidates;
}
