import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TableSnapshotPayloadSchema, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { CANONICAL_LESSON_SNAPSHOT_VERSION } from "@poker-champ/realtime-contract";
import {
  getAllowedActions,
  normalizeActionStepSnapshot,
  validateActionStepSnapshot,
} from "../apps/server/src/lessons/normalizeActionStepSnapshot.js";

type StepConfigStep = {
  id: string;
  type: "INFO_STEP" | "MCQ_STEP" | "ACTION_STEP";
  snapshotPath?: string;
  gradingSpecJson?: { expectedAction?: string } & Record<string, unknown>;
};

type LessonStepConfig = {
  lessonId: string;
  steps: StepConfigStep[];
};

type AuditResult = {
  lessonId: string;
  stepId: string;
  version: number | "missing";
  valid: boolean;
  error?: string;
  normalized: boolean;
};

type AuditSummary = {
  lessonsScanned: number;
  actionStepSnapshots: number;
  normalizedLegacy: number;
  warnings: number;
  errors: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = path.join(ROOT, "content", "lessons", "content");

async function readJson<T>(targetPath: string): Promise<T> {
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw) as T;
}

async function auditLesson(lessonDir: string): Promise<AuditResult[]> {
  const configPath = path.join(lessonDir, "step-config.json");
  let config: LessonStepConfig;
  try {
    config = await readJson<LessonStepConfig>(configPath);
  } catch (err) {
    const lessonId = path.basename(lessonDir);
    return [
      {
        lessonId,
        stepId: "<config>",
        version: "missing",
        valid: false,
        error: `Failed to read step-config.json: ${err instanceof Error ? err.message : String(err)}`,
        normalized: false,
      },
    ];
  }

  const results: AuditResult[] = [];
  const lessonId = config.lessonId ?? path.basename(lessonDir);

  for (const step of config.steps) {
    if (step.type !== "ACTION_STEP" || !step.snapshotPath) continue;

    const snapshotPath = path.join(lessonDir, step.snapshotPath);
    let snapshot: TableSnapshotPayload;
    try {
      const raw = await readJson<unknown>(snapshotPath);
      snapshot = TableSnapshotPayloadSchema.parse(raw);
    } catch (err) {
      results.push({
        lessonId,
        stepId: step.id,
        version: "missing",
        valid: false,
        error: `Failed to read/parse snapshot at ${step.snapshotPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        normalized: false,
      });
      continue;
    }

    const version = snapshot.lessonSnapshotVersion ?? "missing";
    const versionNum = typeof version === "number" ? version : 0;
    const expectedAction =
      typeof step.gradingSpecJson?.expectedAction === "string"
        ? step.gradingSpecJson.expectedAction.trim()
        : "";
    if (!expectedAction) {
      results.push({
        lessonId,
        stepId: step.id,
        version: versionNum || "missing",
        valid: false,
        error: "Missing gradingSpecJson.expectedAction for ACTION_STEP",
        normalized: false,
      });
      continue;
    }

    const alreadyCanonical = versionNum >= CANONICAL_LESSON_SNAPSHOT_VERSION;
    const context = { lessonId, stepId: step.id };
    let valid = false;
    let error: string | undefined;
    let effectiveSnapshot: TableSnapshotPayload | undefined;
    try {
      if (alreadyCanonical) {
        validateActionStepSnapshot(snapshot, expectedAction, context);
        effectiveSnapshot = snapshot;
      } else {
        effectiveSnapshot = normalizeActionStepSnapshot(snapshot, expectedAction, context);
      }
      valid = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (valid && effectiveSnapshot) {
      const allowed = getAllowedActions(effectiveSnapshot);
      const expectedUpper = expectedAction.toUpperCase();
      if (!allowed.has(expectedUpper)) {
        valid = false;
        error = `expectedAction ${expectedAction} not in allowedActions(snapshot); allowed: ${[...allowed].sort().join(", ") || "none"}`;
      }
    }
    results.push({
      lessonId,
      stepId: step.id,
      version: versionNum || "missing",
      valid,
      error,
      normalized: !alreadyCanonical && valid,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true });
  const lessonDirs = entries
    .filter((e) => e.isDirectory() && /^L\d+/i.test(e.name))
    .map((e) => path.join(CONTENT_ROOT, e.name))
    .sort();

  const allResults: AuditResult[] = [];
  for (const lessonDir of lessonDirs) {
    const results = await auditLesson(lessonDir);
    allResults.push(...results);
  }

  const configErrors = allResults.filter((r) => r.stepId === "<config>");
  const stepResults = allResults.filter((r) => r.stepId !== "<config>");
  const lessonsScanned = lessonDirs.length;
  const errorCount = configErrors.length + stepResults.filter((r) => !r.valid).length;

  const mixedVersionLessons: string[] = [];
  const byLesson = new Map<string, AuditResult[]>();
  for (const r of stepResults) {
    const list = byLesson.get(r.lessonId) ?? [];
    list.push(r);
    byLesson.set(r.lessonId, list);
  }
  for (const [lid, results] of byLesson) {
    const versions = results.map((r) => (r.version === "missing" ? 1 : (r.version as number)));
    const hasV1 = versions.some((v) => v < CANONICAL_LESSON_SNAPSHOT_VERSION);
    const hasV2 = versions.some((v) => v >= CANONICAL_LESSON_SNAPSHOT_VERSION);
    if (hasV1 && hasV2) mixedVersionLessons.push(lid);
  }
  const summary: AuditSummary = {
    lessonsScanned,
    actionStepSnapshots: stepResults.length,
    normalizedLegacy: stepResults.filter((r) => r.normalized).length,
    warnings: mixedVersionLessons.length,
    errors: errorCount,
  };

  for (const r of allResults) {
    const versionLabel = r.version === "missing" ? "missing" : `version=${r.version}`;
    // eslint-disable-next-line no-console
    console.log(`${r.lessonId} ${r.stepId} (${versionLabel})`);
    if (r.valid) {
      // eslint-disable-next-line no-console
      console.log("✓ valid");
    } else {
      // eslint-disable-next-line no-console
      console.log(`error: ${r.error ?? "unknown"}`);
    }
  }

  if (mixedVersionLessons.length > 0) {
    // eslint-disable-next-line no-console
    console.log("\n--- Mixed snapshot versions (partial migration?) ---");
    for (const lid of mixedVersionLessons.sort()) {
      const steps = (byLesson.get(lid) ?? []).sort((a, b) => a.stepId.localeCompare(b.stepId));
      // eslint-disable-next-line no-console
      console.log(`Lesson ${lid} contains both version 1 and version 2 snapshots`);
      for (const s of steps) {
        const vLabel = s.version === "missing" ? "version=1" : `version=${s.version}`;
        // eslint-disable-next-line no-console
        console.log(`  ${s.stepId} (${vLabel})`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log("\n--- Summary ---");
  // eslint-disable-next-line no-console
  console.log(`Lessons scanned: ${summary.lessonsScanned}`);
  // eslint-disable-next-line no-console
  console.log(`ACTION_STEP snapshots: ${summary.actionStepSnapshots}`);
  // eslint-disable-next-line no-console
  console.log(`Normalized (legacy): ${summary.normalizedLegacy}`);
  // eslint-disable-next-line no-console
  console.log(`Warnings: ${summary.warnings}`);
  // eslint-disable-next-line no-console
  console.log(`Errors: ${summary.errors}`);

  if (summary.errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("lessons:audit failed:", err);
  process.exit(1);
});

