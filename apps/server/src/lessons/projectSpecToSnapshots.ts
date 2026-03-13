/**
 * Project a minimal hand spec through a simple state machine and capture
 * snapshots before each hero decision. Produces TableSnapshotPayload-shaped
 * output for the lesson builder. sizePot is converted during projection using
 * current pot (not before).
 */

import { createHash } from "node:crypto";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { MinimalHandSpec, SpecAction, Street } from "./minimalHandSpec.types.js";
import { BOARD_LENGTH_BY_STREET, STREET_ORDER } from "./minimalHandSpec.types.js";
import { normalizeActionStepSnapshot } from "./normalizeActionStepSnapshot.js";
export type HeroDecisionPoint = {
  snapshot: TableSnapshotPayload;
  expectedAction: string;
  sequence: number;
  street: string;
  board: string[];
  proActionAmountCents: number | null;
  beforeInstructorMessage?: string;
  followUpContent?: string;
};

const BB_TO_CENTS = 100;
const LESSON_HERO_USER_ID = "user_1";

type SeatState = {
  seat: number;
  position: string;
  name: string;
  stackCents: number;
  roundBetCents: number;
  committedCents: number;
  status: "ACTIVE" | "FOLDED" | "ALL_IN" | "OUT";
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
};

type ProjectionState = {
  street: Street;
  potCents: number;
  roundCurrentBetCents: number;
  minRaiseCents: number;
  actionCount: number;
  board: string[];
  seats: SeatState[];
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
  toActSeat: number;
  handId: string;
};

function initialSeats(spec: MinimalHandSpec): SeatState[] {
  const bbCents = Math.round(spec.blinds.bb * BB_TO_CENTS);
  const sbCents = Math.round(spec.blinds.sb * BB_TO_CENTS);
  const seats: SeatState[] = spec.playersInfo.map((p) => {
    const stackBB = spec.stacksBB?.[p.position] ?? spec.stacksBB?.[String(p.seat)] ?? spec.startingStacksBB;
    const stackCents = Math.round(stackBB * BB_TO_CENTS);
    const isDealer = p.position === "BTN";
    const isSB = p.position === "SB" || (spec.players === 2 && isDealer);
    const isBB = p.position === "BB";
    let roundBetCents = 0;
    let committedCents = 0;
    if (isSB) {
      roundBetCents = sbCents;
      committedCents = sbCents;
    }
    if (isBB) {
      roundBetCents = bbCents;
      committedCents = bbCents;
    }
    return {
      seat: p.seat,
      position: p.position,
      name: p.name ?? `Seat ${p.seat}`,
      stackCents,
      roundBetCents,
      committedCents,
      status: "ACTIVE",
      isDealer,
      isSB,
      isBB,
    };
  });
  return seats;
}

function getSeat(state: ProjectionState, seat: number): SeatState | undefined {
  return state.seats.find((s) => s.seat === seat);
}

function nextActiveSeat(state: ProjectionState, fromSeat: number): number | null {
  const seatIndices = state.seats.map((s) => s.seat).sort((a, b) => a - b);
  const n = seatIndices.length;
  const idx = seatIndices.indexOf(fromSeat);
  if (idx < 0) return null;
  for (let i = 1; i <= n; i++) {
    const nextSeat = seatIndices[(idx + i) % n]!;
    const s = getSeat(state, nextSeat);
    if (s && (s.status === "ACTIVE" || s.status === "ALL_IN") && s.stackCents > 0) return nextSeat;
  }
  return null;
}

/** First to act preflop: heads-up = BTN; 3+ players = seat left of BB (UTG). */
function firstToActPreflop(state: ProjectionState, playerCount: number): number {
  if (playerCount === 2) return state.dealerSeat;
  const utg = nextActiveSeat(state, state.bbSeat);
  return utg ?? state.dealerSeat;
}

function firstToActPostflop(state: ProjectionState): number | null {
  const seatIndices = state.seats.map((s) => s.seat).sort((a, b) => a - b);
  const dealerIdx = seatIndices.indexOf(state.dealerSeat);
  if (dealerIdx < 0) return null;
  const n = seatIndices.length;
  for (let i = 1; i <= n; i++) {
    const seat = seatIndices[(dealerIdx + i) % n]!;
    const s = getSeat(state, seat);
    if (s && (s.status === "ACTIVE" || s.status === "ALL_IN") && s.stackCents > 0) return seat;
  }
  return null;
}

/** On street transition: reveal board up to street, reset round bet and per-seat round contributions so call sizing is correct. */
function advanceStreet(state: ProjectionState, spec: MinimalHandSpec, nextStreet: Street, playerCount: number): void {
  state.street = nextStreet;
  state.roundCurrentBetCents = 0;
  state.minRaiseCents = state.potCents > 0 ? Math.round(spec.blinds.bb * BB_TO_CENTS) : 0;
  for (const s of state.seats) {
    s.roundBetCents = 0;
  }
  const len = BOARD_LENGTH_BY_STREET[nextStreet];
  state.board = spec.board.slice(0, len);
  const first = nextStreet === "PREFLOP" ? firstToActPreflop(state, playerCount) : firstToActPostflop(state);
  state.toActSeat = first ?? -1;
}

function isHeroDecision(spec: MinimalHandSpec, action: SpecAction): boolean {
  if (action.isHeroDecision === true) return true;
  return action.actorSeat === spec.heroSeat;
}

/**
 * Derive full legal actionOptions from current state so all legal buttons are enabled in the UI.
 * Learners can choose any legal action; grading marks the expected one correct.
 */
function actionOptionsFromState(
  state: ProjectionState,
  heroSeat: number,
  expectedAction: string,
): TableSnapshotPayload["hero"]["actionOptions"] {
  const hero = getSeat(state, heroSeat);
  if (!hero || hero.status !== "ACTIVE") {
    return actionOptionsForExpected(expectedAction);
  }
  const { stackCents, roundBetCents } = hero;
  const roundCurrentBetCents = state.roundCurrentBetCents;
  const canCheck = roundCurrentBetCents === roundBetCents;
  const callAmount = Math.max(0, roundCurrentBetCents - roundBetCents);
  const canCall = callAmount > 0 && stackCents > 0;
  const canBet = roundCurrentBetCents === 0 && stackCents > 0;
  const canRaise = roundCurrentBetCents > 0 && stackCents > 0;
  const canFold = true;
  const canAllIn = stackCents > 0;
  const u = expectedAction.toUpperCase();
  const primaryWagerAction =
    u === "BET" ? "BET" : u === "RAISE" ? "RAISE" : canBet ? "BET" : canRaise ? "RAISE" : "NONE";
  return {
    canFold,
    canCheck,
    canCall,
    canBet,
    canRaise,
    canAllIn,
    primaryWagerAction,
    callAmount: canCall ? Math.min(callAmount, stackCents) : 0,
    minRaiseTo: undefined,
    maxRaiseTo: undefined,
  };
}

function actionOptionsForExpected(expectedAction: string): TableSnapshotPayload["hero"]["actionOptions"] {
  const u = expectedAction.toUpperCase();
  return {
    canFold: u === "FOLD",
    canCheck: u === "CHECK",
    canCall: u === "CALL",
    canBet: u === "BET",
    canRaise: u === "RAISE",
    canAllIn: u === "ALL_IN",
    primaryWagerAction: u === "BET" ? "BET" : u === "RAISE" ? "RAISE" : "NONE",
    callAmount: 0,
    minRaiseTo: undefined,
    maxRaiseTo: undefined,
  };
}

function buildSnapshot(
  state: ProjectionState,
  spec: MinimalHandSpec,
  stepId: string,
  expectedAction: string,
  seq: number,
): TableSnapshotPayload {
  const nowTs = Date.now();
  const tableId = "lesson-spec";
  const bbCents = Math.round(spec.blinds.bb * BB_TO_CENTS);
  const sbCents = Math.round(spec.blinds.sb * BB_TO_CENTS);

  const seats = state.seats.map((s) => ({
    seat: s.seat,
    occupied: true,
    userId: s.seat === spec.heroSeat ? LESSON_HERO_USER_ID : `user_${s.seat}`,
    isBot: s.seat !== spec.heroSeat,
    name: s.name,
    status: s.status,
    stackCents: s.stackCents,
    roundBetCents: s.roundBetCents,
    committedCents: s.committedCents,
    connected: true,
    disconnectDeadlineTs: 0,
    isDealer: s.isDealer,
    isToAct: state.toActSeat === s.seat,
  }));

  const hand = {
    handId: state.handId,
    handNumber: 1,
    street: state.street,
    dealerSeat: state.dealerSeat,
    sbSeat: state.sbSeat,
    bbSeat: state.bbSeat,
    toActSeat: state.toActSeat,
    actionCount: state.actionCount,
    roundCurrentBetCents: state.roundCurrentBetCents,
    minRaiseCents: state.minRaiseCents,
    potCents: state.potCents,
    board: [...state.board],
  };

  const payload: Omit<TableSnapshotPayload, "stateHash"> = {
    version: 1,
    snapshotId: stepId,
    snapshotSeq: seq,
    emittedAtTs: nowTs,
    serverTimeTs: nowTs,
    reason: "ACTION_ACCEPTED",
    table: {
      tableId,
      tableName: spec.lessonTitle,
      visibility: "PUBLIC",
      maxSeats: 9,
      smallBlindCents: sbCents,
      bigBlindCents: bbCents,
      minBuyInCents: bbCents * 20,
      maxBuyInCents: bbCents * 200,
      showStats: true,
    },
    hand,
    seats,
    hero: {
      userId: LESSON_HERO_USER_ID,
      youAreSeated: true,
      seat: spec.heroSeat,
      holeCards: [...spec.heroHoleCards],
      actionOptions: actionOptionsFromState(state, spec.heroSeat, expectedAction),
    },
  };

  const stateHash = createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  return { ...payload, stateHash };
}

export type ProjectSpecResult =
  | { ok: true; points: HeroDecisionPoint[]; maxStreetReached: Street; villainBarrelCount: number; totalActionCount: number }
  | { ok: false; error: string };

export function projectSpecToSnapshots(spec: MinimalHandSpec): ProjectSpecResult {
  const seats = initialSeats(spec);
  const dealerSeat = seats.find((s) => s.isDealer)?.seat ?? seats[0]!.seat;
  const sbSeat = seats.find((s) => s.isSB)?.seat ?? -1;
  const bbSeat = seats.find((s) => s.isBB)?.seat ?? -1;
  const potCents = Math.round((spec.blinds.sb + spec.blinds.bb) * BB_TO_CENTS);

  const state: ProjectionState = {
    street: "PREFLOP",
    potCents,
    roundCurrentBetCents: Math.round(spec.blinds.bb * BB_TO_CENTS),
    minRaiseCents: Math.round(spec.blinds.bb * BB_TO_CENTS),
    actionCount: 0,
    board: [],
    seats,
    dealerSeat,
    sbSeat,
    bbSeat,
    toActSeat: -1,
    handId: `spec_${Date.now()}`,
  };
  state.toActSeat = firstToActPreflop(state, spec.players);

  const points: HeroDecisionPoint[] = [];
  let stepSeq = 0;
  const villainBetsByStreet = new Set<string>();

  for (let i = 0; i < spec.actions.length; i++) {
    const action = spec.actions[i]!;

    if (state.street !== action.street) {
      if (STREET_ORDER.indexOf(action.street) < STREET_ORDER.indexOf(state.street)) {
        return { ok: false, error: `Action ${i + 1}: street ${action.street} is before current ${state.street}` };
      }
      advanceStreet(state, spec, action.street, spec.players);
    }

    if (state.toActSeat !== action.actorSeat) {
      return { ok: false, error: `Action ${i + 1}: expected toActSeat ${state.toActSeat}, got actorSeat ${action.actorSeat}` };
    }

    const actor = getSeat(state, action.actorSeat);
    if (!actor) return { ok: false, error: `Action ${i + 1}: seat ${action.actorSeat} not found` };
    if (actor.status !== "ACTIVE" && actor.status !== "ALL_IN") {
      return { ok: false, error: `Action ${i + 1}: seat ${action.actorSeat} is not active` };
    }

    if (isHeroDecision(spec, action)) {
      stepSeq++;
      const expectedAction = action.action;
      const stepId = `step_${String(stepSeq).padStart(2, "0")}`;
      const rawSnapshot = buildSnapshot(state, spec, stepId, expectedAction, stepSeq);
      const snapshot = normalizeActionStepSnapshot(rawSnapshot, expectedAction, { stepId });
      const proActionAmountCents =
        (action.action === "BET" || action.action === "RAISE" || action.action === "ALL_IN") && (action.sizeBB != null || action.sizePot != null)
          ? resolveAmountCents(state, spec, action)
          : null;
      points.push({
        snapshot,
        expectedAction,
        sequence: stepSeq,
        street: state.street,
        board: [...state.board],
        proActionAmountCents,
        beforeInstructorMessage: action.beforeInstructorMessage,
        followUpContent: action.followUpContent,
      });
    } else {
      if (action.actorSeat !== spec.heroSeat && (action.action === "BET" || action.action === "RAISE" || action.action === "ALL_IN")) {
        villainBetsByStreet.add(state.street);
      }
    }

    const amountCents = resolveAmountCents(state, spec, action);
    applyAction(state, action, amountCents);

    const nextIdx = i + 1;
    if (nextIdx < spec.actions.length) {
      const nextAction = spec.actions[nextIdx]!;
      if (nextAction.street !== state.street) {
        advanceStreet(state, spec, nextAction.street, spec.players);
      } else {
        const next = nextActiveSeat(state, action.actorSeat);
        state.toActSeat = next ?? firstToActPostflop(state) ?? -1;
      }
    } else {
      const next = nextActiveSeat(state, action.actorSeat);
      state.toActSeat = next ?? -1;
    }
  }

  const maxStreetReached = state.street;
  const villainBarrelCount = villainBetsByStreet.size;
  const totalActionCount = state.actionCount;

  return { ok: true, points, maxStreetReached, villainBarrelCount, totalActionCount };
}

/** sizePot uses pot before this action (state.potCents excludes the pending bet being matched). */
function resolveAmountCents(state: ProjectionState, spec: MinimalHandSpec, action: SpecAction): number {
  if (action.sizeBB != null) return Math.round(action.sizeBB * spec.blinds.bb * BB_TO_CENTS);
  if (action.sizePot != null) return Math.round(action.sizePot * state.potCents);
  if (action.action === "CALL") {
    const actor = getSeat(state, action.actorSeat);
    if (!actor) return 0;
    return Math.max(0, state.roundCurrentBetCents - actor.roundBetCents);
  }
  if (action.action === "CHECK" || action.action === "FOLD") return 0;
  if (action.action === "ALL_IN") {
    const actor = getSeat(state, action.actorSeat);
    return actor ? actor.stackCents : 0;
  }
  return 0;
}

function applyAction(state: ProjectionState, action: SpecAction, amountCents: number): void {
  const actor = getSeat(state, action.actorSeat);
  if (!actor) return;

  state.actionCount++;

  if (action.action === "FOLD") {
    actor.status = "FOLDED";
    return;
  }

  const toPut = Math.min(amountCents, actor.stackCents);
  actor.stackCents -= toPut;
  actor.roundBetCents += toPut;
  actor.committedCents += toPut;
  state.potCents += toPut;

  if (action.action === "BET" || action.action === "RAISE") {
    state.roundCurrentBetCents = actor.roundBetCents;
    state.minRaiseCents = Math.max(state.minRaiseCents, toPut);
  }
  if (actor.stackCents <= 0) actor.status = "ALL_IN";
}
