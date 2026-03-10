#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node apps/server/scripts/analyze-engine-decision-logs.mjs --file <logfile> [--max-mismatches N]",
      "",
      "Options:",
      "  --file <path>           Path to log file (required).",
      "  --max-mismatches <n>    Number of mismatch samples to print (default: 25).",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = { file: "", maxMismatches: 25 };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--file") {
      args.file = argv[++i] ?? "";
    } else if (token === "--max-mismatches") {
      const parsed = Number(argv[++i] ?? "");
      if (Number.isFinite(parsed) && parsed >= 0) args.maxMismatches = Math.floor(parsed);
    } else if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return args;
}

function parseJsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const msg = typeof parsed.msg === "string" ? parsed.msg : "";
    if (msg !== "ENGINE_DECISION" && msg !== "ENGINE_RUNTIME_STEP") return null;
    return {
      msg,
      traceId:
        typeof parsed.decisionTraceId === "string"
          ? parsed.decisionTraceId
          : typeof parsed.trace === "string"
            ? parsed.trace
            : "",
      step: typeof parsed.step === "string" ? parsed.step : "",
      runtimeStep: typeof parsed.runtimeStep === "string" ? parsed.runtimeStep : "",
      tableId: typeof parsed.tableId === "string" ? parsed.tableId : "",
      handId: typeof parsed.handId === "string" ? parsed.handId : "",
      street: typeof parsed.street === "string" ? parsed.street : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      now: typeof parsed.now === "number" ? parsed.now : undefined,
      raw: line,
    };
  } catch {
    return null;
  }
}

function parseKvLine(line) {
  if (!line.includes("ENGINE_DECISION") && !line.includes("ENGINE_RUNTIME_STEP")) return null;
  const msg = line.includes("ENGINE_RUNTIME_STEP") ? "ENGINE_RUNTIME_STEP" : "ENGINE_DECISION";
  const get = (key) => {
    const quoted = new RegExp(`${key}=\"([^\"]*)\"`);
    const qm = line.match(quoted);
    if (qm?.[1] != null) return qm[1];
    const bare = new RegExp(`${key}=([^\\s]+)`);
    const bm = line.match(bare);
    return bm?.[1] ?? "";
  };
  return {
    msg,
    traceId: get("decisionTraceId") || get("trace"),
    step: get("step"),
    runtimeStep: get("runtimeStep"),
    tableId: get("tableId"),
    handId: get("handId"),
    street: get("street"),
    reason: get("reason"),
    now: Number(get("now")) || undefined,
    raw: line,
  };
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return parseJsonLine(trimmed);
  return parseKvLine(trimmed);
}

function readTextFileAuto(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 2) {
    // UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le");
    // UTF-16 BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      // Swap bytes and decode as UTF-16 LE
      const swapped = Buffer.allocUnsafe(buffer.length - 2);
      for (let i = 2; i < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1] ?? 0;
        swapped[i - 1] = buffer[i];
      }
      return swapped.toString("utf16le");
    }
  }
  return buffer.toString("utf8");
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    printUsage();
    process.exit(1);
  }

  const fullPath = path.resolve(args.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Log file not found: ${fullPath}`);
    process.exit(1);
  }

  const lines = readTextFileAuto(fullPath).split(/\r?\n/);
  const grouped = new Map();

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed || !parsed.traceId) continue;
    const bucket = grouped.get(parsed.traceId) ?? { decision: null, runtime: null };
    if (parsed.msg === "ENGINE_DECISION") bucket.decision = parsed;
    if (parsed.msg === "ENGINE_RUNTIME_STEP") bucket.runtime = parsed;
    grouped.set(parsed.traceId, bucket);
  }

  let totalPairs = 0;
  let matched = 0;
  let mismatched = 0;
  let missingDecision = 0;
  let missingRuntime = 0;
  const mismatchRows = [];

  for (const [traceId, pair] of grouped.entries()) {
    const decision = pair.decision;
    const runtime = pair.runtime;
    if (!decision) {
      missingDecision++;
      continue;
    }
    if (!runtime) {
      missingRuntime++;
      continue;
    }
    totalPairs++;
    if (decision.step === runtime.runtimeStep) {
      matched++;
    } else {
      mismatched++;
      mismatchRows.push({
        traceId,
        tableId: decision.tableId || runtime.tableId,
        handId: decision.handId || runtime.handId,
        street: decision.street || runtime.street,
        reason: decision.reason || runtime.reason,
        decisionStep: decision.step,
        runtimeStep: runtime.runtimeStep,
      });
    }
  }

  console.log("ENGINE DECISION PAIR ANALYSIS");
  console.log(`file=${fullPath}`);
  console.log(`traceGroups=${grouped.size}`);
  console.log(`totalPairs=${totalPairs}`);
  console.log(`matched=${matched}`);
  console.log(`mismatched=${mismatched}`);
  console.log(`missingDecision=${missingDecision}`);
  console.log(`missingRuntime=${missingRuntime}`);
  console.log(`matchRate=${totalPairs > 0 ? ((matched / totalPairs) * 100).toFixed(2) : "0.00"}%`);

  if (mismatchRows.length > 0 && args.maxMismatches > 0) {
    console.log("");
    console.log(`MISMATCH SAMPLES (max ${args.maxMismatches})`);
    for (const row of mismatchRows.slice(0, args.maxMismatches)) {
      console.log(
        [
          `trace=${row.traceId}`,
          `tableId=${row.tableId}`,
          `handId=${row.handId}`,
          `street=${row.street}`,
          `reason=${row.reason}`,
          `decisionStep=${row.decisionStep}`,
          `runtimeStep=${row.runtimeStep}`,
        ].join(" "),
      );
    }
  }
}

main();
