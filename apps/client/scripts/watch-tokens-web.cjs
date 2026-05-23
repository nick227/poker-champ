/**
 * Syncs tokens.css -> tokens.web.ts, watches tokens.css for changes (hot reload),
 * and runs expo start --web. One process: edit tokens.css and save to see changes.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { cleanAllWorkspaceHoistStubs } = require("./clean-pnpm-hoist-stubs.cjs");

const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "../..");
const TOKENS_CSS = path.join(ROOT, "src", "theme", "tokens.css");

const removed = cleanAllWorkspaceHoistStubs(REPO_ROOT);
if (removed.length > 0) {
  const summary =
    removed.length > 40
      ? `${removed.length} entries`
      : removed.join(", ");
  console.warn(`Removed broken pnpm hoist stubs: ${summary}`);
}

function runSync() {
  require("./sync-tokens-web.cjs");
}

runSync();

fs.watch(TOKENS_CSS, (eventType, filename) => {
  if (filename && (eventType === "change" || eventType === "rename")) {
    runSync();
  }
});

const expo = spawn("pnpm", ["exec", "expo", "start", "--web"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});
expo.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
expo.on("close", (code) => process.exit(code ?? 0));
