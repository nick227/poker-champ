/**
 * Sanity checks for lesson content. Catches spec/build mistakes as the library grows.
 * Usage: pnpm lessons:validate [--dir=content/lessons/content]
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const STREET_BOARD_LEN: Record<string, number> = {
  PREFLOP: 0,
  FLOP: 3,
  TURN: 4,
  RIVER: 5,
};

interface StepConfig {
  lessonId: string;
  title?: string;
  steps: Array<{
    id: string;
    sequence: number;
    decisionIndex?: number;
    type: string;
    street?: string;
    expectedAction?: string;
    snapshotPath?: string;
    board?: string[];
    gradingSpecJson?: { expectedAction?: string };
  }>;
}

interface SnapshotHero {
  actionOptions?: {
    canFold?: boolean;
    canCheck?: boolean;
    canCall?: boolean;
    canBet?: boolean;
    canRaise?: boolean;
    canAllIn?: boolean;
  };
}

interface Snapshot {
  hand?: { board?: string[]; street?: string; potCents?: number };
  hero?: SnapshotHero;
}

function parseArgs(argv: string[]): { contentDir: string } {
  let contentDir = path.join(ROOT, "content", "lessons", "content");
  for (const arg of argv) {
    if (arg.startsWith("--dir=")) contentDir = path.resolve(arg.slice("--dir=".length).trim());
  }
  return { contentDir };
}

async function loadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const EXPECTED_ACTION_TO_OPTION: Record<string, keyof NonNullable<SnapshotHero["actionOptions"]>> = {
  CHECK: "canCheck",
  FOLD: "canFold",
  CALL: "canCall",
  BET: "canBet",
  RAISE: "canRaise",
  ALL_IN: "canAllIn",
};

function hasActionOption(snap: Snapshot): boolean {
  const o = snap.hero?.actionOptions;
  if (!o) return false;
  return !!(
    o.canFold ||
    o.canCheck ||
    o.canCall ||
    o.canBet ||
    o.canRaise ||
    o.canAllIn
  );
}

function isExpectedActionLegal(step: StepConfig["steps"][0], snap: Snapshot): boolean {
  const action = (step.expectedAction ?? step.gradingSpecJson?.expectedAction)?.toUpperCase();
  if (!action || !EXPECTED_ACTION_TO_OPTION[action]) return true;
  const key = EXPECTED_ACTION_TO_OPTION[action];
  return !!snap.hero?.actionOptions?.[key];
}

async function validateLesson(
  lessonDir: string,
  lessonId: string,
  config: StepConfig,
): Promise<string[]> {
  const errors: string[] = [];
  const steps = config.steps ?? [];
  const actionSteps = steps.filter((s) => s.type === "ACTION_STEP" && s.snapshotPath);

  // 1) Snapshot count = hero decision count
  const snapshotsDir = path.join(lessonDir, "snapshots");
  let snapshotFiles: string[] = [];
  try {
    snapshotFiles = (await fs.readdir(snapshotsDir)).filter(
      (f) => f.endsWith(".json") && !f.startsWith("."),
    );
  } catch {
    if (actionSteps.length > 0) errors.push(`${lessonId}: snapshots dir missing or unreadable`);
    return errors;
  }

  if (actionSteps.length > 0 && actionSteps.length !== snapshotFiles.length) {
    errors.push(
      `${lessonId}: snapshot count (${snapshotFiles.length}) != heroDecisionCount (${actionSteps.length})`,
    );
  }

  // 2) Board progression valid
  let prevBoardLen = -1;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const street = step.street ?? "PREFLOP";
    const expectedLen = STREET_BOARD_LEN[street] ?? 0;
    const board = step.board ?? [];
    if (board.length !== expectedLen) {
      errors.push(
        `${lessonId} step ${step.sequence}: board length ${board.length} does not match street ${street} (expected ${expectedLen})`,
      );
    }
    if (board.length < prevBoardLen) {
      errors.push(`${lessonId} step ${step.sequence}: board regression (shorter than previous)`);
    }
    prevBoardLen = board.length;
  }

  // 3) No empty action options; expected action legal; snapshot street; path mapping; pot sanity
  let prevPotCents: number | undefined;
  for (const step of actionSteps) {
    if (!step.snapshotPath) continue;
    const stepStreet = step.street ?? "PREFLOP";
    const expectedBasename = `step_${String(step.sequence).padStart(2, "0")}.json`;
    const actualBasename = path.basename(step.snapshotPath);
    if (/^step_\d+\.json$/.test(actualBasename) && actualBasename !== expectedBasename) {
      errors.push(
        `${lessonId} step ${step.sequence}: snapshot path must be .../${expectedBasename} (got ${actualBasename})`,
      );
    }
    const snapPath = path.resolve(lessonDir, step.snapshotPath.replace(/^\.\//, ""));
    const snap = await loadJson<Snapshot>(snapPath);
    if (!snap) {
      errors.push(`${lessonId}: snapshot not found or invalid: ${step.snapshotPath}`);
      continue;
    }
    if (!hasActionOption(snap)) {
      errors.push(
        `${lessonId} step ${step.sequence} (${step.snapshotPath}): no action option enabled (canFold/canCheck/canCall/canBet/canRaise/canAllIn all false)`,
      );
    }
    const expectedAction = (step.expectedAction ?? step.gradingSpecJson?.expectedAction)?.toUpperCase();
    if (expectedAction && !isExpectedActionLegal(step, snap)) {
      errors.push(
        `${lessonId} step ${step.sequence}: expectedAction ${expectedAction} is not legal (snapshot hero.actionOptions.${EXPECTED_ACTION_TO_OPTION[expectedAction] ?? "?"} is false)`,
      );
    }
    if (step.street !== undefined && snap.hand?.street !== undefined && snap.hand.street !== stepStreet) {
      errors.push(
        `${lessonId} step ${step.sequence}: snapshot.hand.street (${snap.hand.street}) !== step.street (${stepStreet})`,
      );
    }
    if (step.board && step.board.length > 0 && snap.hand?.board !== undefined) {
      const stepBoard = step.board;
      const snapBoard = snap.hand.board;
      if (
        snapBoard.length !== stepBoard.length ||
        snapBoard.some((c, i) => c !== stepBoard[i])
      ) {
        errors.push(
          `${lessonId} step ${step.sequence}: snapshot board does not match step board`,
        );
      }
    }
    if (snap.hand?.potCents !== undefined && snap.hand.potCents < 0) {
      errors.push(`${lessonId} step ${step.sequence}: snapshot.hand.potCents < 0`);
    }
    const pot = snap.hand?.potCents;
    if (typeof pot === "number" && typeof prevPotCents === "number" && pot < prevPotCents) {
      errors.push(
        `${lessonId} step ${step.sequence}: pot decreased (${prevPotCents} → ${pot}); projection error?`,
      );
    }
    if (typeof pot === "number") prevPotCents = pot;
  }

  // 4) Lesson step order correct
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].sequence !== i + 1) {
      errors.push(
        `${lessonId}: step order broken at index ${i} (sequence ${steps[i].sequence}, expected ${i + 1})`,
      );
    }
  }
  const actionSequences = actionSteps.map((s) => s.sequence).sort((a, b) => a - b);
  for (let i = 0; i < actionSequences.length; i++) {
    if (actionSequences[i] !== i + 1) {
      errors.push(
        `${lessonId}: action steps not contiguous (decisionIndex/sequence gap)`,
      );
      break;
    }
  }

  return errors;
}

async function main(): Promise<void> {
  const { contentDir } = parseArgs(process.argv.slice(2));
  const dirs = await fs.readdir(contentDir, { withFileTypes: true });
  const lessonDirs = dirs
    .filter((d) => d.isDirectory() && /^L\d{2,}$/.test(d.name))
    .map((d) => path.join(contentDir, d.name))
    .sort();

  const allErrors: string[] = [];
  for (const lessonDir of lessonDirs) {
    const lessonId = path.basename(lessonDir);
    const configPath = path.join(lessonDir, "step-config.json");
    const config = await loadJson<StepConfig>(configPath);
    if (!config) continue;
    const errs = await validateLesson(lessonDir, lessonId, config);
    allErrors.push(...errs);
  }

  if (allErrors.length > 0) {
    console.error("Lessons validation failed:\n");
    allErrors.forEach((e) => console.error("  " + e));
    process.exit(1);
  }
  console.log(`Validated ${lessonDirs.length} lessons. OK.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
