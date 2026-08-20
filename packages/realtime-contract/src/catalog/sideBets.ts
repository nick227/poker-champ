export type HandRank =
  | "PAIR"
  | "TWO_PAIR"
  | "THREE_OF_A_KIND"
  | "STRAIGHT"
  | "FLUSH"
  | "FULL_HOUSE"
  | "FOUR_OF_A_KIND"
  | "STRAIGHT_FLUSH"
  | "ROYAL_FLUSH";

export type SideBetCondition =
  | { kind: "WINNER_IS" }
  | { kind: "LOSER_HAND_RANK_AT_LEAST"; rank: HandRank }
  | { kind: "REACHED_SHOWDOWN"; value: boolean }
  | { kind: "FOLD_ORDER" };

export interface SideBetCatalogEntry {
  id: string;
  label: string;
  description: string;
  /** Bounds are relative to the table's current big blind, not flat cents — resolved at both
   *  propose and accept time (docs/GIFTS_AND_SIDE_BETS_DESIGN.md §7). */
  minStakeBigBlinds: number;
  maxStakeBigBlinds: number;
  /** Default 1:1. When set, the accepting side's exposure is stakeCents * payoutMultiplier —
   *  not a house rake, see the design doc §10 and PlayerInteractionService's resolution comment. */
  payoutMultiplier?: number;
  condition: SideBetCondition;
  /** WINNER_IS / LOSER_HAND_RANK_AT_LEAST / FOLD_ORDER need two *other* seated players' hand
   *  outcome (subjectUserIds) — always disjoint from the two bettors (no own-hand bets, §9/§10).
   *  REACHED_SHOWDOWN is a whole-hand boolean and needs no subjects. */
  requiresSubjects: boolean;
  /** WINNER_IS / FOLD_ORDER compare two subjects, so the initiator must also say which subject
   *  they're predicting (predictedSubjectUserId) — the recipient implicitly takes the other side.
   *  LOSER_HAND_RANK_AT_LEAST / REACHED_SHOWDOWN are plain yes/no propositions: the initiator is
   *  always the "yes" side, the recipient is always the implicit "no" side. */
  requiresPrediction: boolean;
}

export const SIDE_BET_CATALOG: SideBetCatalogEntry[] = [
  {
    id: "sidebet.coin_flip",
    label: "Coin Flip",
    description: "Even-money bet on who wins a hand neither of you is dealt into. Pick two seated opponents and call the winner.",
    minStakeBigBlinds: 1,
    maxStakeBigBlinds: 5,
    condition: { kind: "WINNER_IS" },
    requiresSubjects: true,
    requiresPrediction: true,
  },
  {
    id: "sidebet.bad_beat_bounty",
    label: "Bad Beat Bounty",
    description: "Payout if the hand's loser goes out despite reaching two pair or better.",
    minStakeBigBlinds: 1,
    maxStakeBigBlinds: 5,
    payoutMultiplier: 3,
    condition: { kind: "LOSER_HAND_RANK_AT_LEAST", rank: "TWO_PAIR" },
    requiresSubjects: true,
    requiresPrediction: false,
  },
  {
    id: "sidebet.river_rat",
    label: "River Rat",
    description: "Bet on whether a hand goes the distance to showdown.",
    minStakeBigBlinds: 1,
    maxStakeBigBlinds: 5,
    condition: { kind: "REACHED_SHOWDOWN", value: true },
    requiresSubjects: false,
    requiresPrediction: false,
  },
  {
    id: "sidebet.first_to_fold",
    label: "First to Fold",
    description: "Between two other seats, who folds first.",
    minStakeBigBlinds: 1,
    maxStakeBigBlinds: 5,
    condition: { kind: "FOLD_ORDER" },
    requiresSubjects: true,
    requiresPrediction: true,
  },
];

export const SIDE_BET_CATALOG_BY_KEY: ReadonlyMap<string, SideBetCatalogEntry> = new Map(
  SIDE_BET_CATALOG.map((entry) => [entry.id, entry]),
);
