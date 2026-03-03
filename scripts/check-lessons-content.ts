import fs from "node:fs/promises";
import path from "node:path";
import { TableSnapshotPayloadSchema } from "@poker-champ/realtime-contract";

const ROOT = process.cwd();
const CONTENT_ROOT = path.resolve(ROOT, "content/lessons/content");

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function runtimeConfigFromStep(step) {
  const gradingSpec = asObject(step.gradingSpecJson);
  return asObject(gradingSpec?.runtime);
}

function hasCapabilityConfig(step) {
  const runtime = runtimeConfigFromStep(step);
  return Boolean(
    runtime?.scenarioProviderKey ||
      runtime?.evaluatorKey ||
      (Array.isArray(runtime?.revealLayerKeys) && runtime.revealLayerKeys.length > 0) ||
      runtime?.continuationKey
  );
}

function parseJson(raw) {
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function validateSnapshotBasicShape(snapshotJson, label) {
  const obj = asObject(snapshotJson);
  if (!obj) throw new Error(`${label} snapshot must be an object`);
  if (!isPositiveInt(obj.version)) throw new Error(`${label} snapshot.version must be positive int`);
  if (!asObject(obj.table)) throw new Error(`${label} snapshot.table is required`);
  if (!asObject(obj.hand)) throw new Error(`${label} snapshot.hand is required`);
  if (!Array.isArray(obj.seats)) throw new Error(`${label} snapshot.seats must be an array`);
  if (!asObject(obj.hero)) throw new Error(`${label} snapshot.hero is required`);
}

function parseLeadingHandToken(title) {
  if (!isNonEmptyString(title)) return null;
  const match = title.trim().match(/^([2-9TJQKA]{2})(s|o)?\b/i);
  if (!match) return null;
  return { ranks: match[1].toUpperCase(), suitedness: (match[2] ?? "").toLowerCase() };
}

function heroMatchesHandToken(heroHoleCards, handToken, suitedness = "") {
  if (!Array.isArray(heroHoleCards) || heroHoleCards.length < 2) return false;
  const heroRanks = heroHoleCards.slice(0, 2).map((card) => String(card).charAt(0).toUpperCase());
  const heroSuits = heroHoleCards.slice(0, 2).map((card) => String(card).charAt(1).toLowerCase());
  if (handToken[0] === handToken[1]) {
    return heroRanks[0] === handToken[0] && heroRanks[1] === handToken[1];
  }
  const expected = handToken.split("").sort().join("");
  const actual = heroRanks.sort().join("");
  if (actual !== expected) return false;
  if (!suitedness) return true;
  const isSuited = heroSuits[0] === heroSuits[1];
  return suitedness === "s" ? isSuited : !isSuited;
}

function countAllInOpponents(snapshotJson) {
  const heroSeat = snapshotJson?.hero?.seat;
  const seats = Array.isArray(snapshotJson?.seats) ? snapshotJson.seats : [];
  return seats.filter(
    (seat) => seat?.occupied === true && seat?.seat !== heroSeat && String(seat?.status).toUpperCase() === "ALL_IN",
  ).length;
}

function validateTitleSemanticConsistency(snapshotJson, title, dirName, stepId) {
  const handToken = parseLeadingHandToken(title);
  if (handToken) {
    const heroHoleCards = snapshotJson?.hero?.holeCards;
    if (!heroMatchesHandToken(heroHoleCards, handToken.ranks, handToken.suitedness)) {
      throw new Error(
        `${dirName}:${stepId} hero hole cards ${JSON.stringify(heroHoleCards)} do not match title token ${handToken.ranks}${handToken.suitedness}`,
      );
    }
  }

  const normalizedTitle = String(title ?? "").toLowerCase();
  const street = String(snapshotJson?.hand?.street ?? "").toUpperCase();
  const allInOpponents = countAllInOpponents(snapshotJson);

  if (normalizedTitle.includes("two all-ins") || normalizedTitle.includes("double all-in")) {
    if (allInOpponents < 2) {
      throw new Error(`${dirName}:${stepId} expected at least 2 ALL_IN opponents for "${title}", found ${allInOpponents}`);
    }
  } else if (normalizedTitle.includes("all-in")) {
    if (allInOpponents < 1) {
      throw new Error(`${dirName}:${stepId} expected at least 1 ALL_IN opponent for "${title}", found ${allInOpponents}`);
    }
  }

  if (normalizedTitle.includes("turn") && street !== "TURN") {
    throw new Error(`${dirName}:${stepId} title implies TURN but snapshot street is ${street || "UNKNOWN"}`);
  }
  if (normalizedTitle.includes("river") && street !== "RIVER") {
    throw new Error(`${dirName}:${stepId} title implies RIVER but snapshot street is ${street || "UNKNOWN"}`);
  }
  if (normalizedTitle.includes("utg") && street !== "PREFLOP") {
    throw new Error(`${dirName}:${stepId} title implies PREFLOP/UTG context but snapshot street is ${street || "UNKNOWN"}`);
  }
  if (normalizedTitle.includes("limper") && street !== "PREFLOP") {
    throw new Error(`${dirName}:${stepId} title implies limper preflop context but snapshot street is ${street || "UNKNOWN"}`);
  }

  if (normalizedTitle.includes("two limpers")) {
    const bb = Number(snapshotJson?.table?.bigBlindCents ?? 0);
    const heroSeat = snapshotJson?.hero?.seat;
    const seats = Array.isArray(snapshotJson?.seats) ? snapshotJson.seats : [];
    const limpers = seats.filter(
      (seat) =>
        seat?.occupied === true &&
        seat?.seat !== heroSeat &&
        Number(seat?.committedCents ?? 0) >= bb &&
        String(seat?.status).toUpperCase() !== "FOLDED",
    ).length;
    if (limpers < 2) {
      throw new Error(`${dirName}:${stepId} expected at least 2 limpers for "${title}", found ${limpers}`);
    }
  }
}

function validateTwoAllInsScenario(snapshotJson, title, dirName, stepId) {
  const handToken = parseLeadingHandToken(title);
  if (!handToken || !String(title).toLowerCase().includes("two all-ins")) return;

  const heroHoleCards = snapshotJson?.hero?.holeCards;
  if (!heroMatchesHandToken(heroHoleCards, handToken.ranks, handToken.suitedness)) {
    throw new Error(
      `${dirName}:${stepId} hero hole cards ${JSON.stringify(heroHoleCards)} do not match title token ${handToken.ranks}${handToken.suitedness}`,
    );
  }

  const allInOpponents = countAllInOpponents(snapshotJson);
  if (allInOpponents < 2) {
    throw new Error(`${dirName}:${stepId} expected at least 2 ALL_IN opponents for "${title}", found ${allInOpponents}`);
  }
}

async function listLessonDirs() {
  const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name);
}

function validateTopLevel(config, dirName) {
  if (!asObject(config)) throw new Error(`${dirName}: config must be an object`);
  if (!isNonEmptyString(config.lessonId)) throw new Error(`${dirName}: lessonId required`);
  if (!isNonEmptyString(config.title)) throw new Error(`${dirName}: title required`);
  if (!["MODULE_A", "MODULE_B", "MODULE_C"].includes(config.moduleCode)) {
    throw new Error(`${dirName}: moduleCode must be canonical module code`);
  }
  if (!["teaches", "drills", "tests"].includes(config.role)) {
    throw new Error(`${dirName}: role must be one of teaches|drills|tests`);
  }
  if (typeof config.repeatable !== "boolean") {
    throw new Error(`${dirName}: repeatable must be boolean`);
  }
  if (!isPositiveInt(config.recommendedOrder)) {
    throw new Error(`${dirName}: recommendedOrder must be positive int`);
  }
  if (!isNonEmptyString(config.curriculumVersion)) {
    throw new Error(`${dirName}: curriculumVersion is required`);
  }
  if (!isPositiveInt(config.version)) throw new Error(`${dirName}: version must be positive int`);
  if (!Array.isArray(config.steps) || config.steps.length === 0) {
    throw new Error(`${dirName}: steps must be a non-empty array`);
  }
}

function validateStepShape(step, dirName) {
  if (!asObject(step)) throw new Error(`${dirName}: each step must be an object`);
  if (!isNonEmptyString(step.id)) throw new Error(`${dirName}: step.id required`);
  if (!isPositiveInt(step.sequence)) throw new Error(`${dirName}:${step.id} sequence must be positive int`);
  if (!["INFO_STEP", "MCQ_STEP", "ACTION_STEP"].includes(step.type)) {
    throw new Error(`${dirName}:${step.id} invalid step type`);
  }
  if (!isPositiveInt(step.snapshotVersion)) {
    throw new Error(`${dirName}:${step.id} snapshotVersion must be positive int`);
  }
  if (!isPositiveInt(step.gradingVersion)) {
    throw new Error(`${dirName}:${step.id} gradingVersion must be positive int`);
  }
  if (step.type === "MCQ_STEP" && (!Array.isArray(step.options) || step.options.length < 2)) {
    throw new Error(`${dirName}:${step.id} MCQ_STEP requires at least 2 options`);
  }
  if (hasCapabilityConfig(step)) {
    const runtime = runtimeConfigFromStep(step);
    if (!isNonEmptyString(runtime?.scenarioProviderKey) || !isNonEmptyString(runtime?.evaluatorKey)) {
      throw new Error(
        `${dirName}:${step.id} capability-configured step requires gradingSpecJson.runtime.scenarioProviderKey and gradingSpecJson.runtime.evaluatorKey`,
      );
    }
  }
}

async function validateLessonDir(dirName) {
  const lessonDir = path.resolve(CONTENT_ROOT, dirName);
  const configPath = path.resolve(lessonDir, "step-config.json");
  const raw = await fs.readFile(configPath, "utf8");
  const config = parseJson(raw);

  validateTopLevel(config, dirName);

  if (config.lessonId !== dirName) {
    throw new Error(`${dirName}: lessonId must match directory name`);
  }

  const seenIds = new Set();
  for (const step of config.steps) {
    validateStepShape(step, dirName);
    if (seenIds.has(step.id)) {
      throw new Error(`${dirName}: duplicate step id ${step.id}`);
    }
    seenIds.add(step.id);

    if (isNonEmptyString(step.snapshotPath)) {
      const snapshotPath = path.resolve(lessonDir, step.snapshotPath);
      const snapshotRaw = await fs.readFile(snapshotPath, "utf8");
      const snapshotJson = parseJson(snapshotRaw);
      validateSnapshotBasicShape(snapshotJson, `${dirName}:${step.id}`);
      const result = TableSnapshotPayloadSchema.safeParse(snapshotJson);
      if (!result.success && process.env.LESSONS_STRICT_SNAPSHOT === "1") {
        throw new Error(`${dirName}:${step.id} snapshot invalid at ${step.snapshotPath}`);
      }
      const resolvedVersion = result.success ? result.data.version : snapshotJson.version;
      if (resolvedVersion !== step.snapshotVersion) {
        throw new Error(`${dirName}:${step.id} snapshotVersion mismatch (${step.snapshotVersion} != ${resolvedVersion})`);
      }
      validateTitleSemanticConsistency(snapshotJson, config.title, dirName, step.id);
      validateTwoAllInsScenario(snapshotJson, config.title, dirName, step.id);
    }
  }

  return {
    lessonId: config.lessonId,
    stepCount: config.steps.length,
  };
}

async function main() {
  const dirs = await listLessonDirs();
  if (dirs.length === 0) {
    throw new Error("No lesson content directories found");
  }

  const summaries = [];
  for (const dir of dirs) {
    const summary = await validateLessonDir(dir);
    summaries.push(summary);
  }

  console.log(`Lesson content validation passed for ${summaries.length} lessons.`);
  for (const summary of summaries) {
    console.log(`- ${summary.lessonId}: ${summary.stepCount} steps`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

