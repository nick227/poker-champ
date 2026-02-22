/**
 * Single entrypoint: preflight → web → desktop.
 * Run from repo root: node scripts/build-all.mjs [--web-only]
 * --web-only  Skip desktop build (e.g. for PRs).
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "apps", "client", ".env") });

const webOnly = process.argv.includes("--web-only");

console.log("=== CLIENT BUILD MODE ===");
console.log("WEB ONLY:", webOnly);
console.log("NODE_ENV:", process.env.NODE_ENV ?? "(unset)");
console.log("=========================\n");

const REQUIRED_ENV = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_COLYSEUS_URL",
];

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("Missing required env vars:", missing.join(", "));
    console.error("Set them in apps/client/.env (see .env.example) or before build.");
    process.exit(1);
  }
}

function run(name, cmd) {
  console.log(`\n--- ${name} ---\n`);
  execSync(cmd, { stdio: "inherit", shell: true });
}

run("Preflight", "pnpm preflight:client");
assertEnv();
run("Web", "pnpm build:web");
if (!webOnly) {
  try {
    run("Desktop", "pnpm build:desktop");
  } catch {
    console.warn("\nDesktop build skipped (Tauri CLI not available or build failed). Use --web-only to skip explicitly.\n");
  }
}

console.log("\n--- Done ---\n");
