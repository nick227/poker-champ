#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
    ...options,
  });
  return result;
}

function parseMetric(output, name) {
  const m = output.match(new RegExp(`^${name}=(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const serverDir = path.resolve(scriptDir, "..");
  const repoRoot = path.resolve(serverDir, "..", "..");
  const analyzerPath = path.join(serverDir, "scripts", "analyze-round-state-transitions.mjs");
  const logDir = path.join(repoRoot, "var", "logs");
  const logPath = path.join(logDir, "round-state-parity-ci.log");

  fs.mkdirSync(logDir, { recursive: true });

  const testArgs = [
    "--dir",
    serverDir,
    "test",
    "--",
    "src/tests/integration/hand-lifecycle.integration.test.ts",
  ];
  const testResult = run("pnpm", testArgs, {
    env: { ...process.env, FEATURE_ROUND_STATE_MACHINE: "true" },
  });

  const combined = `${testResult.stdout ?? ""}${testResult.stderr ?? ""}`;
  fs.writeFileSync(logPath, combined, "utf8");
  process.stdout.write(combined);

  if (testResult.status !== 0) {
    console.error(
      `Round-state parity precheck failed: integration test run failed (status=${String(testResult.status)} signal=${String(testResult.signal)} log=${logPath}).`,
    );
    process.exit(testResult.status ?? 1);
  }

  const analyzeResult = run("node", [analyzerPath, "--file", logPath, "--max-issues", "20"]);
  const analysisOut = `${analyzeResult.stdout ?? ""}${analyzeResult.stderr ?? ""}`;
  process.stdout.write("\n" + analysisOut + "\n");

  if (analyzeResult.status !== 0) {
    console.error("Round-state parity precheck failed: analyzer execution failed.");
    process.exit(analyzeResult.status ?? 1);
  }

  const healthy = parseMetric(analysisOut, "healthy");
  const rejectedEvents = Number(parseMetric(analysisOut, "rejectedEvents") ?? "0");
  const illegalEvents = Number(parseMetric(analysisOut, "illegalTransitionEvents") ?? "0");
  const invariantViolations = Number(parseMetric(analysisOut, "invariantViolations") ?? "0");
  const handsOverTransitionLimit = Number(parseMetric(analysisOut, "handsOverTransitionLimit") ?? "0");

  if (
    healthy !== "true" ||
    !Number.isFinite(rejectedEvents) ||
    rejectedEvents > 0 ||
    !Number.isFinite(illegalEvents) ||
    illegalEvents > 0 ||
    !Number.isFinite(invariantViolations) ||
    invariantViolations > 0 ||
    !Number.isFinite(handsOverTransitionLimit) ||
    handsOverTransitionLimit > 0
  ) {
    console.error(
      `Round-state parity precheck failed: healthy=${healthy} rejectedEvents=${rejectedEvents} illegalTransitionEvents=${illegalEvents} invariantViolations=${invariantViolations} handsOverTransitionLimit=${handsOverTransitionLimit} (log=${logPath}).`,
    );
    process.exit(1);
  }

  console.log(`Round-state parity precheck passed (log=${logPath}).`);
}

main();
