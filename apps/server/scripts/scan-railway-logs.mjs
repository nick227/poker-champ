#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function usage() {
  console.log(`Usage:
  node apps/server/scripts/scan-railway-logs.mjs [options] [-- <railway log args>]

Examples:
  node apps/server/scripts/scan-railway-logs.mjs --duration-ms 25000 -- --service poker-server --environment production
  pnpm --dir apps/server analyze:railway -- --duration-ms 20000 -- --service poker-server

Options:
  --duration-ms <n>                 Capture window in ms (default: 20000)
  --out-file <path>                 Output log path (default: var/logs/railway_capture_<ts>.log)
  --railway-bin <name>              Railway executable (default: railway)
  --no-filter-since-start           Keep backlog lines older than capture start
  --min-hands-started <n>           Canary threshold (default: 5)
  --min-hand-completion-rate <n>    Canary threshold (default: 0.95)
  --skip-phase4                     Skip phase4 gate check
  --skip-canary                     Skip canary check
  --strict                          Exit non-zero if phase4/canary fail
  -h, --help                        Show help

Notes:
  - This script runs "railway logs" and forcibly ends capture after --duration-ms.
  - Railway CLI must be installed and authenticated ("railway login").
`);
}

function parseArgs(argv) {
  const out = {
    durationMs: 20_000,
    outFile: "",
    railwayBin: "railway",
    filterSinceStart: true,
    minHandsStarted: 5,
    minHandCompletionRate: 0.95,
    skipPhase4: false,
    skipCanary: false,
    strict: false,
    railwayArgs: [],
  };

  let passthrough = false;
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      passthrough = true;
      continue;
    }
    if (passthrough) {
      out.railwayArgs.push(token);
      continue;
    }
    if (token === "--duration-ms") {
      out.durationMs = Number(argv[++i] ?? out.durationMs);
      continue;
    }
    if (token === "--out-file") {
      out.outFile = argv[++i] ?? out.outFile;
      continue;
    }
    if (token === "--railway-bin") {
      out.railwayBin = argv[++i] ?? out.railwayBin;
      continue;
    }
    if (token === "--no-filter-since-start") {
      out.filterSinceStart = false;
      continue;
    }
    if (token === "--min-hands-started") {
      out.minHandsStarted = Number(argv[++i] ?? out.minHandsStarted);
      continue;
    }
    if (token === "--min-hand-completion-rate") {
      out.minHandCompletionRate = Number(argv[++i] ?? out.minHandCompletionRate);
      continue;
    }
    if (token === "--skip-phase4") {
      out.skipPhase4 = true;
      continue;
    }
    if (token === "--skip-canary") {
      out.skipCanary = true;
      continue;
    }
    if (token === "--strict") {
      out.strict = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!Number.isFinite(out.durationMs) || out.durationMs <= 0) {
    throw new Error("--duration-ms must be > 0");
  }
  if (!Number.isFinite(out.minHandsStarted) || out.minHandsStarted < 0) {
    throw new Error("--min-hands-started must be >= 0");
  }
  if (
    !Number.isFinite(out.minHandCompletionRate) ||
    out.minHandCompletionRate <= 0 ||
    out.minHandCompletionRate > 1
  ) {
    throw new Error("--min-hand-completion-rate must be in (0,1]");
  }
  return out;
}

function runOrCapture(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n[railway-scan] $ ${printable}`);
  const res = spawnSync(command, args, {
    shell: process.platform === "win32",
    encoding: "utf8",
    ...options,
  });
  return res;
}

function summarizeRawSignals(text) {
  const count = (needle) => (text.match(new RegExp(needle, "g")) ?? []).length;
  return {
    tableStalled: count('"msg":"TABLE_STALLED"'),
    stallRedrive: count('"msg":"TABLE_STALLED_RECOVERY_REDRIVE"'),
    parityMismatch: count('"msg":"ENGINE_PARITY_MISMATCH"'),
    runtimeMetrics: count('"msg":"DEALER_RUNTIME_METRICS"'),
  };
}

function parseEpochMsCandidate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return null;
}

function extractLineTimeMs(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const direct =
        parseEpochMsCandidate(parsed?.time) ??
        parseEpochMsCandidate(parsed?.ts) ??
        parseEpochMsCandidate(parsed?.timestamp);
      return direct;
    } catch {
      const m = trimmed.match(/"time"\s*:\s*(\d{10,13})/);
      if (m?.[1]) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }
  }
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s/);
  if (isoPrefix?.[1]) {
    const d = Date.parse(isoPrefix[1]);
    if (Number.isFinite(d)) return d;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "../../..");
  const outDir = path.resolve(repoRoot, "var/logs");
  fs.mkdirSync(outDir, { recursive: true });

  const defaultOut = path.join(
    outDir,
    `railway_capture_${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
  );
  const outFile = args.outFile
    ? path.resolve(repoRoot, args.outFile)
    : defaultOut;
  const captureStartMs = Date.now();

  const railwayCmdArgs = ["logs", ...args.railwayArgs];
  const capture = runOrCapture(args.railwayBin, railwayCmdArgs, {
    cwd: repoRoot,
    timeout: args.durationMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  const raw = `${capture.stdout ?? ""}${capture.stderr ?? ""}`.trim();
  const rawLines = raw.length ? raw.split(/\r?\n/) : [];
  let filteredLines = rawLines;
  let droppedBacklog = 0;
  if (args.filterSinceStart) {
    filteredLines = rawLines.filter((line) => {
      const lineMs = extractLineTimeMs(line);
      if (lineMs == null) return true;
      const keep = lineMs >= captureStartMs;
      if (!keep) droppedBacklog += 1;
      return keep;
    });
  }
  const filtered = filteredLines.join("\n").trim();
  fs.writeFileSync(outFile, filtered.length ? `${filtered}\n` : "", "utf8");

  if (capture.error && capture.error.code === "ENOENT") {
    throw new Error(`Railway CLI not found: ${args.railwayBin}`);
  }
  if (capture.error && capture.error.code !== "ETIMEDOUT") {
    throw capture.error;
  }
  if (!filtered) {
    throw new Error(`No logs captured. Wrote empty file: ${outFile}`);
  }

  const summary = summarizeRawSignals(filtered);
  console.log("\n[railway-scan] Raw signal counts");
  console.log(`tableStalled=${summary.tableStalled}`);
  console.log(`stallRecoveryRedrive=${summary.stallRedrive}`);
  console.log(`engineParityMismatch=${summary.parityMismatch}`);
  console.log(`dealerRuntimeMetrics=${summary.runtimeMetrics}`);
  console.log(`linesCaptured=${rawLines.length}`);
  console.log(`linesWritten=${filteredLines.length}`);
  console.log(`linesDroppedBacklog=${droppedBacklog}`);
  console.log(`outFile=${outFile}`);

  const analyzer = path.resolve(scriptDir, "analyze-game-bugs-timeouts.mjs");
  const phase4Gate = path.resolve(scriptDir, "check-phase4-gate.mjs");
  const canary = path.resolve(scriptDir, "run-canary-validation.mjs");

  const gameBugs = runOrCapture(process.execPath, [analyzer, "--file", outFile], { cwd: repoRoot });
  process.stdout.write(gameBugs.stdout ?? "");
  process.stderr.write(gameBugs.stderr ?? "");

  let failed = false;
  if (!args.skipPhase4) {
    const phase4 = runOrCapture(
      process.execPath,
      [phase4Gate, "--file", outFile, "--min-hand-completion-rate", String(args.minHandCompletionRate)],
      { cwd: repoRoot },
    );
    process.stdout.write(phase4.stdout ?? "");
    process.stderr.write(phase4.stderr ?? "");
    if ((phase4.status ?? 1) !== 0) failed = true;
  }

  if (!args.skipCanary) {
    const canaryRes = runOrCapture(
      process.execPath,
      [
        canary,
        "--file",
        outFile,
        "--min-hands-started",
        String(args.minHandsStarted),
        "--min-hand-completion-rate",
        String(args.minHandCompletionRate),
      ],
      { cwd: repoRoot },
    );
    process.stdout.write(canaryRes.stdout ?? "");
    process.stderr.write(canaryRes.stderr ?? "");
    if ((canaryRes.status ?? 1) !== 0) failed = true;
  }

  if (args.strict && failed) {
    process.exit(1);
  }
}

main();
