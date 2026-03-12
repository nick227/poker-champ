#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { file: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      out.file = String(argv[++i] ?? "");
      continue;
    }
    if (token === "--help" || token === "-h") {
      console.log("Usage: node apps/server/scripts/check-log-schema-contract.mjs --file <path>");
      process.exit(0);
    }
  }
  if (!out.file) throw new Error("Missing required --file");
  return out;
}

const REQUIRED_FIELDS_BY_MSG = {
  TABLE_STALLED: [
    "roomId",
    "tableId",
    "handId",
    "stallReason",
    "street",
    "toActSeat",
    "stallAgeMs",
    "turnAgeMs",
    "decisionTraceId",
    "queueDepth",
  ],
  TABLE_STALLED_RECOVERY_REDRIVE: [
    "roomId",
    "tableId",
    "handId",
    "stallReason",
    "stallAgeMs",
    "turnAgeMs",
    "decisionTraceId",
  ],
  ENGINE_DECISION: [
    "tableId",
    "handId",
    "street",
    "toActSeat",
    "toActUserId",
    "turnDeadlineMs",
    "step",
    "reason",
    "now",
  ],
  ENGINE_PARITY_MISMATCH: [
    "tableId",
    "handId",
    "decisionStep",
    "runtimeStep",
    "reason",
  ],
  DEALER_RUNTIME_METRICS: [
    "roomId",
    "tableId",
    "activeTables",
    "waitingTurns",
  ],
};

function hasValue(obj, key) {
  if (!(key in obj)) return false;
  const value = obj[key];
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const filePath = path.resolve(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().startsWith("{"));
  let checked = 0;
  const issues = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry?.msg;
    const requiredFields = REQUIRED_FIELDS_BY_MSG[msg];
    if (!requiredFields) continue;
    checked += 1;

    for (const field of requiredFields) {
      if (!hasValue(entry, field)) {
        issues.push(`line=${i + 1} msg=${msg} missing=${field}`);
      }
    }
  }

  if (issues.length > 0) {
    console.error("LOG_SCHEMA_CONTRACT=FAIL");
    for (const issue of issues.slice(0, 100)) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`LOG_SCHEMA_CONTRACT=PASS checkedMessages=${checked}`);
}

main();
