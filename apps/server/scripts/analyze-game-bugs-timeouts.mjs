#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  console.log(`Usage:
  node apps/server/scripts/analyze-game-bugs-timeouts.mjs --file <logfile> [--max-issues N]

Analyzes:
  - TABLE_STALLED / TABLE_STALLED_RECOVERY_REDRIVE
  - ENGINE_DECISION / ENGINE_RUNTIME_STEP
  - ENGINE_DECISION_STATE
  - TO_ACT_DERIVATION_MISMATCH
  - ROUND_STATE_TRANSITION
  - LIFECYCLE_PLAN_EXECUTED (HAND_ENDED)
  - TURN_STALLED
  - AUTO_ACTION_FAILED / AUTO_ACTION_DISCARDED
`);
}

function parseArgs(argv) {
  const args = { file: "", maxIssues: 30 };
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

function parseNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.length === 0) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseJsonLine(line) {
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") return null;
    const rawMsg = typeof parsed.msg === "string" ? parsed.msg : "";
    const msg = rawMsg.startsWith("ACTION_REJECTED") ? "ACTION_REJECTED" : rawMsg;
    const reasonFromMsg = (() => {
      const m = rawMsg.match(/reason=([A-Z0-9_:-]+)/);
      return m?.[1] ?? "";
    })();
    return {
      msg,
      tableId: typeof parsed.tableId === "string" ? parsed.tableId : "",
      handId: typeof parsed.handId === "string" ? parsed.handId : "",
      userId: typeof parsed.userId === "string" ? parsed.userId : "",
      actionId: typeof parsed.actionId === "string" ? parsed.actionId : "",
      street: typeof parsed.street === "string" ? parsed.street : "",
      step: typeof parsed.step === "string" ? parsed.step : "",
      runtimeStep: typeof parsed.runtimeStep === "string" ? parsed.runtimeStep : "",
      decisionTraceId:
        typeof parsed.decisionTraceId === "string"
          ? parsed.decisionTraceId
          : typeof parsed.trace === "string"
            ? parsed.trace
            : "",
      reason: typeof parsed.reason === "string" ? parsed.reason : reasonFromMsg,
      stallReason: typeof parsed.stallReason === "string" ? parsed.stallReason : "",
      toActSeat: parseNumber(parsed.toActSeat),
      turnDeadlineMs: parseNumber(parsed.turnDeadlineMs) ?? parseNumber(parsed.deadline),
      roundState: typeof parsed.roundState === "string" ? parsed.roundState : "",
      actorKind: typeof parsed.actorKind === "string" ? parsed.actorKind : "",
      actorConnected:
        typeof parsed.actorConnected === "boolean"
          ? parsed.actorConnected
          : typeof parsed.actorConnected === "string"
            ? parsed.actorConnected.toLowerCase() === "true"
            : undefined,
      needsAction:
        typeof parsed.needsAction === "boolean"
          ? parsed.needsAction
          : typeof parsed.needsAction === "string"
            ? parsed.needsAction.toLowerCase() === "true"
            : undefined,
      fromRoundState: typeof parsed.fromRoundState === "string" ? parsed.fromRoundState : "",
      toRoundState: typeof parsed.toRoundState === "string" ? parsed.toRoundState : "",
      plan: typeof parsed.plan === "string" ? parsed.plan : "",
      now: parseNumber(parsed.now),
      time: parseNumber(parsed.time),
      raw: line,
    };
  } catch {
    return null;
  }
}

function parseKvLine(line) {
  const knownMessages = [
    "ENGINE_DECISION",
    "ENGINE_RUNTIME_STEP",
    "ENGINE_DECISION_STATE",
    "TABLE_STALLED",
    "TABLE_STALLED_RECOVERY_REDRIVE",
    "TO_ACT_DERIVATION_MISMATCH",
    "ROUND_STATE_TRANSITION",
    "TURN_STALLED",
    "AUTO_ACTION_FAILED",
    "AUTO_ACTION_DISCARDED",
    "LIFECYCLE_PLAN_EXECUTED",
    "ACTION_RESOLVED_NEXT_ACTOR",
    "ACTION_ACCEPTED",
    "ACTION_REJECTED",
    "hand started",
  ];
  const msg = knownMessages.find((m) => line.includes(m));
  if (!msg) return null;
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
    tableId: get("tableId"),
    handId: get("handId"),
    userId: get("userId"),
    actionId: get("actionId"),
    street: get("street"),
    step: get("step"),
    runtimeStep: get("runtimeStep"),
    decisionTraceId: get("decisionTraceId") || get("trace"),
    reason: get("reason"),
    stallReason: get("stallReason"),
    toActSeat: parseNumber(get("toActSeat")),
    turnDeadlineMs: parseNumber(get("turnDeadlineMs")) ?? parseNumber(get("deadline")),
    roundState: get("roundState"),
    actorKind: get("actorKind"),
    actorConnected:
      get("actorConnected") === ""
        ? undefined
        : get("actorConnected").toLowerCase() === "true",
    needsAction:
      get("needsAction") === ""
        ? undefined
        : get("needsAction").toLowerCase() === "true",
    fromRoundState: get("fromRoundState"),
    toRoundState: get("toRoundState"),
    plan: get("plan"),
    now: parseNumber(get("now")),
    time: parseNumber(get("time")),
    raw: line,
  };
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) return parseJsonLine(trimmed);
  return parseKvLine(trimmed);
}

function increment(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function main() {
  const args = parseArgs(process.argv);
  const fullPath = path.resolve(args.file);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    process.exit(1);
  }

  const lines = readText(fullPath).split(/\r?\n/);
  const decisionByTrace = new Map();
  const runtimeByTrace = new Map();
  const handStarts = new Set();
  const handCompletes = new Set();
  const stallReasonCounts = new Map();
  const actionRejectedReasonCounts = new Map();
  const lastDecisionStateByHand = new Map();
  const stalledByHand = new Map();
  const issues = [];

  let tableStalled = 0;
  let stallRecoveryRedrive = 0;
  let toActMismatch = 0;
  let turnStalled = 0;
  let autoActionFailed = 0;
  let autoActionDiscarded = 0;
  let actionRejectedCount = 0;
  let actionAcceptedCount = 0;
  let handIdMismatchRejects = 0;
  let duplicateActionRejects = 0;
  let duplicateWithoutAcceptance = 0;
  let timeoutDecisionCount = 0;
  let timeoutRuntimeCount = 0;
  let timeoutWithMissingDeadline = 0;
  let timeoutDoubleFires = 0;
  let deadlineOutsideWaiting = 0;
  let waitingHumanMissingDeadline = 0;
  let waitingHumanNoNeedsAction = 0;
  let tableStalledMissingReason = 0;
  let tableStalledMissingReasonConnectedHuman = 0;

  const timeoutRuntimeKeys = new Map();
  const acceptedActionKeys = new Set();
  const duplicateRejectedActionKeys = [];

  for (const line of lines) {
    const e = parseLine(line);
    if (!e) continue;

    if (e.msg === "TABLE_STALLED") {
      tableStalled += 1;
      if (e.stallReason) increment(stallReasonCounts, e.stallReason);
      if (!e.stallReason) {
        const hasContext =
          Boolean(e.handId) ||
          Boolean(e.tableId) ||
          Boolean(e.street) ||
          Number.isFinite(e.toActSeat);
        if (!hasContext) continue;
        tableStalledMissingReason += 1;
        const lastDecision = e.handId ? lastDecisionStateByHand.get(e.handId) : undefined;
        const connectedHumanToAct =
          !!lastDecision &&
          lastDecision.roundState === "WAITING_FOR_ACTION" &&
          lastDecision.actorKind === "HUMAN" &&
          lastDecision.actorConnected === true;
        if (connectedHumanToAct) {
          tableStalledMissingReasonConnectedHuman += 1;
          issues.push(
            `type=TABLE_STALLED_MISSING_REASON_CONNECTED_HUMAN handId=${e.handId} tableId=${e.tableId} street=${e.street} toActSeat=${e.toActSeat ?? ""}`,
          );
        } else {
          issues.push(
            `type=TABLE_STALLED_MISSING_REASON handId=${e.handId} tableId=${e.tableId} street=${e.street} toActSeat=${e.toActSeat ?? ""}`,
          );
        }
      }
      if (e.handId) {
        const prev = stalledByHand.get(e.handId) ?? {
          handId: e.handId,
          tableId: e.tableId,
          stalls: 0,
          lastStreet: "",
          lastToActSeat: undefined,
          lastStallReason: "",
          lastTime: undefined,
        };
        prev.stalls += 1;
        prev.tableId = e.tableId || prev.tableId;
        prev.lastStreet = e.street || prev.lastStreet;
        prev.lastToActSeat = e.toActSeat ?? prev.lastToActSeat;
        prev.lastStallReason = e.stallReason || prev.lastStallReason;
        prev.lastTime = e.time ?? prev.lastTime;
        stalledByHand.set(e.handId, prev);
      }
      continue;
    }
    if (e.msg === "TABLE_STALLED_RECOVERY_REDRIVE") {
      stallRecoveryRedrive += 1;
      continue;
    }
    if (e.msg === "TO_ACT_DERIVATION_MISMATCH") {
      toActMismatch += 1;
      continue;
    }
    if (e.msg === "TURN_STALLED") {
      turnStalled += 1;
      continue;
    }
    if (e.msg === "AUTO_ACTION_FAILED") {
      autoActionFailed += 1;
      continue;
    }
    if (e.msg === "AUTO_ACTION_DISCARDED") {
      autoActionDiscarded += 1;
      continue;
    }
    if (e.msg === "ACTION_REJECTED") {
      actionRejectedCount += 1;
      const reason = e.reason || "UNKNOWN";
      increment(actionRejectedReasonCounts, reason);
      if (reason === "HAND_ID_MISMATCH") {
        handIdMismatchRejects += 1;
      }
      if (reason === "DUPLICATE_ACTION") {
        duplicateActionRejects += 1;
        const key = `${e.handId}|${e.userId}|${e.actionId}`;
        if (e.handId && e.userId && e.actionId) {
          duplicateRejectedActionKeys.push(key);
        }
      }
      continue;
    }

    if (e.msg === "ACTION_ACCEPTED") {
      actionAcceptedCount += 1;
      if (e.handId && e.userId && e.actionId) {
        acceptedActionKeys.add(`${e.handId}|${e.userId}|${e.actionId}`);
      }
      continue;
    }

    if (e.msg === "ROUND_STATE_TRANSITION") {
      if (e.toRoundState === "WAITING_FOR_ACTION" && e.handId) handStarts.add(e.handId);
      if (e.toRoundState === "HAND_COMPLETE" && e.handId) handCompletes.add(e.handId);
      if (e.toRoundState !== "WAITING_FOR_ACTION" && (e.turnDeadlineMs ?? 0) > 0) {
        deadlineOutsideWaiting += 1;
        issues.push(
          `type=DEADLINE_OUTSIDE_WAITING handId=${e.handId} street=${e.street} from=${e.fromRoundState} to=${e.toRoundState} turnDeadlineMs=${e.turnDeadlineMs}`,
        );
      }
      continue;
    }

    if (e.msg === "hand started") {
      if (e.handId) handStarts.add(e.handId);
      continue;
    }

    if (e.msg === "LIFECYCLE_PLAN_EXECUTED") {
      if (e.plan === "HAND_ENDED" && e.handId) handCompletes.add(e.handId);
      continue;
    }

    if (e.msg === "ACTION_RESOLVED_NEXT_ACTOR") {
      if (e.street === "WAITING" && e.handId) handCompletes.add(e.handId);
      continue;
    }

    if (e.msg === "ENGINE_DECISION") {
      if (e.decisionTraceId) decisionByTrace.set(e.decisionTraceId, e);
      if (e.step === "AUTO_ACTION_TIMEOUT") {
        timeoutDecisionCount += 1;
        if ((e.turnDeadlineMs ?? 0) <= 0) {
          timeoutWithMissingDeadline += 1;
          issues.push(
            `type=TIMEOUT_DECISION_WITH_NO_DEADLINE trace=${e.decisionTraceId} handId=${e.handId} street=${e.street} toActSeat=${e.toActSeat ?? ""}`,
          );
        }
      }
      continue;
    }

    if (e.msg === "ENGINE_RUNTIME_STEP") {
      if (e.decisionTraceId) runtimeByTrace.set(e.decisionTraceId, e);
      if (e.runtimeStep === "AUTO_ACTION_TIMEOUT") {
        timeoutRuntimeCount += 1;
        if ((e.turnDeadlineMs ?? 0) <= 0) {
          timeoutWithMissingDeadline += 1;
          issues.push(
            `type=TIMEOUT_RUNTIME_WITH_NO_DEADLINE trace=${e.decisionTraceId} handId=${e.handId} street=${e.street} toActSeat=${e.toActSeat ?? ""}`,
          );
        }
        const key = `${e.handId}|${e.street}|${e.toActSeat ?? -1}|${e.turnDeadlineMs ?? 0}`;
        const count = (timeoutRuntimeKeys.get(key) ?? 0) + 1;
        timeoutRuntimeKeys.set(key, count);
        if (count > 1) {
          timeoutDoubleFires += 1;
          issues.push(`type=DUPLICATE_TIMEOUT_RUNTIME key=${key} count=${count} trace=${e.decisionTraceId}`);
        }
      }
      continue;
    }

    if (e.msg === "ENGINE_DECISION_STATE") {
      if (e.handId) {
        lastDecisionStateByHand.set(e.handId, {
          tableId: e.tableId,
          street: e.street,
          roundState: e.roundState,
          toActSeat: e.toActSeat,
          actorKind: e.actorKind,
          actorConnected: e.actorConnected,
          needsAction: e.needsAction,
          turnDeadlineMs: e.turnDeadlineMs,
          time: e.time,
        });
      }
      const isWaiting = e.roundState === "WAITING_FOR_ACTION";
      const isConnectedHuman = e.actorKind === "HUMAN" && e.actorConnected === true;
      if (isWaiting && isConnectedHuman && (e.turnDeadlineMs ?? 0) <= 0) {
        waitingHumanMissingDeadline += 1;
        issues.push(
          `type=WAITING_HUMAN_MISSING_DEADLINE handId=${e.handId} street=${e.street} toActSeat=${e.toActSeat ?? ""} roundState=${e.roundState}`,
        );
      }
      if (isWaiting && isConnectedHuman && e.needsAction === false) {
        waitingHumanNoNeedsAction += 1;
        issues.push(
          `type=WAITING_HUMAN_NEEDS_ACTION_FALSE handId=${e.handId} street=${e.street} toActSeat=${e.toActSeat ?? ""} roundState=${e.roundState}`,
        );
      }
      continue;
    }
  }

  let decisionRuntimePairs = 0;
  let decisionRuntimeMismatches = 0;
  let timeoutDecisionRuntimeMismatch = 0;
  let timeoutDecisionMissingRuntime = 0;

  for (const [trace, decision] of decisionByTrace.entries()) {
    const runtime = runtimeByTrace.get(trace);
    if (!runtime) {
      if (decision.step === "AUTO_ACTION_TIMEOUT") {
        timeoutDecisionMissingRuntime += 1;
        issues.push(`type=TIMEOUT_DECISION_MISSING_RUNTIME trace=${trace} handId=${decision.handId}`);
      }
      continue;
    }
    decisionRuntimePairs += 1;
    if (decision.step !== runtime.runtimeStep) {
      decisionRuntimeMismatches += 1;
      issues.push(
        `type=DECISION_RUNTIME_MISMATCH trace=${trace} handId=${decision.handId} decision=${decision.step} runtime=${runtime.runtimeStep}`,
      );
    }
    const decisionTimeout = decision.step === "AUTO_ACTION_TIMEOUT";
    const runtimeTimeout = runtime.runtimeStep === "AUTO_ACTION_TIMEOUT";
    if (decisionTimeout !== runtimeTimeout) {
      timeoutDecisionRuntimeMismatch += 1;
      issues.push(
        `type=TIMEOUT_DIVERGENCE trace=${trace} handId=${decision.handId} decision=${decision.step} runtime=${runtime.runtimeStep}`,
      );
    }
  }

  const handsStarted = handStarts.size;
  const handsCompleted = [...handCompletes].filter((h) => handStarts.has(h)).length;
  const incompleteHands = Math.max(0, handsStarted - handsCompleted);
  const handCompletionRate = handsStarted > 0 ? (handsCompleted / handsStarted).toFixed(4) : "1.0000";
  const avgActionsPerHand = handsStarted > 0 ? (actionAcceptedCount / handsStarted).toFixed(4) : "0.0000";
  const stalledPer1kHands = handsStarted > 0 ? ((tableStalled / handsStarted) * 1000).toFixed(2) : "0.00";
  const timeoutRuntimePer1kHands = handsStarted > 0 ? ((timeoutRuntimeCount / handsStarted) * 1000).toFixed(2) : "0.00";
  for (const key of duplicateRejectedActionKeys) {
    if (!acceptedActionKeys.has(key)) {
      duplicateWithoutAcceptance += 1;
      issues.push(`type=DUPLICATE_WITHOUT_ACCEPTANCE actionKey=${key}`);
    }
  }

  console.log("GAME BUG / TIMEOUT ANALYSIS");
  console.log(`file=${fullPath}`);
  console.log(`handsStarted=${handsStarted}`);
  console.log(`handsCompleted=${handsCompleted}`);
  console.log(`incompleteHands=${incompleteHands}`);
  console.log(`handCompletionRate=${handCompletionRate}`);
  console.log(`avgActionsPerHand=${avgActionsPerHand}`);
  console.log(`tableStalled=${tableStalled}`);
  console.log(`stallRecoveryRedrive=${stallRecoveryRedrive}`);
  console.log(`stalledPer1kHands=${stalledPer1kHands}`);
  console.log(`toActMismatchCount=${toActMismatch}`);
  console.log(`turnStalled=${turnStalled}`);
  console.log(`autoActionFailed=${autoActionFailed}`);
  console.log(`autoActionDiscarded=${autoActionDiscarded}`);
  console.log(`actionRejectedCount=${actionRejectedCount}`);
  console.log(`handIdMismatchRejects=${handIdMismatchRejects}`);
  console.log(`duplicateActionRejects=${duplicateActionRejects}`);
  console.log(`duplicateWithoutAcceptance=${duplicateWithoutAcceptance}`);
  console.log(`decisionRuntimePairs=${decisionRuntimePairs}`);
  console.log(`decisionRuntimeMismatches=${decisionRuntimeMismatches}`);
  console.log(`timeoutDecisionCount=${timeoutDecisionCount}`);
  console.log(`timeoutRuntimeCount=${timeoutRuntimeCount}`);
  console.log(`timeoutRuntimePer1kHands=${timeoutRuntimePer1kHands}`);
  console.log(`timeoutDecisionRuntimeMismatch=${timeoutDecisionRuntimeMismatch}`);
  console.log(`timeoutDecisionMissingRuntime=${timeoutDecisionMissingRuntime}`);
  console.log(`timeoutWithMissingDeadline=${timeoutWithMissingDeadline}`);
  console.log(`timeoutDoubleFires=${timeoutDoubleFires}`);
  console.log(`deadlineOutsideWaiting=${deadlineOutsideWaiting}`);
  console.log(`waitingHumanMissingDeadline=${waitingHumanMissingDeadline}`);
  console.log(`waitingHumanNoNeedsAction=${waitingHumanNoNeedsAction}`);
  console.log(`tableStalledMissingReason=${tableStalledMissingReason}`);
  console.log(`tableStalledMissingReasonConnectedHuman=${tableStalledMissingReasonConnectedHuman}`);

  if (stallReasonCounts.size > 0) {
    console.log("");
    console.log("stallReasonBreakdown");
    for (const [reason, count] of [...stallReasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${reason}=${count}`);
    }
  }

  if (actionRejectedReasonCounts.size > 0) {
    console.log("");
    console.log("actionRejectedReasonBreakdown");
    for (const [reason, count] of [...actionRejectedReasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`${reason}=${count}`);
    }
  }

  if (stalledByHand.size > 0) {
    console.log("");
    console.log("stalledHandSummaries");
    const summaries = [...stalledByHand.values()].sort((a, b) => b.stalls - a.stalls);
    const limit = args.maxIssues > 0 ? args.maxIssues : summaries.length;
    for (const s of summaries.slice(0, limit)) {
      const d = lastDecisionStateByHand.get(s.handId);
      if (!d) {
        console.log(
          `handId=${s.handId} tableId=${s.tableId} stalls=${s.stalls} stallStreet=${s.lastStreet} toActSeat=${s.lastToActSeat ?? ""} stallReason=${s.lastStallReason || ""} decisionState=missing`,
        );
        continue;
      }
      console.log(
        `handId=${s.handId} tableId=${s.tableId} stalls=${s.stalls} stallStreet=${s.lastStreet} toActSeat=${s.lastToActSeat ?? ""} stallReason=${s.lastStallReason || ""} decisionStreet=${d.street} decisionRoundState=${d.roundState} decisionActorKind=${d.actorKind} decisionActorConnected=${d.actorConnected} decisionNeedsAction=${d.needsAction} decisionDeadlineMs=${d.turnDeadlineMs ?? 0}`,
      );
    }
  }

  if (issues.length > 0 && args.maxIssues > 0) {
    console.log("");
    console.log(`issues (max ${args.maxIssues})`);
    for (const issue of issues.slice(0, args.maxIssues)) {
      console.log(issue);
    }
  }
}

main();
