/**
 * Replay → lesson exporter (Phase 1 of lessons pipeline).
 * Usage: pnpm lessons:export:replay --handId=<id> --heroSeat=<0-8> [--lessonId=L22] [--outDir=...] [--maxSteps=10]
 *
 * Requires: hand has replay frames (FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE=true when hand was played).
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getPrisma, disconnectPrisma } from "../apps/server/src/db/prisma.js";
import { exportLessonFromReplay } from "../apps/server/src/lessons/exportLessonFromReplay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const POSITION_LABELS: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "CO"],
  5: ["BTN", "SB", "BB", "CO", "HJ"],
  6: ["BTN", "SB", "BB", "CO", "HJ", "UTG"],
  7: ["BTN", "SB", "BB", "CO", "HJ", "UTG", "EP"],
  8: ["BTN", "SB", "BB", "CO", "HJ", "UTG", "EP", "EP2"],
  9: ["BTN", "SB", "BB", "CO", "HJ", "UTG", "EP", "EP2", "EP3"],
};

function heroPositionFromSnapshot(snapshot: TableSnapshotPayload, heroSeat: number): string | null {
  const hand = snapshot.hand;
  const seats = snapshot.seats;
  if (!hand || !seats?.length) return null;
  const dealerSeat = hand.dealerSeat;
  const maxSeats = Math.max(9, ...seats.map((s) => s.seat)) + 1;
  const occupiedSet = new Set(seats.filter((s) => s.occupied).map((s) => s.seat));
  const ordered: number[] = [];
  for (let k = 0; k < maxSeats; k++) {
    const s = (dealerSeat + k) % maxSeats;
    if (occupiedSet.has(s)) ordered.push(s);
  }
  const idx = ordered.indexOf(heroSeat);
  if (idx < 0) return null;
  const labels = POSITION_LABELS[ordered.length] ?? POSITION_LABELS[6];
  return labels[idx] ?? null;
}

function parseArgs(argv: string[]): {
  handId: string | null;
  heroSeat: number | null;
  lessonId: string;
  outDir: string;
  maxSteps: number | null;
  force: boolean;
} {
  let handId: string | null = null;
  let heroSeat: number | null = null;
  let lessonId = "L22";
  let outDir = "";
  let maxSteps: number | null = null;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force") force = true;
    else if (arg.startsWith("--handId=")) handId = arg.slice("--handId=".length) || null;
    else if (arg.startsWith("--heroSeat=")) {
      const n = Number.parseInt(arg.slice("--heroSeat=".length), 10);
      if (Number.isInteger(n) && n >= 0) heroSeat = n;
    } else if (arg.startsWith("--lessonId=")) lessonId = arg.slice("--lessonId=".length) || "L22";
    else if (arg.startsWith("--outDir=")) outDir = arg.slice("--outDir=".length);
    else if (arg.startsWith("--maxSteps=")) {
      const n = Number.parseInt(arg.slice("--maxSteps=".length), 10);
      if (Number.isInteger(n) && n > 0) maxSteps = n;
    }
  }

  if (!outDir) outDir = path.join(ROOT, "content", "lessons", "content", lessonId);

  return { handId, heroSeat, lessonId, outDir, maxSteps, force };
}

function snapshotFingerprint(snapshot: TableSnapshotPayload): string {
  const json = JSON.stringify(snapshot);
  return createHash("sha1").update(json).digest("hex");
}

function responseTextForAction(action: string, correct: boolean): string {
  const suffix = correct ? "." : " here.";
  switch (action.toUpperCase()) {
    case "FOLD":
      return `Pro folded${suffix}`;
    case "CHECK":
      return `Pro checked${suffix}`;
    case "CALL":
      return `Pro called${suffix}`;
    case "BET":
      return `Pro bet${suffix}`;
    case "RAISE":
      return `Pro raised${suffix}`;
    case "ALL_IN":
      return `Pro went all-in${suffix}`;
    default:
      return `Pro ${action.toLowerCase()}ed${suffix}`;
  }
}

type PointForConfig = {
  sequence: number;
  expectedAction: string;
  street: string;
  board: string[];
  proActionAmountCents: number | null;
};

function stepConfigFromPoints(
  lessonId: string,
  title: string,
  heroSeat: number,
  heroPosition: string | null,
  replayHandId: string,
  points: PointForConfig[],
): Record<string, unknown> {
  const steps = points.map((p) => ({
    id: `${lessonId}_step_${String(p.sequence).padStart(2, "0")}`,
    sequence: p.sequence,
    decisionIndex: p.sequence,
    type: "ACTION_STEP",
    street: p.street,
    expectedAction: p.expectedAction,
    proActionSeat: heroSeat,
    proActionAmountCents: p.proActionAmountCents,
    board: p.board.length > 0 ? p.board : undefined,
    evPro: null as number | null,
    evHero: null as number | null,
    snapshotVersion: 1,
    snapshotPath: `./snapshots/step_${String(p.sequence).padStart(2, "0")}.json`,
    gradingVersion: 1,
    beforeInstructorMessage: `Decision ${p.sequence}. What would the pro do?`,
    question: "What would the pro do?",
    gradingSpecJson: {
      type: "ACTION_STEP",
      runtime: {
        evaluatorKey: "action_rubric_eval",
        scenarioProviderKey: "static_snapshot",
        revealLayerKeys: ["ev_impact", "community_comparison"],
        displayCategory: "WWYD_COMPARE",
      },
      gradingMode: "OBJECTIVE_SINGLE",
      expectedAction: p.expectedAction,
      distributionKey: {
        type: "action_bucket",
        buckets: ["fold", "check", "call", "raise", "all_in"],
      },
      responseCorrect: responseTextForAction(p.expectedAction, true),
      responseIncorrect: responseTextForAction(p.expectedAction, false),
      acceptedCorrectActions: [p.expectedAction.toLowerCase()],
      followUpContent: "(Add teaching note.)",
    },
  }));

  return {
    lessonId,
    title,
    version: 1,
    lessonType: "FULL_HAND_GHOST",
    heroSeat,
    heroPosition: heroPosition ?? undefined,
    replayHandId,
    moduleCode: "MODULE_GHOST",
    recommendedOrder: 1,
    targetAudience: "all",
    difficulty: "BEGINNER",
    estimatedMinutes: Math.max(5, Math.min(30, steps.length * 2)),
    steps,
    curriculumVersion: "poker_lessons_ghost_v1",
    role: "teaches",
    repeatable: true,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.handId || args.heroSeat === null) {
    console.error(
      "Usage: pnpm lessons:export:replay --handId=<id> --heroSeat=<0-8> [--lessonId=L22] [--outDir=<path>] [--maxSteps=10] [--force]",
    );
    process.exit(1);
  }

  const prisma = getPrisma();
  const result = await exportLessonFromReplay({
    prisma,
    handId: args.handId,
    heroSeat: args.heroSeat,
    maxSteps: args.maxSteps ?? undefined,
  });

  if (!result.ok) {
    console.error("Export failed:", result.error);
    process.exit(1);
  }

  const lessonDirExists = await fs.access(path.join(args.outDir, "step-config.json")).then(() => true).catch(() => false)
    || await fs.access(path.join(args.outDir, "export-meta.json")).then(() => true).catch(() => false);
  if (lessonDirExists && !args.force) {
    console.error(`Error: Lesson ${args.lessonId} already exists at ${args.outDir}. Use --force to overwrite.`);
    process.exit(1);
  }

  const { points } = result;
  const title = `Ghost from hand ${args.handId}`;
  const heroPosition = result.ok ? heroPositionFromSnapshot(points[0]!.snapshot, args.heroSeat) : null;

  await fs.mkdir(path.join(args.outDir, "snapshots"), { recursive: true });

  for (const p of points) {
    const snapshotWithHash: TableSnapshotPayload = {
      ...p.snapshot,
      stateHash: snapshotFingerprint(p.snapshot),
    };
    const name = `step_${String(p.sequence).padStart(2, "0")}.json`;
    const filePath = path.join(args.outDir, "snapshots", name);
    await fs.writeFile(filePath, JSON.stringify(snapshotWithHash, null, 2), "utf8");
  }

  const stepConfig = stepConfigFromPoints(
    args.lessonId,
    title,
    args.heroSeat,
    heroPosition,
    args.handId,
    points.map((p) => ({
      sequence: p.sequence,
      expectedAction: p.expectedAction,
      street: p.street,
      board: p.board,
      proActionAmountCents: p.proActionAmountCents,
    })),
  );
  const configPath = path.join(args.outDir, "step-config.json");
  await fs.writeFile(configPath, JSON.stringify(stepConfig, null, 2), "utf8");

  const streets = [...new Set(points.map((p) => p.street))].sort();
  const exportMeta = {
    handId: args.handId,
    heroSeat: args.heroSeat,
    decisionCount: points.length,
    streets,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
  await fs.writeFile(path.join(args.outDir, "export-meta.json"), JSON.stringify(exportMeta, null, 2), "utf8");

  const lessonMd = `# ${title}\n\nExported from hand ${args.handId}, hero seat ${args.heroSeat}. Edit beforeInstructorMessage and followUpContent in step-config.json.\n`;
  await fs.writeFile(path.join(args.outDir, "lesson.md"), lessonMd, "utf8");

  console.log(JSON.stringify({ ok: true, lessonId: args.lessonId, steps: points.length, outDir: args.outDir }, null, 2));
}

main()
  .then(() => disconnectPrisma())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
