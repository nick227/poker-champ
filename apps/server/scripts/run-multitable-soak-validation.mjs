#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {
    runs: Number(process.env.MULTI_TABLE_SOAK_VALIDATION_RUNS ?? "1"),
    tables: Number(process.env.MULTI_TABLE_SOAK_TABLES ?? "4"),
    handsPerTable: Number(process.env.MULTI_TABLE_SOAK_HANDS_PER_TABLE ?? "30"),
    minHandCompletionRate: Number(process.env.PHASE4_MIN_HAND_COMPLETION_RATE ?? "0.95"),
    maxRejectionRate: Number(process.env.MULTI_TABLE_SOAK_MAX_REJECTION_RATE ?? "0.10"),
    outDir: "var/logs",
    testName: "runs concurrent tables without stalls",
    prefix: "multitable_soak_validation",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--runs") {
      out.runs = Number(argv[++i] ?? out.runs);
      continue;
    }
    if (token === "--tables") {
      out.tables = Number(argv[++i] ?? out.tables);
      continue;
    }
    if (token === "--hands-per-table") {
      out.handsPerTable = Number(argv[++i] ?? out.handsPerTable);
      continue;
    }
    if (token === "--min-hand-completion-rate") {
      out.minHandCompletionRate = Number(argv[++i] ?? out.minHandCompletionRate);
      continue;
    }
    if (token === "--max-rejection-rate") {
      out.maxRejectionRate = Number(argv[++i] ?? out.maxRejectionRate);
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
        "Usage: node apps/server/scripts/run-multitable-soak-validation.mjs " +
          "[--runs 1] [--tables 4] [--hands-per-table 30] [--min-hand-completion-rate 0.95] [--max-rejection-rate 0.10] " +
          "[--out-dir var/logs] [--prefix multitable_soak_validation]",
      );
      process.exit(0);
    }
  }

  if (!Number.isFinite(out.runs) || out.runs <= 0) throw new Error("--runs must be > 0");
  if (!Number.isFinite(out.tables) || out.tables <= 0) throw new Error("--tables must be > 0");
  if (!Number.isFinite(out.handsPerTable) || out.handsPerTable <= 0) throw new Error("--hands-per-table must be > 0");
  if (
    !Number.isFinite(out.minHandCompletionRate) ||
    out.minHandCompletionRate <= 0 ||
    out.minHandCompletionRate > 1
  ) {
    throw new Error("--min-hand-completion-rate must be in (0,1]");
  }
  if (!Number.isFinite(out.maxRejectionRate) || out.maxRejectionRate < 0 || out.maxRejectionRate > 1) {
    throw new Error("--max-rejection-rate must be in [0,1]");
  }
  return out;
}

function runOrFail(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n[multitable-soak-validate] $ ${printable}`);
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

  const totalExpectedHands = args.tables * args.handsPerTable;
  const minHandsStarted = Math.max(1, Math.floor(totalExpectedHands * 0.95));
  const env = {
    ...process.env,
    MULTI_TABLE_SOAK_TABLES: String(args.tables),
    MULTI_TABLE_SOAK_HANDS_PER_TABLE: String(args.handsPerTable),
    MULTI_TABLE_SOAK_PROGRESS_EVERY: String(Math.max(5, Math.floor(args.handsPerTable / 2))),
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    TURN_TIMEOUT_TOTAL_MS: process.env.TURN_TIMEOUT_TOTAL_MS ?? "30000",
    BOT_ACTION_DELAY_MIN_MS: process.env.BOT_ACTION_DELAY_MIN_MS ?? "25",
    BOT_ACTION_DELAY_MAX_MS: process.env.BOT_ACTION_DELAY_MAX_MS ?? "150",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  for (let i = 1; i <= args.runs; i += 1) {
    const logBase = `${args.prefix}_run${i}`;
    const logPath = path.join(outDir, `${logBase}.log`);
    const cleanPath = path.join(outDir, `${logBase}.clean.jsonl`);

    const soakCmd =
      `pnpm exec vitest run apps/server/src/rooms/poker-room.multitable.soak.test.ts ` +
      `-t "${args.testName}" *> "${logPath}"`;
    runOrFail(soakCmd, [], { cwd: repoRoot, env });

    runOrFail("pnpm", ["--dir", "apps/server", "analyze:game-bugs", "--file", logPath], {
      cwd: repoRoot,
      env,
    });
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
        "analyze:canary",
        "--",
        "--file",
        logPath,
        "--min-hands-started",
        String(minHandsStarted),
        "--min-hand-completion-rate",
        String(args.minHandCompletionRate),
      ],
      { cwd: repoRoot, env },
    );
    runOrFail("pnpm", ["--dir", "apps/server", "analyze:log-schema", "--file", logPath], {
      cwd: repoRoot,
      env,
    });

    const text = fs.readFileSync(logPath, "utf8");
    const jsonLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("{"))
      .join("\n");
    fs.writeFileSync(cleanPath, jsonLines.length ? `${jsonLines}\n` : "", "utf8");

    const stalledCount = (jsonLines.match(/"msg":"TABLE_STALLED"/g) ?? []).length;
    const redriveCount = (jsonLines.match(/"msg":"TABLE_STALLED_RECOVERY_REDRIVE"/g) ?? []).length;
    const actionAcceptedCount = (jsonLines.match(/"msg":"POKER_ACTION_ACCEPTED"/g) ?? []).length;
    const actionRejectedCount = (jsonLines.match(/"msg":"POKER_ACTION_REJECTED"/g) ?? []).length;
    const actionDecisionCount = actionAcceptedCount + actionRejectedCount;
    const rejectionRate = actionDecisionCount > 0 ? actionRejectedCount / actionDecisionCount : 0;
    if (stalledCount > 0 || redriveCount > 0) {
      throw new Error(`${logBase}: stalled=${stalledCount} redrive=${redriveCount}`);
    }
    if (rejectionRate > args.maxRejectionRate) {
      throw new Error(
        `${logBase}: action rejection rate ${rejectionRate.toFixed(4)} exceeds max ${args.maxRejectionRate.toFixed(4)} ` +
          `(accepted=${actionAcceptedCount} rejected=${actionRejectedCount})`,
      );
    }

    console.log(
      `[multitable-soak-validate] ${logBase} PASS | stalled=${stalledCount} redrive=${redriveCount} ` +
        `accepted=${actionAcceptedCount} rejected=${actionRejectedCount} rejectionRate=${rejectionRate.toFixed(4)} ` +
        `log=${logPath}`,
    );
  }

  console.log(
    `\n[multitable-soak-validate] COMPLETE | runs=${args.runs} tables=${args.tables} handsPerTable=${args.handsPerTable} ` +
      `minHandCompletionRate=${args.minHandCompletionRate} maxRejectionRate=${args.maxRejectionRate}`,
  );
}

main();
