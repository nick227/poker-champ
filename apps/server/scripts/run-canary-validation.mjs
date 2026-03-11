#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    file: "",
    minHandsStarted: Number(process.env.CANARY_MIN_HANDS_STARTED ?? "20"),
    minHandCompletionRate: Number(process.env.PHASE4_MIN_HAND_COMPLETION_RATE ?? "0.95"),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      args.file = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--min-hands-started") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n)) args.minHandsStarted = n;
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
        "Usage: node apps/server/scripts/run-canary-validation.mjs " +
          "--file <logfile> [--min-hands-started 20] [--min-hand-completion-rate 0.95]",
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

function runNode(scriptPath, args) {
  return execFileSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const analyzer = path.resolve(scriptDir, "analyze-game-bugs-timeouts.mjs");
  const phase4Gate = path.resolve(scriptDir, "check-phase4-gate.mjs");
  const fullFile = path.resolve(process.cwd(), args.file);

  if (!fs.existsSync(fullFile)) {
    console.error(`File not found: ${fullFile}`);
    process.exit(1);
  }

  const analyzerStdout = runNode(analyzer, ["--file", fullFile]);
  process.stdout.write(analyzerStdout);
  const metrics = parseMetrics(analyzerStdout);

  const handsStarted = getNumber(metrics, "handsStarted");
  if (!Number.isFinite(handsStarted) || handsStarted < args.minHandsStarted) {
    console.error(
      `\nCANARY_VALIDATION=FAIL\n- handsStarted=${Number.isFinite(handsStarted) ? handsStarted : "missing"} (must be >= ${args.minHandsStarted})`,
    );
    process.exit(1);
  }

  const text = fs.readFileSync(fullFile, "utf8");
  const parityMismatchCount = (text.match(/"msg":"ENGINE_PARITY_MISMATCH"/g) ?? []).length;
  if (parityMismatchCount > 0) {
    console.error(`\nCANARY_VALIDATION=FAIL\n- ENGINE_PARITY_MISMATCH=${parityMismatchCount} (must be 0)`);
    process.exit(1);
  }

  const gateStdout = runNode(phase4Gate, [
    "--file",
    fullFile,
    "--min-hand-completion-rate",
    String(args.minHandCompletionRate),
  ]);
  process.stdout.write(`\n${gateStdout}`);

  console.log("\nCANARY_VALIDATION=PASS");
}

main();

