#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node apps/server/scripts/analyze-round-state-transitions.mjs --file <logfile> [--max-issues N] [--max-transitions-per-hand N]

Analyzes:
  - ROUND_STATE_TRANSITION
  - ROUND_STATE_TRANSITION_REJECTED
Per-hand sequence legality, invariants, and summary counts.`);
}

function parseArgs(argv) {
  const args = { file: "", maxIssues: 25, maxTransitionsPerHand: 20 };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      args.file = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--max-issues") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n) && n >= 0) args.maxIssues = Math.floor(n);
      i += 1;
      continue;
    }
    if (token === "--max-transitions-per-hand") {
      const n = Number(argv[i + 1] ?? "");
      if (Number.isFinite(n) && n >= 1) args.maxTransitionsPerHand = Math.floor(n);
      i += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
  }
  if (!args.file) {
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

function readText(filePath) {
  const raw = fs.readFileSync(filePath);
  const enc = detectEncoding(raw);
  return decodeBuffer(raw, enc);
}

function parseJsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const msg = typeof parsed.msg === "string" ? parsed.msg : "";
    if (msg !== "ROUND_STATE_TRANSITION" && msg !== "ROUND_STATE_TRANSITION_REJECTED") return null;
    return {
      msg,
      handId: typeof parsed.handId === "string" ? parsed.handId : "",
      tableId: typeof parsed.tableId === "string" ? parsed.tableId : "",
      from: typeof parsed.fromRoundState === "string" ? parsed.fromRoundState : "",
      to: typeof parsed.toRoundState === "string" ? parsed.toRoundState : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      street: typeof parsed.street === "string" ? parsed.street : "",
      toActSeat: typeof parsed.toActSeat === "number" ? parsed.toActSeat : undefined,
      playersRemaining: typeof parsed.playersRemaining === "number" ? parsed.playersRemaining : undefined,
      actionablePlayers: typeof parsed.actionablePlayers === "number" ? parsed.actionablePlayers : undefined,
      bettingClosed:
        typeof parsed.bettingClosed === "boolean"
          ? parsed.bettingClosed
          : undefined,
      turnDeadlineMs: typeof parsed.turnDeadlineMs === "number" ? parsed.turnDeadlineMs : undefined,
      time: typeof parsed.time === "number" ? parsed.time : undefined,
      raw: line,
    };
  } catch {
    return null;
  }
}

function parseKvLine(line) {
  if (!line.includes("ROUND_STATE_TRANSITION")) return null;
  const msg = line.includes("ROUND_STATE_TRANSITION_REJECTED")
    ? "ROUND_STATE_TRANSITION_REJECTED"
    : "ROUND_STATE_TRANSITION";
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
    handId: get("handId"),
    tableId: get("tableId"),
    from: get("fromRoundState"),
    to: get("toRoundState"),
    reason: get("reason"),
    street: get("street"),
    toActSeat: Number(get("toActSeat") || NaN),
    playersRemaining: Number(get("playersRemaining") || NaN),
    actionablePlayers: Number(get("actionablePlayers") || NaN),
    bettingClosed: get("bettingClosed") === "true" ? true : get("bettingClosed") === "false" ? false : undefined,
    turnDeadlineMs: Number(get("turnDeadlineMs") || NaN),
    time: undefined,
    raw: line,
  };
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return parseJsonLine(trimmed);
  return parseKvLine(trimmed);
}

const allowed = new Map(
  Object.entries({
    ROUND_INIT: new Set(["WAITING_FOR_ACTION", "ROUND_COMPLETE", "RUNOUT", "HAND_COMPLETE"]),
    WAITING_FOR_ACTION: new Set(["WAITING_FOR_ACTION", "ROUND_COMPLETE", "HAND_COMPLETE"]),
    ROUND_COMPLETE: new Set(["ROUND_INIT", "RUNOUT", "SHOWDOWN"]),
    RUNOUT: new Set(["SHOWDOWN"]),
    SHOWDOWN: new Set(["HAND_COMPLETE"]),
    HAND_COMPLETE: new Set([]),
  }),
);

function isAllowedTransition(from, to, reason) {
  // Hand creation/reset boundary: allow transition to ROUND_INIT from any prior state.
  if (to === "ROUND_INIT") return true;
  const next = allowed.get(from);
  if (!next || !next.has(to)) return false;
  void reason;
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  const fullPath = path.resolve(args.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const lines = readText(fullPath).split(/\r?\n/);
  const byHand = new Map();
  let transitionCount = 0;
  let rejectedCount = 0;

  for (const line of lines) {
    const entry = parseLine(line);
    if (!entry) continue;
    const handId = entry.handId || "(missing)";
    const bucket = byHand.get(handId) ?? { transitions: [], rejected: [] };
    if (entry.msg === "ROUND_STATE_TRANSITION") {
      transitionCount += 1;
      bucket.transitions.push(entry);
    } else {
      rejectedCount += 1;
      bucket.rejected.push(entry);
    }
    byHand.set(handId, bucket);
  }

  let handsWithTransitions = 0;
  let handsWithRejected = 0;
  let illegalObserved = 0;
  let overTransitionLimitHands = 0;
  let invariantViolations = 0;
  let handsReachedHandComplete = 0;
  const issues = [];

  for (const [handId, bucket] of byHand.entries()) {
    if (bucket.transitions.length === 0 && bucket.rejected.length === 0) continue;
    if (bucket.transitions.length > 0) handsWithTransitions += 1;
    if (bucket.rejected.length > 0) handsWithRejected += 1;
    if (bucket.transitions.some((t) => t.to === "HAND_COMPLETE")) {
      handsReachedHandComplete += 1;
    }

    for (const r of bucket.rejected) {
      issues.push({
        handId,
        type: "REJECTED",
        from: r.from,
        to: r.to,
        reason: r.reason,
        street: r.street,
        toActSeat: r.toActSeat,
        playersRemaining: r.playersRemaining,
      });
    }

    if (bucket.transitions.length > args.maxTransitionsPerHand) {
      overTransitionLimitHands += 1;
      issues.push({
        handId,
        type: "TRANSITION_LIMIT_EXCEEDED",
        from: "",
        to: "",
        reason: `transitions=${bucket.transitions.length}>limit=${args.maxTransitionsPerHand}`,
      });
    }

    for (const t of bucket.transitions) {
      if (!isAllowedTransition(t.from, t.to, t.reason)) {
        illegalObserved += 1;
        issues.push({
          handId,
          type: "ILLEGAL",
          from: t.from,
          to: t.to,
          reason: t.reason,
          street: t.street,
          toActSeat: t.toActSeat,
          playersRemaining: t.playersRemaining,
        });
      }
      if (t.to !== "WAITING_FOR_ACTION" && Number.isFinite(t.turnDeadlineMs) && t.turnDeadlineMs > 0) {
        invariantViolations += 1;
        issues.push({
          handId,
          type: "INVARIANT_DEADLINE_OUTSIDE_WAITING",
          from: t.from,
          to: t.to,
          reason: `turnDeadlineMs=${t.turnDeadlineMs}`,
          street: t.street,
          toActSeat: t.toActSeat,
          playersRemaining: t.playersRemaining,
        });
      }
      if (t.to === "SHOWDOWN" && t.bettingClosed !== true) {
        invariantViolations += 1;
        issues.push({
          handId,
          type: "INVARIANT_SHOWDOWN_NOT_CLOSED",
          from: t.from,
          to: t.to,
          reason: `bettingClosed=${String(t.bettingClosed)}`,
          street: t.street,
          toActSeat: t.toActSeat,
          playersRemaining: t.playersRemaining,
        });
      }
      if (t.to === "RUNOUT" && Number.isFinite(t.actionablePlayers) && t.actionablePlayers > 0) {
        invariantViolations += 1;
        issues.push({
          handId,
          type: "INVARIANT_RUNOUT_HAS_ACTIONABLE_PLAYERS",
          from: t.from,
          to: t.to,
          reason: `actionablePlayers=${t.actionablePlayers}`,
          street: t.street,
          toActSeat: t.toActSeat,
          playersRemaining: t.playersRemaining,
        });
      }
    }
  }

  console.log("ROUND STATE TRANSITION ANALYSIS");
  console.log(`file=${fullPath}`);
  console.log(`handsTracked=${byHand.size}`);
  console.log(`handsWithTransitions=${handsWithTransitions}`);
  console.log(`handsReachedHandComplete=${handsReachedHandComplete}`);
  console.log(`incompleteHands=${Math.max(0, handsWithTransitions - handsReachedHandComplete)}`);
  console.log(
    `handCompletionRate=${handsWithTransitions > 0 ? (handsReachedHandComplete / handsWithTransitions).toFixed(4) : "1.0000"}`,
  );
  console.log(`handsWithRejected=${handsWithRejected}`);
  console.log(`transitionEvents=${transitionCount}`);
  console.log(`rejectedEvents=${rejectedCount}`);
  console.log(`illegalTransitionEvents=${illegalObserved}`);
  console.log(`handsOverTransitionLimit=${overTransitionLimitHands}`);
  console.log(`invariantViolations=${invariantViolations}`);
  console.log(`healthy=${issues.length === 0 ? "true" : "false"}`);

  if (issues.length > 0 && args.maxIssues > 0) {
    console.log("");
    console.log(`ISSUES (max ${args.maxIssues})`);
    for (const issue of issues.slice(0, args.maxIssues)) {
      console.log(
        [
          `handId=${issue.handId}`,
          `type=${issue.type}`,
          `from=${issue.from}`,
          `to=${issue.to}`,
          `reason=${issue.reason}`,
          `street=${issue.street ?? ""}`,
          `toActSeat=${issue.toActSeat ?? ""}`,
          `playersRemaining=${issue.playersRemaining ?? ""}`,
        ].join(" "),
      );
    }
  }
}

main();
