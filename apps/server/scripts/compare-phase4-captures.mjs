#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";

function usage() {
  console.log(`Usage:
  node apps/server/scripts/compare-phase4-captures.mjs --baseline <logfile> --current <logfile>

Runs analyze-game-bugs-timeouts on both files and prints:
  - side-by-side metric comparison
  - Phase 4 exit-gate status
`);
}

function parseArgs(argv) {
  const args = { baseline: "", current: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--baseline") {
      args.baseline = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--current") {
      args.current = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!args.baseline || !args.current) {
    usage();
    process.exit(1);
  }
  return args;
}

function parseAnalyzeOutput(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    out.set(key, value);
  }
  return out;
}

function asNumber(map, key) {
  const raw = map.get(key);
  if (raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function runAnalyzer(filePath) {
  const analyzerPath = path.resolve("scripts/analyze-game-bugs-timeouts.mjs");
  const result = spawnSync(process.execPath, [analyzerPath, "--max-issues", "0", "--file", filePath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    throw new Error(`Analyzer failed for ${filePath}\n${stderr || stdout}`);
  }
  return parseAnalyzeOutput(result.stdout ?? "");
}

function printRow(metric, baseline, current, notes = "") {
  const b = baseline.get(metric) ?? "";
  const c = current.get(metric) ?? "";
  const bn = Number(b);
  const cn = Number(c);
  const delta = Number.isFinite(bn) && Number.isFinite(cn) ? (cn - bn).toFixed(4) : "";
  const deltaOut = delta === "" ? "" : delta;
  console.log(`${metric.padEnd(30)} ${String(b).padStart(10)}  ${String(c).padStart(10)}  ${deltaOut.padStart(10)}  ${notes}`);
}

function main() {
  const args = parseArgs(process.argv);
  const baselinePath = path.resolve(args.baseline);
  const currentPath = path.resolve(args.current);

  const baseline = runAnalyzer(baselinePath);
  const current = runAnalyzer(currentPath);

  console.log("PHASE 4 CAPTURE COMPARISON");
  console.log(`baseline=${baselinePath}`);
  console.log(`current=${currentPath}`);
  console.log("");
  console.log(`${"metric".padEnd(30)} ${"baseline".padStart(10)}  ${"current".padStart(10)}  ${"delta".padStart(10)}  notes`);
  console.log("-".repeat(86));

  const metricRows = [
    ["handsStarted", ""],
    ["handsCompleted", ""],
    ["handCompletionRate", "target ~1.0"],
    ["avgActionsPerHand", "watch for spikes"],
    ["tableStalled", ""],
    ["stallRecoveryRedrive", ""],
    ["stalledPer1kHands", "should decrease"],
    ["timeoutRuntimeCount", ""],
    ["timeoutRuntimePer1kHands", ""],
    ["timeoutDoubleFires", "must be 0"],
    ["timeoutWithMissingDeadline", "must be 0"],
    ["deadlineOutsideWaiting", "must be 0"],
    ["duplicateActionRejects", "non-zero can be normal"],
    ["handIdMismatchRejects", "non-zero can be normal"],
    ["decisionRuntimeMismatches", "must be 0"],
  ];

  for (const [metric, notes] of metricRows) {
    printRow(metric, baseline, current, notes);
  }

  const gateChecks = [
    ["timeoutDoubleFires", 0],
    ["timeoutWithMissingDeadline", 0],
    ["deadlineOutsideWaiting", 0],
    ["decisionRuntimeMismatches", 0],
  ];
  const failures = [];
  for (const [metric, required] of gateChecks) {
    const value = asNumber(current, metric);
    if (value !== required) failures.push(`${metric}=${value} (required ${required})`);
  }
  const completion = asNumber(current, "handCompletionRate");
  if (completion < 0.99) {
    failures.push(`handCompletionRate=${completion} (required >= 0.99)`);
  }

  console.log("");
  if (failures.length === 0) {
    console.log("phase4GateStatus=PASS");
  } else {
    console.log("phase4GateStatus=FAIL");
    for (const f of failures) console.log(`gateFailure=${f}`);
  }
}

main();
