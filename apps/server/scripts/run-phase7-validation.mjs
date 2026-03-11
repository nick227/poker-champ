#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {
    runs: Number(process.env.PHASE7_VALIDATION_RUNS ?? "2"),
    hands: Number(process.env.PHASE7_VALIDATION_HANDS ?? "300"),
    sampleRate: Number(process.env.PHASE7_VALIDATION_SAMPLE_RATE ?? "0.25"),
    deadPathBaseline: Number(process.env.PHASE7_DEAD_PATH_BASELINE ?? "9"),
    minHandCompletionRate: Number(process.env.PHASE4_MIN_HAND_COMPLETION_RATE ?? "0.98"),
    outDir: "var/logs",
    testName: "plays many hands without deadlock and preserves per-hand payout conservation",
    prefix: "phase7_authority_flip",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--runs") {
      out.runs = Number(argv[++i] ?? out.runs);
      continue;
    }
    if (token === "--hands") {
      out.hands = Number(argv[++i] ?? out.hands);
      continue;
    }
    if (token === "--sample-rate") {
      out.sampleRate = Number(argv[++i] ?? out.sampleRate);
      continue;
    }
    if (token === "--dead-path-baseline") {
      out.deadPathBaseline = Number(argv[++i] ?? out.deadPathBaseline);
      continue;
    }
    if (token === "--min-hand-completion-rate") {
      out.minHandCompletionRate = Number(argv[++i] ?? out.minHandCompletionRate);
      continue;
    }
    if (token === "--out-dir") {
      out.outDir = argv[++i] ?? out.outDir;
      continue;
    }
    if (token === "--prefix") {
      out.prefix = argv[++i] ?? out.prefix;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/run-phase7-validation.mjs " +
          "[--runs 2] [--hands 300] [--sample-rate 0.25] [--dead-path-baseline 9] " +
          "[--min-hand-completion-rate 0.98] " +
          "[--out-dir var/logs] [--prefix phase7_authority_flip]",
      );
      process.exit(0);
    }
  }

  if (!Number.isFinite(out.runs) || out.runs <= 0) throw new Error("--runs must be > 0");
  if (!Number.isFinite(out.hands) || out.hands <= 0) throw new Error("--hands must be > 0");
  if (!Number.isFinite(out.sampleRate) || out.sampleRate <= 0 || out.sampleRate > 1) {
    throw new Error("--sample-rate must be in (0,1]");
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

function runOrFail(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n[phase7-validate] $ ${printable}`);
  const res = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    ...options,
  });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${printable}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "../../..");
  const outDir = path.resolve(repoRoot, args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const env = {
    ...process.env,
    SOAK_PROFILE: "",
    SOAK_HANDS: String(args.hands),
    SOAK_PROGRESS_EVERY: String(Math.max(10, Math.floor(args.hands / 10))),
    LOG_LEVEL: "info",
    SOAK_HEARTBEAT: "1",
    SOAK_HEARTBEAT_FILE: path.join(outDir, `${args.prefix}_heartbeat.jsonl`),
    ENGINE_DECISION_SAMPLE_RATE: String(args.sampleRate),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  for (let i = 1; i <= args.runs; i += 1) {
    const logBase = `${args.prefix}_run${i}`;
    const logPath = path.join(outDir, `${logBase}.log`);
    const cleanPath = path.join(outDir, `${logBase}.clean.jsonl`);

    const soakCmd = `pnpm exec vitest run apps/server/src/tests/integration/dealer.random-walk.soak.test.ts -t "${args.testName}" *> "${logPath}"`;
    runOrFail(soakCmd, [], { cwd: repoRoot, env });

    runOrFail(
      "pnpm",
      [
        "--dir",
        "apps/server",
        "analyze:phase4:gate",
        "--",
        "--file",
        logPath,
        "--min-hand-completion-rate",
        String(args.minHandCompletionRate),
      ],
      { cwd: repoRoot, env },
    );
    runOrFail(
      "pnpm",
      [
        "--dir",
        "apps/server",
        "analyze:phase7:ready",
        "--",
        "--file",
        logPath,
        "--dead-path-baseline",
        String(args.deadPathBaseline),
        "--min-hand-completion-rate",
        String(args.minHandCompletionRate),
      ],
      { cwd: repoRoot, env },
    );

    const text = fs.readFileSync(logPath, "utf8");
    const jsonLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("{"))
      .join("\n");
    fs.writeFileSync(cleanPath, jsonLines.length ? `${jsonLines}\n` : "", "utf8");

    const parityCount = (jsonLines.match(/"msg":"ENGINE_PARITY"/g) ?? []).length;
    const mismatchCount = (jsonLines.match(/"msg":"ENGINE_PARITY_MISMATCH"/g) ?? []).length;
    if (parityCount <= 0) throw new Error(`${logBase}: ENGINE_PARITY count is 0`);
    if (mismatchCount > 0) throw new Error(`${logBase}: ENGINE_PARITY_MISMATCH count is ${mismatchCount}`);

    console.log(
      `[phase7-validate] ${logBase} PASS | parity=${parityCount} mismatch=${mismatchCount} log=${logPath}`,
    );
  }

  console.log(
    `\n[phase7-validate] COMPLETE | runs=${args.runs} hands=${args.hands} sampleRate=${args.sampleRate} baseline=${args.deadPathBaseline} minHandCompletionRate=${args.minHandCompletionRate}`,
  );
}

main();
