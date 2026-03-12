#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {
    runs: Number(process.env.ROOM_SOAK_VALIDATION_RUNS ?? "1"),
    hands: Number(process.env.ROOM_SOAK_VALIDATION_HANDS ?? "60"),
    minHandCompletionRate: Number(process.env.PHASE4_MIN_HAND_COMPLETION_RATE ?? "0.95"),
    outDir: "var/logs",
    testName: "plays many hands without room-level stalls",
    prefix: "room_soak_validation",
    includeRegressions: process.env.ROOM_SOAK_INCLUDE_REGRESSIONS !== "0",
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
    if (token === "--skip-regressions") {
      out.includeRegressions = false;
      continue;
    }
    if (token === "--include-regressions") {
      out.includeRegressions = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log(
        "Usage: node apps/server/scripts/run-room-soak-validation.mjs " +
          "[--runs 1] [--hands 100] [--min-hand-completion-rate 0.95] " +
          "[--out-dir var/logs] [--prefix room_soak_validation] " +
          "[--include-regressions|--skip-regressions]",
      );
      process.exit(0);
    }
  }

  if (!Number.isFinite(out.runs) || out.runs <= 0) throw new Error("--runs must be > 0");
  if (!Number.isFinite(out.hands) || out.hands <= 0) throw new Error("--hands must be > 0");
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
  console.log(`\n[room-soak-validate] $ ${printable}`);
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
    ROOM_SOAK_HANDS: String(args.hands),
    ROOM_SOAK_PROGRESS_EVERY: String(Math.max(10, Math.floor(args.hands / 10))),
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    TURN_TIMEOUT_TOTAL_MS: process.env.TURN_TIMEOUT_TOTAL_MS ?? "30000",
    BOT_ACTION_DELAY_MIN_MS: process.env.BOT_ACTION_DELAY_MIN_MS ?? "25",
    BOT_ACTION_DELAY_MAX_MS: process.env.BOT_ACTION_DELAY_MAX_MS ?? "150",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };

  if (args.includeRegressions) {
    const engineRegressionCmd =
      `pnpm exec vitest run apps/server/src/engine/dealer.auto-action-warning.regression.test.ts ` +
      `-t "DRIVE-R06|DRIVE-R07|RETRY-R01|AUTO-WARN-R05|TIMER-RACE-R01|TIMER-RACE-R02|TIMER-RACE-R03"`;
    runOrFail(engineRegressionCmd, [], { cwd: repoRoot, env });

    const roomRegressionCmd =
      `pnpm exec vitest run apps/server/src/rooms/table-action-broadcast.test.ts ` +
      `-t "rejoin/session-swap with pending action replay remains idempotent for same actionId|rejects stale client action after turn has advanced"`;
    runOrFail(roomRegressionCmd, [], { cwd: repoRoot, env });
  }

  for (let i = 1; i <= args.runs; i += 1) {
    const logBase = `${args.prefix}_run${i}`;
    const logPath = path.join(outDir, `${logBase}.log`);
    const cleanPath = path.join(outDir, `${logBase}.clean.jsonl`);

    const soakCmd =
      `pnpm exec vitest run apps/server/src/rooms/poker-room.random-walk.soak.test.ts ` +
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
    if (stalledCount > 0 || redriveCount > 0) {
      throw new Error(`${logBase}: stalled=${stalledCount} redrive=${redriveCount}`);
    }

    console.log(
      `[room-soak-validate] ${logBase} PASS | stalled=${stalledCount} redrive=${redriveCount} log=${logPath}`,
    );
  }

  console.log(
    `\n[room-soak-validate] COMPLETE | runs=${args.runs} hands=${args.hands} minHandCompletionRate=${args.minHandCompletionRate}`,
  );
}

main();
