#!/usr/bin/env node
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    file: "",
    minHandCompletionRate: Number(process.env.PHASE4_MIN_HAND_COMPLETION_RATE ?? "0.98"),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      args.file = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--min-hand-completion-rate") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n)) args.minHandCompletionRate = n;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/check-phase4-gate.mjs --file <logfile> [--min-hand-completion-rate <n>]",
      );
      process.exit(0);
    }
  }
  if (!args.file) {
    console.error("Missing --file");
    process.exit(1);
  }
  return args;
}

function parseMetrics(stdout) {
  const metrics = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_]*)=(.+)$/);
    if (!m) continue;
    metrics.set(m[1], m[2]);
  }
  return metrics;
}

function getNumber(metrics, key) {
  const raw = metrics.get(key);
  if (raw == null) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const analyzer = path.resolve(scriptDir, "analyze-game-bugs-timeouts.mjs");
  const fullFile = path.resolve(process.cwd(), args.file);

  const stdout = execFileSync(process.execPath, [analyzer, "--file", fullFile], { encoding: "utf8" });
  process.stdout.write(stdout);

  const metrics = parseMetrics(stdout);
  const failIfGtZero = [
    "tableStalled",
    "stallRecoveryRedrive",
    "timeoutDoubleFires",
    "timeoutWithMissingDeadline",
    "deadlineOutsideWaiting",
    "waitingHumanMissingDeadline",
    "waitingHumanNoNeedsAction",
    "toActMismatchCount",
  ];

  const violations = [];
  for (const key of failIfGtZero) {
    const v = getNumber(metrics, key);
    if (!Number.isFinite(v)) {
      violations.push(`${key} missing`);
      continue;
    }
    if (v > 0) violations.push(`${key}=${v} (must be 0)`);
  }

  const handCompletionRate = getNumber(metrics, "handCompletionRate");
  if (!Number.isFinite(handCompletionRate)) {
    violations.push("handCompletionRate missing");
  } else if (handCompletionRate < args.minHandCompletionRate) {
    violations.push(
      `handCompletionRate=${handCompletionRate.toFixed(4)} (must be >= ${args.minHandCompletionRate.toFixed(4)})`,
    );
  }

  if (violations.length > 0) {
    console.error("\nPHASE4_GATE=FAIL");
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }

  console.log("\nPHASE4_GATE=PASS");
}

main();
