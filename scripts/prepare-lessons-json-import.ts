import fs from "node:fs/promises";
import path from "node:path";
import { TableSnapshotPayloadSchema } from "@poker-champ/realtime-contract";

type RawLesson = {
  lessonId: string;
  title: string;
  question: string;
  response: string;
  snapshot: unknown;
};

type GradingMode = "OBJECTIVE_SINGLE" | "RUBRIC_SUBJECTIVE";

const ROOT = process.cwd();
const INPUT_PATH = path.resolve(ROOT, "poker_lessons_full_15.json");
const OUTPUT_ROOT = path.resolve(ROOT, "content/lessons/imports/poker_lessons_full_15");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLessonId(id: string, idx: number): string {
  const trimmed = id.trim();
  if (trimmed.length > 0) return trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
  return `L${String(idx + 1).padStart(2, "0")}`;
}

function inferGradingMode(lesson: RawLesson): GradingMode {
  const text = `${lesson.title} ${lesson.question}`.toLowerCase();
  const objectiveSignals = [
    "oesd",
    "flush draw",
    "combo draw",
    "half-pot",
    "pot-sized",
    "minimum bet",
    "all-in",
    "facing two all-ins",
  ];
  return objectiveSignals.some((signal) => text.includes(signal))
    ? "OBJECTIVE_SINGLE"
    : "RUBRIC_SUBJECTIVE";
}

function moduleCodeByIndex(idx: number): string {
  if (idx < 5) return "MODULE_A";
  if (idx < 10) return "MODULE_B";
  return "MODULE_C";
}

function difficultyByIndex(idx: number): string {
  if (idx < 5) return "BEGINNER";
  if (idx < 10) return "CORE";
  return "ADVANCED";
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Input JSON must be an array of lessons.");
  }

  const lessons: RawLesson[] = parsed.map((row, idx) => {
    if (typeof row !== "object" || row == null) {
      throw new Error(`Lesson index ${idx} is not an object.`);
    }
    const lesson = row as Record<string, unknown>;
    if (!isNonEmptyString(lesson.lessonId)) throw new Error(`Lesson index ${idx}: lessonId required`);
    if (!isNonEmptyString(lesson.title)) throw new Error(`Lesson ${lesson.lessonId}: title required`);
    if (!isNonEmptyString(lesson.question)) throw new Error(`Lesson ${lesson.lessonId}: question required`);
    if (!isNonEmptyString(lesson.response)) throw new Error(`Lesson ${lesson.lessonId}: response required`);
    if (lesson.snapshot == null) throw new Error(`Lesson ${lesson.lessonId}: snapshot required`);
    const snapshotParsed = TableSnapshotPayloadSchema.safeParse(lesson.snapshot);
    if (!snapshotParsed.success) throw new Error(`Lesson ${lesson.lessonId}: snapshot invalid`);
    return {
      lessonId: String(lesson.lessonId),
      title: String(lesson.title),
      question: String(lesson.question),
      response: String(lesson.response),
      snapshot: snapshotParsed.data,
    };
  });

  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const reviewRows: string[] = [
    "lessonId,title,gradingMode,needsAnswerKey,notes",
  ];

  for (let idx = 0; idx < lessons.length; idx += 1) {
    const lesson = lessons[idx];
    const normalizedLessonId = normalizeLessonId(lesson.lessonId, idx);
    const lessonDir = path.resolve(OUTPUT_ROOT, normalizedLessonId);
    const snapshotsDir = path.resolve(lessonDir, "snapshots");
    await fs.mkdir(snapshotsDir, { recursive: true });

    const gradingMode = inferGradingMode(lesson);
    const needsAnswerKey = gradingMode === "OBJECTIVE_SINGLE" ? "yes" : "rubric";
    const notes =
      gradingMode === "OBJECTIVE_SINGLE"
        ? "Set expectedAction or expectedOptionKey before seeding."
        : "Define rubric bands and accepted reasoning before seeding.";
    reviewRows.push(
      `"${normalizedLessonId}","${lesson.title.replace(/"/g, '""')}","${gradingMode}","${needsAnswerKey}","${notes}"`,
    );

    const snapshotRelPath = "./snapshots/main.json";
    const draftStepConfig = {
      lessonId: normalizedLessonId,
      title: lesson.title,
      version: 1,
      moduleCode: moduleCodeByIndex(idx),
      recommendedOrder: idx + 1,
      targetAudience: "serious online players",
      difficulty: difficultyByIndex(idx),
      estimatedMinutes: 8,
      importedFrom: path.basename(INPUT_PATH),
      importDraft: true,
      steps: [
        {
          id: `${normalizedLessonId}_intro`,
          sequence: 1,
          type: "INFO_STEP",
          snapshotVersion: 1,
          snapshotPath: snapshotRelPath,
          gradingVersion: 1,
          beforeInstructorMessage: "Review the situation before acting.",
          question: lesson.question,
          followUpInstructorMessage: "When ready, make your table decision.",
          gradingSpecJson: {
            type: "INFO_STEP",
            response: "Scenario loaded.",
          },
        },
        {
          id: `${normalizedLessonId}_decision`,
          sequence: 2,
          type: "ACTION_STEP",
          snapshotVersion: 1,
          snapshotPath: snapshotRelPath,
          gradingVersion: 1,
          beforeInstructorMessage: "",
          question: lesson.question,
          followUpInstructorMessage: lesson.response,
          gradingSpecJson: {
            type: "ACTION_STEP",
            gradingMode,
            expectedAction: "REVIEW_REQUIRED",
            responseCorrect: "Good line for this situation.",
            responseIncorrect: "There is a better line in this node.",
            followUpCorrect: lesson.response,
            followUpIncorrect: lesson.response,
            runtime: {
              scenarioProviderKey: "static_snapshot",
              evaluatorKey: "action_rubric_eval",
              revealLayerKeys: ["ev_impact", "community_comparison"],
              continuationKey: null,
              displayCategory: "WWYD_COMPARE",
            },
          },
        },
      ],
    };

    const lessonMd = [
      `# ${lesson.title}`,
      "",
      `- Lesson ID: \`${normalizedLessonId}\``,
      "- Import status: Draft scaffold generated from `poker_lessons_full_15.json`.",
      "",
      "## Scenario Question",
      lesson.question,
      "",
      "## Instructor Follow-Up (Draft)",
      lesson.response,
      "",
      "## Grading Checklist",
      `- Grading mode guess: \`${gradingMode}\``,
      '- Replace `expectedAction: "REVIEW_REQUIRED"` with the final answer key or rubric evaluator contract.',
      "",
    ].join("\n");

    await Promise.all([
      fs.writeFile(path.resolve(snapshotsDir, "main.json"), JSON.stringify(lesson.snapshot, null, 2), "utf8"),
      fs.writeFile(path.resolve(lessonDir, "step-config.draft.json"), JSON.stringify(draftStepConfig, null, 2), "utf8"),
      fs.writeFile(path.resolve(lessonDir, "lesson.md"), lessonMd, "utf8"),
    ]);
  }

  await fs.writeFile(path.resolve(OUTPUT_ROOT, "grading-review.csv"), `${reviewRows.join("\n")}\n`, "utf8");

  console.log(
    [
      `Prepared draft import for ${lessons.length} lessons.`,
      `Output: ${path.relative(ROOT, OUTPUT_ROOT)}`,
      "Review grading-review.csv and each step-config.draft.json before moving into content/lessons/content.",
    ].join("\n"),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

