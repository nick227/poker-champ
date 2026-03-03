import fs from "node:fs/promises";
import path from "node:path";

type GradingMode = "OBJECTIVE_SINGLE" | "RUBRIC_SUBJECTIVE";

type ObjectiveLessonPlan = {
  lessonId: string;
  gradingMode: "OBJECTIVE_SINGLE";
  acceptedCorrectActions: string[];
};

type RubricLessonPlan = {
  lessonId: string;
  gradingMode: "RUBRIC_SUBJECTIVE";
  rubric: {
    acceptedAnswers: {
      STRONG: string[];
      REASONABLE: string[];
      WEAK: string[];
    };
  };
};

type LessonPlan = ObjectiveLessonPlan | RubricLessonPlan;

type GradingPlanSummary = {
  version: number;
  lessons: LessonPlan[];
};

const ROOT = process.cwd();
const IMPORT_ROOT = path.resolve(ROOT, "content/lessons/imports/poker_lessons_full_15");
const PLAN_PATH = path.resolve(IMPORT_ROOT, "grading-plan-summary.json");
const CURRICULUM_VERSION = "poker_lessons_full_15_v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function normalizeAction(action: string): string {
  const normalized = action.trim().toLowerCase();
  if (normalized === "all-in") return "all_in";
  return normalized;
}

function normalizeActionList(actions: string[]): string[] {
  return [...new Set(actions.map(normalizeAction).filter((v) => v.length > 0))];
}

async function main() {
  const planRaw = await fs.readFile(PLAN_PATH, "utf8");
  const plan = JSON.parse(planRaw) as GradingPlanSummary;
  if (!Array.isArray(plan.lessons)) throw new Error("Invalid grading plan: lessons[] required");

  let updatedCount = 0;
  for (const lessonPlan of plan.lessons) {
    const lessonDir = path.resolve(IMPORT_ROOT, lessonPlan.lessonId);
    const draftConfigPath = path.resolve(lessonDir, "step-config.draft.json");
    let draftRaw: string;
    try {
      draftRaw = await fs.readFile(draftConfigPath, "utf8");
    } catch {
      continue;
    }
    const draft = JSON.parse(draftRaw);
    if (!isObject(draft) || !Array.isArray(draft.steps)) continue;
    draft.curriculumVersion = CURRICULUM_VERSION;
    draft.gradingPlanVersion = plan.version;

    const decisionStep = draft.steps.find(
      (step: unknown) => isObject(step) && step.type === "ACTION_STEP" && isObject(step.gradingSpecJson),
    ) as Record<string, unknown> | undefined;
    if (!decisionStep) continue;
    const gradingSpec = decisionStep.gradingSpecJson as Record<string, unknown>;
    decisionStep.gradingVersion = 1;

    // Freeze community distribution key normalization for action lessons.
    gradingSpec.distributionKey = {
      type: "action_bucket",
      buckets: ["fold", "call", "raise", "all_in"],
    };

    const mode: GradingMode = lessonPlan.gradingMode;
    gradingSpec.gradingMode = mode;

    if (mode === "OBJECTIVE_SINGLE") {
      const accepted = normalizeActionList(lessonPlan.acceptedCorrectActions ?? []);
      if (accepted.length === 0) {
        throw new Error(`${lessonPlan.lessonId}: OBJECTIVE_SINGLE requires acceptedCorrectActions`);
      }
      gradingSpec.acceptedCorrectActions = accepted;
      // Compatibility fallback for current runtime evaluator.
      gradingSpec.expectedAction = accepted[0].toUpperCase();
      delete gradingSpec.rubric;
    } else {
      const rubric = lessonPlan.rubric?.acceptedAnswers;
      if (!rubric) {
        throw new Error(`${lessonPlan.lessonId}: RUBRIC_SUBJECTIVE requires rubric.acceptedAnswers`);
      }
      const normalizedRubric = {
        STRONG: normalizeActionList(rubric.STRONG ?? []),
        REASONABLE: normalizeActionList(rubric.REASONABLE ?? []),
        WEAK: normalizeActionList(rubric.WEAK ?? []),
      };
      gradingSpec.rubric = {
        acceptedAnswers: normalizedRubric,
      };
      // Compatibility fallback for current runtime evaluator.
      const strongPrimary = normalizedRubric.STRONG[0] ?? "call";
      gradingSpec.expectedAction = strongPrimary.toUpperCase();
      delete gradingSpec.acceptedCorrectActions;
    }

    decisionStep.gradingSpecJson = gradingSpec;
    await fs.writeFile(draftConfigPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
    updatedCount += 1;
  }

  console.log(`Applied grading plan to ${updatedCount} draft lesson configs.`);
  console.log(`Plan source: ${path.relative(ROOT, PLAN_PATH)}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

