/**
 * Types for the minimal hand spec (AI → lesson pipeline).
 * Aligns with content/lessons/content/minimal-hand-spec.schema.json
 */

export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
export type ActionKind = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type PlayerInfo = {
  seat: number;
  position: string;
  name?: string;
};

export type SpecAction = {
  street: Street;
  actorSeat: number;
  action: ActionKind;
  sizeBB?: number;
  sizePot?: number;
  isHeroDecision?: boolean;
  /** Shown before the decision (e.g. "Decision 2. Facing a turn bet…"). */
  beforeInstructorMessage?: string;
  /** Teaching note shown after the decision (replaces placeholder). */
  followUpContent?: string;
};

export type Constraints = {
  minStreetReached?: "FLOP" | "TURN" | "RIVER";
  minHeroDecisions?: number;
  villainBarrels?: number;
};

export type MinimalHandSpec = {
  specVersion: number;
  lessonTitle: string;
  description?: string;
  players: number;
  playersInfo: PlayerInfo[];
  heroSeat: number;
  blinds: { sb: number; bb: number };
  startingStacksBB: number;
  stacksBB?: Record<string, number>;
  heroHoleCards: [string, string];
  board: string[];
  actions: SpecAction[];
  seed?: number;
  tags?: string[];
  constraints?: Constraints;
};

export const STREET_ORDER: Street[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];
export const BOARD_LENGTH_BY_STREET: Record<Street, number> = {
  PREFLOP: 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
};
