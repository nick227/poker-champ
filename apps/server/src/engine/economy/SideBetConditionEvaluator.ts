import pokersolver from "pokersolver";
import type { SideBetCondition, HandRank } from "@poker-champ/realtime-contract";

const { Hand } = pokersolver as { Hand: any };

/**
 * pokersolver's own rank ordering (higher = better), mirrored here as a name-keyed map so
 * LOSER_HAND_RANK_AT_LEAST can compare "at least X" without depending on pokersolver's
 * internal numeric .rank field (undocumented, name-keying is the stable public contract —
 * pokersolver's Hand.solve(...).name is exactly one of these strings).
 */
const POKERSOLVER_RANK_ORDER: Record<string, number> = {
  "High Card": 1,
  Pair: 2,
  "Two Pair": 3,
  "Three of a Kind": 4,
  Straight: 5,
  Flush: 6,
  "Full House": 7,
  "Four of a Kind": 8,
  "Straight Flush": 9,
  "Royal Flush": 10,
};

const HAND_RANK_TO_POKERSOLVER_NAME: Record<HandRank, string> = {
  PAIR: "Pair",
  TWO_PAIR: "Two Pair",
  THREE_OF_A_KIND: "Three of a Kind",
  STRAIGHT: "Straight",
  FLUSH: "Flush",
  FULL_HOUSE: "Full House",
  FOUR_OF_A_KIND: "Four of a Kind",
  STRAIGHT_FLUSH: "Straight Flush",
  ROYAL_FLUSH: "Royal Flush",
};

export type HandPlayerRow = {
  playerId: string; // PokerPlayer.id
  userId: string | null;
  holeCards: string[] | null;
  endingStackCents: number | null;
  startingStackCents: number;
};

export type HandActionRow = {
  playerId: string; // PokerPlayer.id
  actionIndex: number;
  street: string;
  action: string;
};

export type HandPayoutRow = {
  playerId: string; // PokerPlayer.id
  amountCents: number;
};

export type ResolvableHand = {
  board: string[];
  reason: string | null;
  players: HandPlayerRow[];
  actions: HandActionRow[];
  payouts: HandPayoutRow[];
};

export type ConditionEvaluationResult =
  | { outcome: "DETERMINED"; initiatorWins: boolean; note: string }
  /** The condition couldn't be evaluated against this hand's actual persisted data (e.g. a
   *  subject wasn't actually dealt into it after all) — caller should VOID and refund nothing,
   *  since nothing was ever debited for a PENDING/ACTIVE side bet (§5.2). */
  | { outcome: "VOID"; note: string };

function findPlayer(hand: ResolvableHand, userId: string): HandPlayerRow | undefined {
  return hand.players.find((p) => p.userId === userId);
}

function payoutFor(hand: ResolvableHand, playerId: string): number {
  return hand.payouts.filter((p) => p.playerId === playerId).reduce((sum, p) => sum + p.amountCents, 0);
}

function solve(holeCards: string[] | null, board: string[]): { name: string } | undefined {
  if (!holeCards || holeCards.length !== 2 || board.length < 3) return undefined;
  try {
    return Hand.solve([...holeCards, ...board]) as { name: string };
  } catch {
    return undefined;
  }
}

/**
 * did subject A or subject B win the hand's pot — a chop between exactly the two subjects
 * is treated as VOID (no principled winner to pick), not an arbitrary tiebreak.
 */
function evaluateWinnerIs(hand: ResolvableHand, subjectA: string, subjectB: string, predicted: string): ConditionEvaluationResult {
  const playerA = findPlayer(hand, subjectA);
  const playerB = findPlayer(hand, subjectB);
  if (!playerA || !playerB) return { outcome: "VOID", note: "One or both subjects were not dealt into this hand." };

  const payoutA = payoutFor(hand, playerA.playerId);
  const payoutB = payoutFor(hand, playerB.playerId);
  if (payoutA > 0 && payoutB > 0) {
    return { outcome: "VOID", note: "Both subjects were paid out (chopped pot) — no single winner." };
  }
  if (payoutA === 0 && payoutB === 0) {
    return { outcome: "VOID", note: "Neither subject received a payout this hand." };
  }
  const winner = payoutA > payoutB ? subjectA : subjectB;
  return {
    outcome: "DETERMINED",
    initiatorWins: winner === predicted,
    note: `${winner === subjectA ? "First" : "Second"} subject won the pot.`,
  };
}

/** did the losing subject's hand reach at least the given rank — initiator is always the "yes" side. */
function evaluateLoserHandRankAtLeast(
  hand: ResolvableHand,
  subjectA: string,
  subjectB: string,
  rank: HandRank,
): ConditionEvaluationResult {
  const playerA = findPlayer(hand, subjectA);
  const playerB = findPlayer(hand, subjectB);
  if (!playerA || !playerB) return { outcome: "VOID", note: "One or both subjects were not dealt into this hand." };

  const payoutA = payoutFor(hand, playerA.playerId);
  const payoutB = payoutFor(hand, playerB.playerId);
  if (payoutA > 0 && payoutB > 0) {
    return { outcome: "VOID", note: "Both subjects were paid out (chopped pot) — no single loser." };
  }
  if (payoutA === 0 && payoutB === 0) {
    return { outcome: "VOID", note: "Neither subject received a payout this hand." };
  }
  const loser = payoutA > payoutB ? playerB : playerA;
  const solved = solve(loser.holeCards, hand.board);
  if (!solved) {
    return { outcome: "VOID", note: "Loser's hand could not be evaluated (no showdown reveal)." };
  }
  const loserRank = POKERSOLVER_RANK_ORDER[solved.name] ?? 0;
  const targetRank = POKERSOLVER_RANK_ORDER[HAND_RANK_TO_POKERSOLVER_NAME[rank]] ?? 0;
  const badBeat = loserRank >= targetRank;
  return {
    outcome: "DETERMINED",
    initiatorWins: badBeat,
    note: badBeat
      ? `Loser held ${solved.name}, which qualifies.`
      : `Loser held ${solved.name}, below the ${HAND_RANK_TO_POKERSOLVER_NAME[rank]} threshold.`,
  };
}

/** did the hand reach showdown — initiator is always the "yes" side. */
function evaluateReachedShowdown(hand: ResolvableHand, expected: boolean): ConditionEvaluationResult {
  const reachedShowdown = hand.reason === "SHOWDOWN";
  return {
    outcome: "DETERMINED",
    initiatorWins: reachedShowdown === expected,
    note: reachedShowdown ? "Hand reached showdown." : "Hand ended before showdown.",
  };
}

/** which of the two subjects folded first. */
function evaluateFoldOrder(hand: ResolvableHand, subjectA: string, subjectB: string, predicted: string): ConditionEvaluationResult {
  const playerA = findPlayer(hand, subjectA);
  const playerB = findPlayer(hand, subjectB);
  if (!playerA || !playerB) return { outcome: "VOID", note: "One or both subjects were not dealt into this hand." };

  const folds = hand.actions
    .filter((a) => (a.playerId === playerA.playerId || a.playerId === playerB.playerId) && (a.action === "FOLD" || a.action === "AUTO_FOLD"))
    .sort((a, b) => a.actionIndex - b.actionIndex);

  if (folds.length === 0) {
    return { outcome: "VOID", note: "Neither subject folded this hand." };
  }
  const firstFolderUserId = folds[0]!.playerId === playerA.playerId ? subjectA : subjectB;
  return {
    outcome: "DETERMINED",
    initiatorWins: firstFolderUserId === predicted,
    note: `${firstFolderUserId === subjectA ? "First" : "Second"} subject folded first.`,
  };
}

/**
 * Evaluates a side bet's condition against a hand's persisted Hand/HandPlayer/HandAction/
 * HandPayout data (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §5.3). Returns whether the INITIATOR's
 * side of the proposition won — the recipient is always the implicit other side. `subjects`/
 * `predictedSubjectUserId` come from the PlayerInteraction row's `metadata` (§4), not the
 * catalog entry itself, since they're per-bet, not per-catalog-key.
 */
export function evaluateSideBetCondition(
  condition: SideBetCondition,
  hand: ResolvableHand,
  subjects: [string, string] | undefined,
  predictedSubjectUserId: string | undefined,
): ConditionEvaluationResult {
  switch (condition.kind) {
    case "WINNER_IS": {
      if (!subjects || !predictedSubjectUserId) {
        return { outcome: "VOID", note: "Missing subjects/prediction for WINNER_IS." };
      }
      return evaluateWinnerIs(hand, subjects[0], subjects[1], predictedSubjectUserId);
    }
    case "LOSER_HAND_RANK_AT_LEAST": {
      if (!subjects) return { outcome: "VOID", note: "Missing subjects for LOSER_HAND_RANK_AT_LEAST." };
      return evaluateLoserHandRankAtLeast(hand, subjects[0], subjects[1], condition.rank);
    }
    case "REACHED_SHOWDOWN":
      return evaluateReachedShowdown(hand, condition.value);
    case "FOLD_ORDER": {
      if (!subjects || !predictedSubjectUserId) {
        return { outcome: "VOID", note: "Missing subjects/prediction for FOLD_ORDER." };
      }
      return evaluateFoldOrder(hand, subjects[0], subjects[1], predictedSubjectUserId);
    }
    default: {
      const _exhaustive: never = condition;
      return { outcome: "VOID", note: `Unsupported condition: ${String((_exhaustive as { kind?: string })?.kind)}` };
    }
  }
}
