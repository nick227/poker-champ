/**
 * Build lesson from minimal hand spec (AI → lesson pipeline MVP).
 * Usage: pnpm lessons:build:from-spec --spec=path/to/spec.json [--lessonId=L42] [--outDir=...] [--force]
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLessonFromSpec } from "../src/lessons/buildLessonFromSpec.js";
import type { MinimalHandSpec } from "../src/lessons/minimalHandSpec.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv: string[]): { specPath: string; lessonId: string; outDir: string; force: boolean } {
  let specPath = "";
  let lessonId = "L42";
  let outDir = "";
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg.startsWith("--spec=")) specPath = arg.slice("--spec=".length).trim();
    else if (arg.startsWith("--lessonId=")) lessonId = arg.slice("--lessonId=".length).trim() || "L42";
    else if (arg.startsWith("--outDir=")) outDir = arg.slice("--outDir=".length).trim();
  }

  if (!outDir) outDir = path.join(ROOT, "content", "lessons", "content", lessonId);
  return { specPath, lessonId, outDir, force };
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

function stepConfigFromPoints(
  lessonId: string,
  title: string,
  heroSeat: number,
  heroPosition: string | undefined,
  points: {
    sequence: number;
    expectedAction: string;
    street: string;
    board: string[];
    proActionAmountCents: number | null;
    beforeInstructorMessage?: string;
    followUpContent?: string;
  }[],
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
    beforeInstructorMessage: p.beforeInstructorMessage ?? `Decision ${p.sequence}. What would the pro do?`,
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
      followUpContent: p.followUpContent ?? "(Add teaching note.)",
    },
  }));

  return {
    lessonId,
    title,
    version: 1,
    lessonType: "FULL_HAND_GHOST",
    heroSeat,
    heroPosition: heroPosition ?? undefined,
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

function specHash(specJson: string): string {
  return createHash("sha256").update(specJson).digest("hex").slice(0, 16);
}

function snapshotFingerprint(snapshot: unknown): string {
  return createHash("sha1").update(JSON.stringify(snapshot)).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.specPath) {
    console.error("Usage: pnpm lessons:build:from-spec --spec=<path> [--lessonId=L42] [--outDir=<path>] [--force]");
    process.exit(1);
  }

  const specPathResolved = path.isAbsolute(args.specPath) ? args.specPath : path.join(process.cwd(), args.specPath);
  let specJson: string;
  try {
    specJson = await fs.readFile(specPathResolved, "utf8");
  } catch (err) {
    console.error("Failed to read spec file:", err);
    process.exit(1);
  }

  let spec: unknown;
  try {
    spec = JSON.parse(specJson);
  } catch (err) {
    console.error("Invalid JSON in spec file:", err);
    process.exit(1);
  }

  const result = buildLessonFromSpec(spec);
  if (!result.ok) {
    console.error("Build failed:", result.error);
    process.exit(1);
  }

  const { points, spec: validSpec, totalActionCount } = result;
  const lessonDirExists =
    (await fs.access(path.join(args.outDir, "step-config.json")).then(() => true).catch(() => false)) ||
    (await fs.access(path.join(args.outDir, "export-meta.json")).then(() => true).catch(() => false));

  if (lessonDirExists && !args.force) {
    console.error(`Error: Lesson ${args.lessonId} already exists at ${args.outDir}. Use --force to overwrite.`);
    process.exit(1);
  }

  await fs.mkdir(path.join(args.outDir, "snapshots"), { recursive: true });

  for (const p of points) {
    const snapshotWithHash = {
      ...p.snapshot,
      stateHash: snapshotFingerprint(p.snapshot),
    };
    const name = `step_${String(p.sequence).padStart(2, "0")}.json`;
    await fs.writeFile(path.join(args.outDir, "snapshots", name), JSON.stringify(snapshotWithHash, null, 2), "utf8");
  }

  const heroPosition = (validSpec as MinimalHandSpec).playersInfo.find((x) => x.seat === validSpec.heroSeat)?.position;
  const stepConfig = stepConfigFromPoints(
    args.lessonId,
    validSpec.lessonTitle,
    validSpec.heroSeat,
    heroPosition,
    points.map((p) => ({
      sequence: p.sequence,
      expectedAction: p.expectedAction,
      street: p.street,
      board: p.board,
      proActionAmountCents: p.proActionAmountCents,
      beforeInstructorMessage: p.beforeInstructorMessage,
      followUpContent: p.followUpContent,
    })),
  );
  await fs.writeFile(path.join(args.outDir, "step-config.json"), JSON.stringify(stepConfig, null, 2), "utf8");

  const exportMeta = {
    source: "ai-spec",
    generatedAt: new Date().toISOString().slice(0, 10),
    specVersion: validSpec.specVersion,
    engineVersion: "projection-mvp",
    pipelineVersion: "1",
    specHash: specHash(specJson),
    decisionCount: points.length,
    heroDecisionCount: points.length,
    actionCount: totalActionCount,
    streets: [...new Set(points.map((p) => p.street))].sort(),
  };
  await fs.writeFile(path.join(args.outDir, "export-meta.json"), JSON.stringify(exportMeta, null, 2), "utf8");

  const lessonMd = `# ${validSpec.lessonTitle}\n\nBuilt from minimal hand spec. Add \`beforeInstructorMessage\` and \`followUpContent\` to each hero-decision action in the spec to supply prompts and teaching notes; otherwise edit step-config.json.\n`;
  await fs.writeFile(path.join(args.outDir, "lesson.md"), lessonMd, "utf8");

  console.log(JSON.stringify({ ok: true, lessonId: args.lessonId, steps: points.length, outDir: args.outDir }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
