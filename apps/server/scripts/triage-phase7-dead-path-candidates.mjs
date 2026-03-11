#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {
    repoRoot: "",
    input: "",
    outDir: "",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--repo-root") {
      out.repoRoot = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--input") {
      out.input = argv[i + 1] ?? "";
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
        "Usage: node apps/server/scripts/triage-phase7-dead-path-candidates.mjs [--input <file>] [--out-dir <dir>] [--repo-root <dir>]",
      );
      process.exit(0);
    }
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseCandidateLine(line) {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const fileLine = parts[0];
  const methodName = parts[1];
  const code = parts.slice(2).join("\t");
  const m = fileLine.match(/^(.+):(\d+)$/);
  if (!m) return null;
  return {
    file: m[1],
    lineNo: Number(m[2]),
    methodName,
    code,
    raw: line,
  };
}

function classify(c) {
  const code = c.code;
  const method = c.methodName;

  // Constructor wiring/dependency injection and callbacks are not progression authority.
  if (
    code.includes("onAutoActionDiscarded") ||
    code.includes("startHand: () =>") ||
    code.includes("finishHandByLastStanding: () =>") ||
    code.includes("advanceStreetOrShowdown: () =>")
  ) {
    return { bucket: "wiring/no-op wrappers", reason: "constructor or callback wiring" };
  }

  // Wrapper implementations that call orchestrator/service internals.
  if (
    code.includes("this.handOrchestrator.startHand()") ||
    code.includes("this.handOrchestrator.advanceStreetOrShowdown()") ||
    code.includes("this.handOrchestrator.finishHandByLastStanding()") ||
    code.includes("this.handOrchestrator.finishHandShowdownWithSidePots()") ||
    code.includes("this.turnAutomationService.maybeActForBot()")
  ) {
    return { bucket: "wiring/no-op wrappers", reason: "service wrapper implementation" };
  }

  // Direct progression actions from runtime decision branches are next safe routing targets.
  if (
    method === "maybeActForBot" ||
    method === "startHand" ||
    method === "advanceStreetOrShowdown" ||
    method === "finishHandByLastStanding"
  ) {
    if (
      code.includes("await this.startHand()") ||
      code.includes("await this.advanceStreetOrShowdown()") ||
      code.includes("await this.finishHandByLastStanding()") ||
      code.includes("this.maybeActForBot()")
    ) {
      return { bucket: "safe-to-route-now", reason: "direct call in runtime branch" };
    }
  }

  // Remaining entries need manual judgement.
  return { bucket: "needs-manual-review", reason: "context-dependent callsite" };
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(args.repoRoot || path.resolve(scriptDir, "../../.."));
  const outDir = path.resolve(repoRoot, args.outDir || "var/logs");
  ensureDir(outDir);

  const inputPath = path.resolve(
    repoRoot,
    args.input || "var/logs/phase7_stepf_dead_path_candidates.txt",
  );
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  const lines = fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries = lines.map(parseCandidateLine).filter(Boolean);
  const buckets = {
    "safe-to-route-now": [],
    "wiring/no-op wrappers": [],
    "needs-manual-review": [],
  };

  for (const entry of entries) {
    const { bucket, reason } = classify(entry);
    buckets[bucket].push({ ...entry, reason });
  }

  const outJson = path.join(outDir, "phase7_stepf_dead_path_triage.json");
  fs.writeFileSync(outJson, JSON.stringify(buckets, null, 2), "utf8");

  const outMd = path.join(outDir, "phase7_stepf_dead_path_triage.md");
  const summary = [
    "# Phase 7 Dead-Path Triage",
    "",
    `GeneratedAt: ${new Date().toISOString()}`,
    `Input: ${inputPath}`,
    "",
    "## Counts",
    "",
    `- safe-to-route-now: ${buckets["safe-to-route-now"].length}`,
    `- wiring/no-op wrappers: ${buckets["wiring/no-op wrappers"].length}`,
    `- needs-manual-review: ${buckets["needs-manual-review"].length}`,
    "",
    "## Safe To Route Now",
    "",
    ...buckets["safe-to-route-now"].map((e) => `- ${e.file}:${e.lineNo} | ${e.methodName} | ${e.reason}`),
    "",
    "## Wiring / No-Op Wrappers",
    "",
    ...buckets["wiring/no-op wrappers"].map((e) => `- ${e.file}:${e.lineNo} | ${e.methodName} | ${e.reason}`),
    "",
    "## Needs Manual Review",
    "",
    ...buckets["needs-manual-review"].map((e) => `- ${e.file}:${e.lineNo} | ${e.methodName} | ${e.reason}`),
    "",
  ].join("\n");
  fs.writeFileSync(outMd, summary, "utf8");

  console.log(`Wrote: ${outJson}`);
  console.log(`Wrote: ${outMd}`);
  console.log(
    `TriageCounts safe=${buckets["safe-to-route-now"].length} wiring=${buckets["wiring/no-op wrappers"].length} manual=${buckets["needs-manual-review"].length}`,
  );
}

main();
