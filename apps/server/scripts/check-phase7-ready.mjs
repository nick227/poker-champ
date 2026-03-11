#!/usr/bin/env node
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    file: "",
    minHandCompletionRate: Number(process.env.PHASE7_MIN_HAND_COMPLETION_RATE ?? "0.98"),
    requireParityPairs: Number(process.env.PHASE7_REQUIRE_PARITY_PAIRS ?? "1"),
    deadPathBaseline: Number(process.env.PHASE7_DEAD_PATH_BASELINE ?? ""),
    maxDeadPathCandidates: Number(process.env.PHASE7_MAX_DEAD_PATH_CANDIDATES ?? "999999"),
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
    if (token === "--require-parity-pairs") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n)) args.requireParityPairs = n;
      i += 1;
      continue;
    }
    if (token === "--dead-path-baseline") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n)) args.deadPathBaseline = n;
      i += 1;
      continue;
    }
    if (token === "--max-dead-path-candidates") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n)) args.maxDeadPathCandidates = n;
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/check-phase7-ready.mjs --file <logfile> " +
          "[--min-hand-completion-rate <n>] [--require-parity-pairs <n>] " +
          "[--dead-path-baseline <n>] [--max-dead-path-candidates <n>]",
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

function runAnalyzer(analyzerScript, file) {
  return execFileSync(process.execPath, [analyzerScript, "--file", file], {
    encoding: "utf8",
  });
}

function runDeadPathAnalyzer(scriptPath) {
  const out = execFileSync(process.execPath, [scriptPath], { encoding: "utf8" });
  const m = out.match(/CandidateCount=(\d+)/);
  return {
    stdout: out,
    candidateCount: m ? Number(m[1]) : NaN,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const analyzer = path.resolve(scriptDir, "analyze-game-bugs-timeouts.mjs");
  const deadPathAnalyzer = path.resolve(scriptDir, "analyze-phase7-dead-path-candidates.mjs");
  const fullFile = path.resolve(process.cwd(), args.file);

  const stdout = runAnalyzer(analyzer, fullFile);
  process.stdout.write(stdout);

  const metrics = parseMetrics(stdout);
  const violations = [];
  const failIfGtZero = [
    "tableStalled",
    "tableStalledMissingReason",
    "tableStalledMissingReasonConnectedHuman",
    "stallRecoveryRedrive",
    "timeoutDoubleFires",
    "timeoutWithMissingDeadline",
    "deadlineOutsideWaiting",
    "waitingHumanMissingDeadline",
    "waitingHumanNoNeedsAction",
    "toActMismatchCount",
    "decisionRuntimeMismatches",
  ];

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

  const decisionRuntimePairs = getNumber(metrics, "decisionRuntimePairs");
  if (!Number.isFinite(decisionRuntimePairs)) {
    violations.push("decisionRuntimePairs missing");
  } else if (decisionRuntimePairs < args.requireParityPairs) {
    violations.push(
      `decisionRuntimePairs=${decisionRuntimePairs} (must be >= ${args.requireParityPairs})`,
    );
  }

  const deadPathResult = runDeadPathAnalyzer(deadPathAnalyzer);
  process.stdout.write(deadPathResult.stdout);

  if (!Number.isFinite(deadPathResult.candidateCount)) {
    violations.push("dead path candidate count missing");
  } else {
    if (deadPathResult.candidateCount > args.maxDeadPathCandidates) {
      violations.push(
        `deadPathCandidates=${deadPathResult.candidateCount} (must be <= ${args.maxDeadPathCandidates})`,
      );
    }
    if (Number.isFinite(args.deadPathBaseline) && deadPathResult.candidateCount > args.deadPathBaseline) {
      violations.push(
        `deadPathCandidates=${deadPathResult.candidateCount} (must not exceed baseline ${args.deadPathBaseline})`,
      );
    }
  }

  if (violations.length > 0) {
    console.error("\nPHASE7_READY=FAIL");
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }

  console.log("\nPHASE7_READY=PASS");
}

main();
