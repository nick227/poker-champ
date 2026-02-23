import type { BotActionContext } from "../../../BotBrain.js";
import type {
  BetSizeRelativeToStackBucket,
  BoardMonotoneBucket,
  BoardPairedBucket,
  BoardWetnessBucket,
  BetSizeBucket,
  CallCostRelativeToStackBucket,
  DerivedFeatures,
  DrawFlags,
  DrawBucket,
  HandTierByComboIndex,
  InitiativeBucket,
  InitiativeStreetCountBucket,
  LimpPresentBucket,
  MultiwayEquityPenaltyBucket,
  OpenOpportunityBucket,
  PositionPostflopBucket,
  PotOddsBucket,
  PositionBucket,
  PostflopHandClass,
  PressureBucket,
  SprBucket,
  SqueezeOpportunityBucket,
  StraightConnectivityBucket,
  Street,
} from "../types.js";

const DEFAULT_BIG_BLIND_CENTS = 100;

export function deriveFeatures(ctx: BotActionContext, handTierByComboIndex: HandTierByComboIndex): DerivedFeatures {
  const street = deriveStreet(ctx.handSnapshot.street);
  const streetBucket = street === "PREFLOP" ? undefined : street;
  const toCallCents = Math.max(0, ctx.handSnapshot.roundCurrentBetCents - ctx.seatSnapshot.roundBetCents);
  const pressureBucket = derivePressureBucket(toCallCents, ctx.seatSnapshot.stackCents);
  const betSizeBucket = deriveBetSizeBucket(ctx.handSnapshot.roundCurrentBetCents, ctx.handSnapshot.potCents, pressureBucket);
  const comboIndex = street === "PREFLOP" ? 0 : undefined;
  const handTier = comboIndex != null ? handTierByComboIndex[comboIndex] : undefined;
  const positionBucket = derivePositionBucket(ctx.seatSnapshot.seat);
  const activePlayersInHand = Math.max(2, ctx.activePlayersInHand ?? 2);
  const playerCountBucket = derivePlayerCountBucket(activePlayersInHand);
  const drawFlags = street === "PREFLOP" ? undefined : deriveDrawFlags(ctx.heroHoleCards ?? [], ctx.handSnapshot.board);
  const handClass = street === "PREFLOP" ? undefined : derivePostflopHandClass(ctx.handSnapshot.board);
  const sprBucket = deriveSprBucket(ctx.seatSnapshot.stackCents, ctx.handSnapshot.potCents);
  const boardRanks = street === "PREFLOP" ? undefined : extractBoardRanks(ctx.handSnapshot.board);
  const boardSuits = street === "PREFLOP" ? undefined : extractBoardSuits(ctx.handSnapshot.board);
  const betSizeRelativeToStackBucket =
    toCallCents > 0 ? deriveBetSizeRelativeToStackBucket(toCallCents, ctx.seatSnapshot.stackCents) : undefined;
  const callCostRelativeToStackBucket =
    toCallCents > 0 ? deriveCallCostRelativeToStackBucket(toCallCents, ctx.seatSnapshot.stackCents) : undefined;
  const openOpportunityBucket = street === "PREFLOP" ? deriveOpenOpportunityBucket(pressureBucket) : undefined;
  const squeezeOpportunityBucket = street === "PREFLOP" ? deriveSqueezeOpportunityBucket(pressureBucket) : undefined;
  const limpPresentBucket = street === "PREFLOP" ? deriveLimpPresentBucket(pressureBucket) : undefined;

  return {
    street,
    streetBucket,
    positionBucket,
    positionPostflopBucket: street === "PREFLOP" ? undefined : derivePositionPostflopBucket(positionBucket),
    pressureBucket,
    facingPressureBucket: pressureBucket,
    betSizeBucket,
    stackBucket: deriveStackBucket(ctx.seatSnapshot.stackCents, DEFAULT_BIG_BLIND_CENTS),
    activePlayersInHand,
    playerCountBucket,
    initiativeBucket: deriveInitiativeBucket(pressureBucket),
    initiativeStreetCountBucket: street === "PREFLOP" ? undefined : deriveInitiativeStreetCountBucket(street),
    sprBucket,
    comboIndex,
    handTier,
    handClass,
    drawFlags,
    drawBucket: drawFlags ? deriveDrawBucket(drawFlags) : undefined,
    potOddsBucket: toCallCents > 0 ? derivePotOddsBucket(toCallCents, ctx.handSnapshot.potCents) : undefined,
    boardPairedBucket: boardRanks ? deriveBoardPairedBucket(boardRanks) : undefined,
    boardWetnessBucket: boardRanks && boardSuits ? deriveBoardWetnessBucket(boardRanks, boardSuits) : undefined,
    boardMonotoneBucket: boardSuits ? deriveBoardMonotoneBucket(boardSuits) : undefined,
    straightConnectivityBucket: boardRanks ? deriveStraightConnectivityBucket(boardRanks) : undefined,
    hasOverpairBucket:
      street === "PREFLOP" ? undefined : deriveHasOverpairBucket(ctx.heroHoleCards ?? [], ctx.handSnapshot.board),
    topPairKickerStrengthBucket:
      street === "PREFLOP" ? undefined : deriveTopPairKickerStrengthBucket(ctx.heroHoleCards ?? [], ctx.handSnapshot.board),
    madeHandStrengthBucket: handClass ? deriveMadeHandStrengthBucket(handClass) : undefined,
    blockerStrengthBucket:
      street === "PREFLOP" ? undefined : deriveBlockerStrengthBucket(ctx.heroHoleCards ?? [], ctx.handSnapshot.board),
    opponentTightnessBucket: "BALANCED",
    opponentAggressionBucket: "PASSIVE",
    recentAggressionHistoryBucket: "NONE",
    tableImageBucket: "BALANCED",
    betSizeRelativeToStackBucket,
    callCostRelativeToStackBucket,
    tournamentIcmPressureBucket: "LOW",
    multiwayEquityPenaltyBucket: deriveMultiwayEquityPenaltyBucket(playerCountBucket),
    riskToleranceBucket: "NORMAL",
    tiltLevelBucket: "CALM",
    timePressureBucket: "LOW",
    openOpportunityBucket,
    squeezeOpportunityBucket,
    limpPresentBucket,
    potCents: ctx.handSnapshot.potCents,
    toCallCents,
  };
}

function deriveStreet(street: BotActionContext["handSnapshot"]["street"]): DerivedFeatures["street"] {
  if (street === "FLOP" || street === "TURN" || street === "RIVER") return street;
  return "PREFLOP";
}

function derivePositionBucket(seat: number): PositionBucket {
  if (seat <= 1) return "EARLY";
  if (seat <= 3) return "MIDDLE";
  if (seat <= 5) return "LATE";
  return "BLINDS";
}

function derivePressureBucket(toCallCents: number, stackCents: number): PressureBucket {
  if (toCallCents <= 0) return "UNOPENED";
  if (toCallCents >= stackCents) return "VS_ALLIN";
  return "VS_RAISE";
}

function deriveBetSizeBucket(roundCurrentBetCents: number, potCents: number, pressureBucket: PressureBucket): BetSizeBucket {
  if (pressureBucket === "UNOPENED") return "NONE";
  const betSizePct = roundCurrentBetCents / Math.max(potCents, 1);
  if (betSizePct <= 0.33) return "SMALL";
  if (betSizePct <= 0.75) return "MEDIUM";
  if (betSizePct <= 1.25) return "LARGE";
  return "MAX";
}

function deriveStackBucket(stackCents: number, bigBlindCents: number): DerivedFeatures["stackBucket"] {
  const effectiveBb = stackCents / Math.max(bigBlindCents, 1);
  if (effectiveBb < 15) return "SHORT";
  if (effectiveBb <= 40) return "MEDIUM";
  return "DEEP";
}

function derivePositionPostflopBucket(positionBucket: PositionBucket): PositionPostflopBucket {
  return positionBucket === "LATE" ? "IN_POSITION" : "OUT_OF_POSITION";
}

function deriveInitiativeBucket(pressureBucket: PressureBucket): InitiativeBucket {
  return pressureBucket === "UNOPENED" ? "HAS_INITIATIVE" : "NO_INITIATIVE";
}

function deriveInitiativeStreetCountBucket(street: Street): InitiativeStreetCountBucket {
  if (street === "FLOP") return "FIRST_BARREL";
  if (street === "TURN") return "SECOND_BARREL";
  return "THIRD_BARREL";
}

function deriveSprBucket(stackCents: number, potCents: number): SprBucket {
  const spr = stackCents / Math.max(potCents, 1);
  if (spr <= 2) return "LOW";
  if (spr <= 6) return "MID";
  return "HIGH";
}

function derivePlayerCountBucket(activePlayersInHand: number): DerivedFeatures["playerCountBucket"] {
  if (activePlayersInHand <= 2) return "HU";
  if (activePlayersInHand === 3) return "MW2";
  return "MW3_PLUS";
}

function derivePotOddsBucket(toCallCents: number, potCents: number): PotOddsBucket {
  const ratio = toCallCents / Math.max(potCents + toCallCents, 1);
  if (ratio <= 0.15) return "EXCELLENT";
  if (ratio <= 0.3) return "GOOD";
  if (ratio <= 0.45) return "NEUTRAL";
  return "BAD";
}

function deriveBetSizeRelativeToStackBucket(toCallCents: number, stackCents: number): BetSizeRelativeToStackBucket {
  const ratio = toCallCents / Math.max(stackCents, 1);
  if (ratio < 0.25) return "SMALL";
  if (ratio < 0.75) return "COMMITTING";
  return "ALL_IN";
}

function deriveCallCostRelativeToStackBucket(toCallCents: number, stackCents: number): CallCostRelativeToStackBucket {
  const ratio = toCallCents / Math.max(stackCents, 1);
  if (ratio <= 0.1) return "TRIVIAL";
  if (ratio <= 0.4) return "MODERATE";
  return "COMMITTING";
}

function deriveOpenOpportunityBucket(pressureBucket: PressureBucket): OpenOpportunityBucket {
  if (pressureBucket === "UNOPENED") return "FIRST_TO_ACT";
  if (pressureBucket === "VS_3BET_PLUS") return "SQUEEZE";
  return "ISOLATE";
}

function deriveSqueezeOpportunityBucket(pressureBucket: PressureBucket): SqueezeOpportunityBucket {
  return pressureBucket === "VS_3BET_PLUS" ? "TRUE" : "FALSE";
}

function deriveLimpPresentBucket(pressureBucket: PressureBucket): LimpPresentBucket {
  return pressureBucket === "UNOPENED" ? "FALSE" : "TRUE";
}

function deriveMultiwayEquityPenaltyBucket(
  playerCountBucket: DerivedFeatures["playerCountBucket"],
): MultiwayEquityPenaltyBucket {
  if (playerCountBucket === "HU") return "NONE";
  if (playerCountBucket === "MW2") return "MODERATE";
  return "HIGH";
}

function derivePostflopHandClass(board: string[]): PostflopHandClass {
  const rankCounts = new Map<string, number>();
  for (const card of board) {
    const rank = (card || "").charAt(0);
    if (!rank) continue;
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const counts = [...rankCounts.values()].sort((a, b) => b - a);
  const pairs = counts.filter((c) => c === 2).length;
  const hasTripsOrBetter = counts.some((c) => c >= 3);
  if (hasTripsOrBetter || pairs >= 2) return "STRONG_MADE";
  if (pairs === 1) return "WEAK_MADE";
  return "AIR";
}

function deriveMadeHandStrengthBucket(
  handClass: PostflopHandClass,
): DerivedFeatures["madeHandStrengthBucket"] {
  if (handClass === "AIR") return "WEAK";
  if (handClass === "WEAK_MADE") return "MEDIUM";
  return "STRONG";
}

function deriveDrawFlags(holeCards: string[], board: string[]): DrawFlags {
  const cards = [...holeCards, ...board].filter(Boolean);
  return {
    hasFlushDraw: hasFlushDraw(cards),
    hasOpenEnded: hasOpenEnded(cards),
  };
}

function deriveDrawBucket(flags: DrawFlags): DrawBucket {
  if (flags.hasFlushDraw && flags.hasOpenEnded) return "COMBO_DRAW";
  if (flags.hasFlushDraw) return "FLUSH_DRAW";
  if (flags.hasOpenEnded) return "OPEN_ENDED";
  return "NONE";
}

function hasFlushDraw(cards: string[]): boolean {
  const suitCounts = new Map<string, number>();
  for (const card of cards) {
    const suit = card.charAt(1).toLowerCase();
    if (!suit) continue;
    suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
  }
  return [...suitCounts.values()].some((count) => count === 4);
}

function hasOpenEnded(cards: string[]): boolean {
  const ranks = extractDistinctRanks(cards);
  if (ranks.size < 4) return false;
  if (hasMadeStraight(ranks)) return false;

  for (let start = 2; start <= 10; start += 1) {
    const seq4 = [start, start + 1, start + 2, start + 3];
    if (seq4.every((rank) => ranks.has(rank))) {
      return true;
    }
  }
  return false;
}

function extractBoardRanks(board: string[]): number[] {
  const out: number[] = [];
  for (const card of board) {
    const value = rankToValue(card.charAt(0).toUpperCase());
    if (value) out.push(value);
  }
  return out;
}

function extractBoardSuits(board: string[]): string[] {
  const out: string[] = [];
  for (const card of board) {
    const suit = card.charAt(1).toLowerCase();
    if (suit) out.push(suit);
  }
  return out;
}

function deriveBoardPairedBucket(ranks: number[]): BoardPairedBucket {
  return new Set(ranks).size === ranks.length ? "FALSE" : "TRUE";
}

function deriveBoardMonotoneBucket(suits: string[]): BoardMonotoneBucket {
  if (suits.length < 3) return "FALSE";
  return new Set(suits).size === 1 ? "TRUE" : "FALSE";
}

function deriveBoardWetnessBucket(ranks: number[], suits: string[]): BoardWetnessBucket {
  const maxSameSuit = maxMultiplicity(suits);
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let maxRun = 1;
  let currentRun = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] - sorted[i - 1] === 1) {
      currentRun += 1;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }

  if (maxSameSuit >= 3 || maxRun >= 3) return "WET";
  if (maxSameSuit === 2 || maxRun === 2) return "SEMI_WET";
  return "DRY";
}

function deriveStraightConnectivityBucket(ranks: number[]): StraightConnectivityBucket {
  const distinct = [...new Set(ranks)].sort((a, b) => a - b);
  if (distinct.length < 2) return "LOW";
  const span = distinct[distinct.length - 1] - distinct[0];
  if (span <= 4) return "HIGH";
  if (span <= 7) return "MEDIUM";
  return "LOW";
}

function deriveHasOverpairBucket(holeCards: string[], board: string[]): DerivedFeatures["hasOverpairBucket"] {
  if (holeCards.length < 2 || board.length === 0) return "FALSE";
  const r1 = rankToValue(holeCards[0].charAt(0).toUpperCase());
  const r2 = rankToValue(holeCards[1].charAt(0).toUpperCase());
  if (!r1 || !r2 || r1 !== r2) return "FALSE";
  const topBoard = Math.max(...extractBoardRanks(board), 0);
  return r1 > topBoard ? "TRUE" : "FALSE";
}

function deriveTopPairKickerStrengthBucket(
  holeCards: string[],
  board: string[],
): DerivedFeatures["topPairKickerStrengthBucket"] {
  const boardRanks = extractBoardRanks(board);
  if (boardRanks.length === 0) return undefined;
  const topBoard = Math.max(...boardRanks);
  const holeRanks = holeCards
    .map((card) => rankToValue(card.charAt(0).toUpperCase()))
    .filter((value): value is number => value != null);

  if (!holeRanks.includes(topBoard)) return undefined;
  const kicker = holeRanks.find((rank) => rank !== topBoard) ?? topBoard;
  if (kicker >= 13) return "STRONG";
  if (kicker >= 10) return "MEDIUM";
  return "WEAK";
}

function deriveBlockerStrengthBucket(holeCards: string[], board: string[]): DerivedFeatures["blockerStrengthBucket"] {
  const boardSuitCounts = new Map<string, number>();
  for (const suit of extractBoardSuits(board)) {
    boardSuitCounts.set(suit, (boardSuitCounts.get(suit) ?? 0) + 1);
  }
  const dominantSuit = [...boardSuitCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!dominantSuit) return "NONE";

  let blockers = 0;
  for (const card of holeCards) {
    const suit = card.charAt(1).toLowerCase();
    if (suit === dominantSuit) blockers += 1;
  }
  if (blockers >= 2) return "DOUBLE_BLOCKER";
  if (blockers === 1) return "SINGLE_BLOCKER";
  return "NONE";
}

function maxMultiplicity(items: string[]): number {
  const counts = new Map<string, number>();
  let max = 0;
  for (const item of items) {
    const count = (counts.get(item) ?? 0) + 1;
    counts.set(item, count);
    if (count > max) max = count;
  }
  return max;
}

function hasMadeStraight(ranks: Set<number>): boolean {
  for (let start = 1; start <= 10; start += 1) {
    const seq5 = [start, start + 1, start + 2, start + 3, start + 4];
    if (seq5.every((rank) => ranks.has(rank))) {
      return true;
    }
  }
  return false;
}

function extractDistinctRanks(cards: string[]): Set<number> {
  const out = new Set<number>();
  for (const card of cards) {
    const rank = rankToValue(card.charAt(0).toUpperCase());
    if (!rank) continue;
    out.add(rank);
    if (rank === 14) out.add(1); // Ace-low wheel handling.
  }
  return out;
}

function rankToValue(rank: string): number | undefined {
  if (rank >= "2" && rank <= "9") return Number(rank);
  if (rank === "T") return 10;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  if (rank === "A") return 14;
  return undefined;
}
