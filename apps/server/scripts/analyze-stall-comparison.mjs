#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node apps/server/scripts/analyze-stall-comparison.mjs --before <before.log> --after <after.log>

Counts:
  - TABLE_STALLED
  - TABLE_STALLED_RECOVERY_REDRIVE
  - stallReason distribution
  - optional normalization by hand-start events when detectable
`);
}

function parseArgs(argv) {
  const args = { before: "", after: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--before") {
      args.before = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (a === "--after") {
      args.after = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!args.before || !args.after) {
    usage();
    process.exit(1);
  }
  return args;
}

function detectEncoding(buffer) {
  if (buffer.length >= 2) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    if (b0 === 0xff && b1 === 0xfe) return "utf16le";
    if (b0 === 0xfe && b1 === 0xff) return "utf16be";
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  let zeroEven = 0;
  let zeroOdd = 0;
  for (let i = 0; i < sample.length; i += 1) {
    if (sample[i] !== 0) continue;
    if (i % 2 === 0) zeroEven += 1;
    else zeroOdd += 1;
  }
  if (zeroOdd > sample.length * 0.1) return "utf16le";
  if (zeroEven > sample.length * 0.1) return "utf16be";
  return "utf8";
}

function decodeBuffer(buffer, encoding) {
  if (encoding === "utf16be") {
    const swapped = Buffer.allocUnsafe(buffer.length - (buffer.length % 2));
    for (let i = 0; i < swapped.length; i += 2) {
      swapped[i] = buffer[i + 1];
      swapped[i + 1] = buffer[i];
    }
    return swapped.toString("utf16le");
  }
  return buffer.toString(encoding);
}

function safeReadLines(filePath) {
  const rawBuffer = fs.readFileSync(filePath);
  const encoding = detectEncoding(rawBuffer);
  const decoded = decodeBuffer(rawBuffer, encoding);
  return decoded.split(/\r?\n/);
}

function extractStallReason(line) {
  const jsonMatch = line.match(/"stallReason":"([^"]+)"/);
  if (jsonMatch) return jsonMatch[1];
  const kvMatch = line.match(/\bstallReason="?([A-Z_]+)"?/);
  if (kvMatch) return kvMatch[1];
  return null;
}

function analyze(filePath) {
  const lines = safeReadLines(filePath);
  let tableStalled = 0;
  let redrive = 0;
  let handStarts = 0;
  const reasons = new Map();

  for (const line of lines) {
    if (!line) continue;
    if (line.includes("TABLE_STALLED\"") || line.includes(" TABLE_STALLED ")) {
      tableStalled += 1;
      const reason = extractStallReason(line);
      if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    if (line.includes("TABLE_STALLED_RECOVERY_REDRIVE")) {
      redrive += 1;
    }

    if (
      line.includes("\"msg\":\"hand started\"") ||
      line.includes("HAND_START") ||
      line.includes("reason\":\"START_HAND\"")
    ) {
      handStarts += 1;
    }
  }

  return {
    filePath,
    tableStalled,
    redrive,
    handStarts,
    reasons,
  };
}

function pctDelta(before, after) {
  if (before === 0) return after === 0 ? "0.00%" : "n/a";
  const pct = ((after - before) / before) * 100;
  return `${pct.toFixed(2)}%`;
}

function ratePer1k(events, hands) {
  if (!hands) return null;
  return (events / hands) * 1000;
}

function printSummary(label, a) {
  console.log(`${label}_file=${a.filePath}`);
  console.log(`${label}_TABLE_STALLED=${a.tableStalled}`);
  console.log(`${label}_TABLE_STALLED_RECOVERY_REDRIVE=${a.redrive}`);
  console.log(`${label}_handStarts=${a.handStarts}`);
  const rate = ratePer1k(a.tableStalled, a.handStarts);
  if (rate != null) console.log(`${label}_stalledPer1kHands=${rate.toFixed(4)}`);
  if (a.reasons.size === 0) {
    console.log(`${label}_stallReasons=none`);
  } else {
    for (const [k, v] of [...a.reasons.entries()].sort(([a1], [b1]) => a1.localeCompare(b1))) {
      console.log(`${label}_stallReason_${k}=${v}`);
    }
  }
}

function main() {
  const { before, after } = parseArgs(process.argv);
  const beforePath = path.resolve(before);
  const afterPath = path.resolve(after);

  if (!fs.existsSync(beforePath)) {
    console.error(`Missing --before file: ${beforePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(afterPath)) {
    console.error(`Missing --after file: ${afterPath}`);
    process.exit(1);
  }

  const b = analyze(beforePath);
  const a = analyze(afterPath);

  console.log("STALL COMPARISON");
  printSummary("before", b);
  printSummary("after", a);
  console.log(`delta_TABLE_STALLED=${a.tableStalled - b.tableStalled}`);
  console.log(`delta_TABLE_STALLED_pct=${pctDelta(b.tableStalled, a.tableStalled)}`);
  console.log(`delta_REDRIVE=${a.redrive - b.redrive}`);
  console.log(`delta_REDRIVE_pct=${pctDelta(b.redrive, a.redrive)}`);

  const bRate = ratePer1k(b.tableStalled, b.handStarts);
  const aRate = ratePer1k(a.tableStalled, a.handStarts);
  if (bRate != null && aRate != null) {
    console.log(`delta_stalledPer1kHands=${(aRate - bRate).toFixed(4)}`);
  }
}

main();
