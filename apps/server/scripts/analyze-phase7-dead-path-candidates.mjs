#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_METHODS = [
  "startHand",
  "advanceStreetOrShowdown",
  "finishHandByLastStanding",
  "finishHandShowdownWithSidePots",
  "maybeActForBot",
  "ensureHumanTurnTimerForCurrentActor",
];

function parseArgs(argv) {
  const out = {
    repoRoot: "",
    outDir: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--repo-root") {
      out.repoRoot = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--out-dir") {
      out.outDir = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/analyze-phase7-dead-path-candidates.mjs [--repo-root <dir>] [--out-dir <dir>]",
      );
      process.exit(0);
    }
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isMethodDefinition(line, methodName) {
  return new RegExp(`\\b(private|public|protected)\\s+(async\\s+)?${methodName}\\s*\\(`).test(line);
}

function findMethodRange(lines, methodSignaturePrefix) {
  const startIndex = lines.findIndex((line) => line.includes(methodSignaturePrefix));
  if (startIndex < 0) return null;
  let braceDepth = 0;
  let seenOpen = false;
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        braceDepth += 1;
        seenOpen = true;
      } else if (ch === "}") {
        braceDepth -= 1;
      }
    }
    if (seenOpen && braceDepth === 0) {
      return { start: startIndex + 1, end: i + 1 }; // 1-based line numbers
    }
  }
  return null;
}

function inRange(lineNo, range) {
  if (!range) return false;
  return lineNo >= range.start && lineNo <= range.end;
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(args.repoRoot || path.resolve(scriptDir, "../../.."));
  const outDir = path.resolve(repoRoot, args.outDir || "var/logs");
  ensureDir(outDir);

  const dealerPath = path.join(repoRoot, "apps/server/src/engine/Dealer.ts");
  const text = fs.readFileSync(dealerPath, "utf8");
  const lines = text.split(/\r?\n/);

  const requestDriveRange = findMethodRange(lines, "private requestDrive(");
  const candidates = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];
    for (const methodName of TARGET_METHODS) {
      if (!line.includes(`${methodName}(`)) continue;
      if (isMethodDefinition(line, methodName)) continue;
      if (inRange(lineNo, requestDriveRange)) continue;
      if (line.includes("requestDrive(")) continue;
      if (line.includes("runDriveChecks(")) continue;
      candidates.push({
        lineNo,
        methodName,
        line: line.trim(),
      });
    }
  }

  const outPath = path.join(outDir, "phase7_stepf_dead_path_candidates.txt");
  const reportPath = path.join(outDir, "phase7_stepf_dead_path_report.md");

  const byMethod = new Map();
  for (const c of candidates) {
    byMethod.set(c.methodName, (byMethod.get(c.methodName) ?? 0) + 1);
  }

  const rows = candidates
    .map((c) => `Dealer.ts:${c.lineNo}\t${c.methodName}\t${c.line}`)
    .join("\n");
  fs.writeFileSync(outPath, rows ? `${rows}\n` : "", "utf8");

  const methodSummary = TARGET_METHODS
    .map((name) => `- ${name}: ${byMethod.get(name) ?? 0}`)
    .join("\n");

  const report = [
    "# Phase 7 Step F Dead-Path Candidate Report",
    "",
    `GeneratedAt: ${new Date().toISOString()}`,
    `DealerFile: ${dealerPath}`,
    "",
    "## Notes",
    "",
    "- These are likely ad-hoc progression callsites outside `requestDrive`.",
    "- This is a candidate list for review, not auto-delete authority.",
    "",
    "## Candidate Counts By Method",
    "",
    methodSummary,
    "",
    "## Artifacts",
    "",
    `- Candidate list: ${outPath}`,
    `- This report: ${reportPath}`,
    "",
  ].join("\n");
  fs.writeFileSync(reportPath, report, "utf8");

  console.log(`Wrote: ${outPath}`);
  console.log(`Wrote: ${reportPath}`);
  console.log(`CandidateCount=${candidates.length}`);
}

main();
