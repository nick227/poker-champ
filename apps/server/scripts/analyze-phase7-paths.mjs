#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {
    outDir: "",
    repoRoot: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--out-dir") {
      out.outDir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--repo-root") {
      out.repoRoot = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/analyze-phase7-paths.mjs [--out-dir <dir>] [--repo-root <dir>]",
      );
      process.exit(0);
    }
  }
  return out;
}

function runRg(cwd, pattern, targets) {
  const args = ["-n", pattern, ...targets];
  const res = spawnSync("rg", args, { cwd, encoding: "utf8" });
  if (res.error) {
    throw new Error(`Failed to run rg: ${res.error.message}`);
  }
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`rg failed (status ${res.status}): ${res.stderr || ""}`.trim());
  }
  return (res.stdout || "").trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).filter(Boolean).length;
}

function countMessageMatches(text, msgName) {
  if (!text) return 0;
  const needle = msgName;
  return text.split(/\r?\n/).filter((line) => line.includes(needle)).length;
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultRepoRoot = path.resolve(scriptDir, "../../..");
  const repoRoot = path.resolve(args.repoRoot || defaultRepoRoot);
  const outDir = path.resolve(repoRoot, args.outDir || "var/logs");
  ensureDir(outDir);

  const entryPattern =
    "startHand\\(|advanceStreetOrShowdown\\(|finishHandByLastStanding\\(|finishHandShowdownWithSidePots\\(|maybeActForBot\\(|ensureHumanTurnTimerForCurrentActor\\(|requestDrive\\(";
  const lifecyclePattern =
    "executeHandLifecyclePlans|LIFECYCLE_PLAN_EXECUTED|MAYBE_AUTOMATE_TURN|TRANSITION_TO_WAITING|SCHEDULE_NEXT_HAND";

  const entryTargets = [
    "apps/server/src/engine/Dealer.ts",
    "apps/server/src/engine/dealer",
    "apps/server/src/rooms/PokerRoom.ts",
  ];
  const lifecycleTargets = ["apps/server/src/engine"];

  const entryOutput = runRg(repoRoot, entryPattern, entryTargets);
  const lifecycleOutput = runRg(repoRoot, lifecyclePattern, lifecycleTargets);

  const entryPath = path.join(outDir, "phase7_stepf_entrypoints.txt");
  const lifecyclePath = path.join(outDir, "phase7_stepf_lifecycle_paths.txt");
  fs.writeFileSync(entryPath, entryOutput ? `${entryOutput}\n` : "", "utf8");
  fs.writeFileSync(lifecyclePath, lifecycleOutput ? `${lifecycleOutput}\n` : "", "utf8");

  const reportPath = path.join(outDir, "phase7_stepf_report.md");
  const report = [
    "# Phase 7 Step F Path Inventory",
    "",
    `GeneratedAt: ${new Date().toISOString()}`,
    `RepoRoot: ${repoRoot}`,
    "",
    "## Counts",
    "",
    `- EntryPointMatches: ${countLines(entryOutput)}`,
    `- LifecycleMatches: ${countLines(lifecycleOutput)}`,
    `- requestDriveMatches: ${countMessageMatches(entryOutput, "requestDrive(")}`,
    `- maybeActForBotMatches: ${countMessageMatches(entryOutput, "maybeActForBot(")}`,
    `- ensureHumanTurnTimerMatches: ${countMessageMatches(entryOutput, "ensureHumanTurnTimerForCurrentActor(")}`,
    "",
    "## Artifacts",
    "",
    `- Entry points: ${entryPath}`,
    `- Lifecycle paths: ${lifecyclePath}`,
    `- This report: ${reportPath}`,
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Wrote: ${entryPath}`);
  console.log(`Wrote: ${lifecyclePath}`);
  console.log(`Wrote: ${reportPath}`);
}

main();
