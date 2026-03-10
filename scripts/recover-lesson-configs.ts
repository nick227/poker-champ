import "dotenv/config";
import { getPrisma, disconnectPrisma } from "@poker-champ/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.resolve(root, "content/lessons/content");

async function recover() {
  const prisma = getPrisma() as any;

  const lessons = await prisma.lesson.findMany({
    where: { status: "PUBLISHED" },
    include: {
      steps: {
        orderBy: { sequence: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
    orderBy: { id: "asc" },
  });

  for (const lesson of lessons) {
    const dir = path.resolve(contentRoot, lesson.id);
    const outPath = path.resolve(dir, "step-config.json");

    const config = {
      lessonId: lesson.id,
      title: lesson.title,
      version: lesson.version,
      moduleCode: lesson.moduleCode,
      recommendedOrder: lesson.recommendedOrder,
      targetAudience: "serious online players",
      difficulty: lesson.difficulty ? lesson.difficulty.toUpperCase() : "BEGINNER",
      estimatedMinutes: lesson.estimatedMinutes,
      steps: lesson.steps.map((step: any) => {
        const gradingSpec = step.gradingSpecJson as Record<string, unknown> | null;
        const out: Record<string, unknown> = {
          id: step.id,
          sequence: step.sequence,
          type: step.type,
          snapshotVersion: step.snapshotVersion,
          snapshotPath: step.snapshotVersion ? "./snapshots/main.json" : undefined,
          gradingVersion: step.gradingVersion,
        };
        if (step.beforeMessage) out.beforeInstructorMessage = step.beforeMessage;
        if (step.questionText) out.question = step.questionText;
        if (step.followUpMessage) out.followUpInstructorMessage = step.followUpMessage;
        if (gradingSpec) {
          const spec = { ...gradingSpec };
          delete spec.followUpCorrect;
          delete spec.followUpIncorrect;
          if (!spec.followUpContent) {
            spec.followUpContent = "Instructor analysis and community comparison placeholder.";
          }
          out.gradingSpecJson = spec;
        }
        if (step.options && step.options.length > 0) {
          out.options = step.options.map((o: any) => ({
            optionKey: o.optionKey,
            label: o.label,
            displayOrder: o.displayOrder,
            value: o.valueJson ?? { optionKey: o.optionKey },
          }));
        }
        // Append top-level runtime fields for ACTION_STEP (from gradingSpec.runtime)
        if (gradingSpec?.runtime) {
          const rt = gradingSpec.runtime as Record<string, unknown>;
          if (rt.scenarioProviderKey) out.scenarioProviderKey = rt.scenarioProviderKey;
          if (rt.evaluatorKey) out.evaluatorKey = rt.evaluatorKey;
          if (rt.revealLayerKeys) out.revealLayerKeys = rt.revealLayerKeys;
          out.continuationKey = rt.continuationKey ?? null;
          if (rt.displayCategory) out.displayCategory = rt.displayCategory;
        }
        return out;
      }),
      curriculumVersion: lesson.curriculumVersion ?? "poker_lessons_full_15_v1",
      role: lesson.role,
      repeatable: lesson.repeatable,
    };

    const json = JSON.stringify(config, null, 4);
    await fs.writeFile(outPath, json, { encoding: "utf8" });
    console.log(`Wrote: ${outPath}`);
  }
}

recover()
  .then(() => disconnectPrisma())
  .catch(async (err) => {
    console.error(err);
    await disconnectPrisma();
    process.exit(1);
  });


