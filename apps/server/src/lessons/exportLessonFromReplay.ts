/**
 * Export lesson content from a replayed hand: hero decision snapshots + pro action sequence.
 * Used by scripts/export-lesson-from-replay.ts. Reuses ReplayFrameService (persisted snapshots).
 */

import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { PrismaClient } from "@prisma/client";
import { ReplayFrameService } from "../engine/persistence/ReplayFrameService.js";

const LESSON_HERO_USER_ID = "user_1";

const ACTION_TO_EXPECTED: Record<string, string> = {
  FOLD: "FOLD",
  CHECK: "CHECK",
  CALL: "CALL",
  BET: "BET",
  RAISE: "RAISE",
  ALL_IN: "ALL_IN",
  AUTO_FOLD: "FOLD",
  AUTO_CHECK: "CHECK",
};

const EXPECTED_ACTION_TO_OPTION: Record<string, string[]> = {
  FOLD: ["canFold"],
  CHECK: ["canCheck"],
  CALL: ["canCall"],
  RAISE: ["canBet", "canRaise", "canAllIn"],
  BET: ["canBet"],
  ALL_IN: ["canAllIn"],
};

export type HeroDecisionPoint = {
  snapshot: TableSnapshotPayload;
  expectedAction: string;
  sequence: number;
  /** Street at this decision (e.g. PREFLOP, FLOP). */
  street: string;
  /** Board cards at this decision (e.g. ["Tc","9d","2s"]). */
  board: string[];
  /** Pro's action amount in cents (null for FOLD/CHECK). */
  proActionAmountCents: number | null;
};

export type ExportLessonFromReplayParams = {
  prisma: PrismaClient;
  handId: string;
  heroSeat: number;
  /** Cap number of steps (hero decisions) to export. */
  maxSteps?: number;
};

export type ExportLessonFromReplayResult =
  | { ok: true; points: HeroDecisionPoint[] }
  | { ok: false; error: string };

export async function exportLessonFromReplay(
  params: ExportLessonFromReplayParams,
): Promise<ExportLessonFromReplayResult> {
  const { prisma, handId, heroSeat, maxSteps } = params;

  const hand = await prisma.hand.findUnique({
    where: { id: handId, endedAt: { not: null } },
    select: {
      id: true,
      players: {
        select: {
          seat: true,
          holeCardsJson: true,
        },
      },
      actions: {
        orderBy: { actionIndex: "asc" },
        select: {
          seat: true,
          action: true,
          amountCents: true,
        },
      },
    },
  });

  if (!hand) {
    return { ok: false, error: "Hand not found or not ended" };
  }

  const heroPlayer = hand.players.find((p) => p.seat === heroSeat);
  if (!heroPlayer) {
    return { ok: false, error: `No player in seat ${heroSeat}` };
  }

  const heroHoleCards = Array.isArray(heroPlayer.holeCardsJson)
    ? (heroPlayer.holeCardsJson as string[])
    : [];

  const heroActions = hand.actions.filter((a) => a.seat === heroSeat);
  const expectedActions = heroActions.map((a) => {
    const normalized = ACTION_TO_EXPECTED[a.action.toUpperCase()] ?? a.action;
    return normalized.toUpperCase();
  });

  const frames = await ReplayFrameService.getFramesForHand(handId);
  if (frames.length === 0) {
    return { ok: false, error: "No replay frames for this hand (enable snapshot persistence)" };
  }

  const decisionFrames: TableSnapshotPayload[] = [];
  for (const frame of frames) {
    const toAct = frame.hand?.toActSeat;
    if (toAct === undefined || toAct !== heroSeat) continue;
    if (frame.hand?.street === "WAITING" || frame.hand?.street === "SHOWDOWN") continue;
    decisionFrames.push(frame);
  }

  if (decisionFrames.length !== expectedActions.length) {
    return {
      ok: false,
      error: `Hero decision count (${decisionFrames.length}) does not match hero actions count (${expectedActions.length})`,
    };
  }

  // First N hero decisions only (truncation is by decision count, not by street).
  const limit = typeof maxSteps === "number" && maxSteps > 0 ? maxSteps : decisionFrames.length;
  const framesSlice = decisionFrames.slice(0, limit);
  const actionsSlice = expectedActions.slice(0, limit);

  const points: HeroDecisionPoint[] = framesSlice.map((frame, i) => {
    const snapshot = rewriteSnapshotForLesson(frame, {
      heroSeat,
      heroHoleCards,
      lessonHeroUserId: LESSON_HERO_USER_ID,
      stepId: `step_${String(i + 1).padStart(2, "0")}`,
    });
    const action = heroActions[i];
    const street = frame.hand?.street ?? "PREFLOP";
    const board = Array.isArray(frame.hand?.board) ? [...frame.hand.board] : [];
    const proActionAmountCents =
      action && action.amountCents > 0 ? action.amountCents : null;
    const expectedAction = actionsSlice[i] ?? "FOLD";
    return {
      snapshot,
      expectedAction,
      sequence: i + 1,
      street,
      board,
      proActionAmountCents,
    };
  });

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const snap = p.snapshot;
    const heroSeatVal = snap.hero?.seat;
    const toActSeat = snap.hand?.toActSeat;
    if (typeof toActSeat !== "number" || typeof heroSeatVal !== "number" || toActSeat !== heroSeatVal) {
      return {
        ok: false,
        error: `Step ${i + 1}: hero must be to act (hand.toActSeat === hero.seat)`,
      };
    }
    const heroSeatData = snap.seats?.find((s) => s.seat === heroSeatVal);
    if (heroSeatData && !heroSeatData.isToAct) {
      return {
        ok: false,
        error: `Step ${i + 1}: hero seat must have isToAct === true`,
      };
    }
    const opts = snap.hero?.actionOptions as Record<string, boolean> | undefined;
    const requiredOpts = EXPECTED_ACTION_TO_OPTION[p.expectedAction];
    if (requiredOpts?.length) {
      const hasOption = requiredOpts.some((key) => opts?.[key] === true);
      if (!hasOption) {
        return {
          ok: false,
          error: `Step ${i + 1}: expectedAction ${p.expectedAction} not available in hero.actionOptions (pro line validation failed)`,
        };
      }
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = snapshotFingerprint(points[i]!.snapshot);
    const b = snapshotFingerprint(points[i + 1]!.snapshot);
    if (a === b) {
      return {
        ok: false,
        error: `Step ${i + 2}: snapshot must differ from previous (duplicate snapshot)`,
      };
    }
  }

  return { ok: true, points };
}

function snapshotFingerprint(snap: TableSnapshotPayload): string {
  const h = snap.hand;
  return JSON.stringify({
    street: h?.street,
    potCents: h?.potCents,
    board: h?.board,
    actionCount: h?.actionCount,
    stateHash: snap.stateHash,
  });
}

function rewriteSnapshotForLesson(
  frame: TableSnapshotPayload,
  opts: {
    heroSeat: number;
    heroHoleCards: string[];
    lessonHeroUserId: string;
    stepId: string;
  },
): TableSnapshotPayload {
  const { heroSeat, heroHoleCards, lessonHeroUserId, stepId } = opts;

  const hero = {
    userId: lessonHeroUserId,
    youAreSeated: true,
    seat: heroSeat,
    holeCards: heroHoleCards.length === 2 ? heroHoleCards : undefined,
    actionOptions: frame.hero?.actionOptions,
    calculations: frame.hero?.calculations,
    playerStats: frame.hero?.playerStats,
  };

  return {
    ...frame,
    snapshotId: stepId,
    hero,
  };
}
