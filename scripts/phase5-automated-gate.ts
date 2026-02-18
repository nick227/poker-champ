import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
  durationMs: number;
};

type GateReport = {
  ranAtIso: string;
  environment: string;
  checks: CheckResult[];
  overallPass: boolean;
};

function nowMs() {
  return Date.now();
}

async function runCommand(name: string, command: string, args: string[], timeoutMs: number): Promise<CheckResult> {
  const started = nowMs();
  return await new Promise<CheckResult>((resolveResult) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: true,
      stdio: "pipe",
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = nowMs() - started;
      const pass = !timedOut && code === 0;
      const details = timedOut
        ? `${name} timed out after ${timeoutMs}ms`
        : `${name} exitCode=${code}\n${stdout}${stderr}`.trim();
      resolveResult({ name, pass, details, durationMs });
    });
  });
}

function killProcessTree(pid: number | undefined) {
  if (!pid) return;
  try {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { shell: true, stdio: "ignore" });
  } catch {
    try {
      process.kill(pid);
    } catch {}
  }
}

async function checkBackendHealth(): Promise<CheckResult> {
  const started = nowMs();
  const child = spawn("pnpm", ["tsx", "src/index.ts"], {
    cwd: process.cwd(),
    shell: true,
    stdio: "pipe",
    env: process.env,
  });

  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += String(d);
  });

  try {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5000));
    const response = await fetch("http://localhost:2567/health");
    const body = await response.text();
    const pass = response.status === 200;
    return {
      name: "backend-health",
      pass,
      details: `status=${response.status} body=${body}`.trim(),
      durationMs: nowMs() - started,
    };
  } catch (err) {
    return {
      name: "backend-health",
      pass: false,
      details: `health check failed: ${String(err)} ${stderr}`.trim(),
      durationMs: nowMs() - started,
    };
  } finally {
    killProcessTree(child.pid);
  }
}

async function checkClientStartup(): Promise<CheckResult> {
  const started = nowMs();
  const metroPort = String(18081 + Math.floor(Math.random() * 1000));
  const child = spawn("pnpm", ["dev:web"], {
    cwd: process.cwd(),
    shell: true,
    stdio: "pipe",
    env: {
      ...process.env,
      RCT_METRO_PORT: metroPort,
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => {
    stdout += String(d);
  });
  child.stderr?.on("data", (d) => {
    stderr += String(d);
  });

  try {
    await new Promise((resolveWait) => setTimeout(resolveWait, 8000));
    const running = child.exitCode === null;
    const output = `${stdout}\n${stderr}`;
    const startedServing =
      /Waiting on/i.test(output) ||
      /Web is waiting on/i.test(output) ||
      /Web is running at/i.test(output);
    const knownStartupBlocker =
      /Input is required, but 'npx expo' is in non-interactive mode/i.test(output) ||
      /Skipping dev server/i.test(output);
    const pass = running || (startedServing && !knownStartupBlocker);

    return {
      name: "client-startup",
      pass,
      details: pass
        ? running
          ? "dev:web process observed running"
          : "dev:web emitted startup-ready web server logs"
        : `dev:web exited code=${child.exitCode}\n${output}`.trim(),
      durationMs: nowMs() - started,
    };
  } finally {
    killProcessTree(child.pid);
  }
}

async function main() {
  const checks: CheckResult[] = [];
  checks.push(await runCommand("verify", "pnpm", ["verify"], 8 * 60_000));
  checks.push(await checkBackendHealth());
  checks.push(await checkClientStartup());

  const report: GateReport = {
    ranAtIso: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    checks,
    overallPass: checks.every((c) => c.pass),
  };

  const outDir = resolve(process.cwd(), "artifacts");
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, "phase5-automated-gate.json");
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // eslint-disable-next-line no-console
  console.log(`Phase5 automated gate: ${report.overallPass ? "PASS" : "FAIL"} -> ${outFile}`);
  for (const check of checks) {
    // eslint-disable-next-line no-console
    console.log(`- ${check.name}: ${check.pass ? "PASS" : "FAIL"} (${check.durationMs}ms)`);
  }

  if (!report.overallPass) process.exit(1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("phase5 automated gate failed", err);
  process.exit(1);
});
