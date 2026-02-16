/**
 * Syncs tokens.css -> tokens.web.ts, watches tokens.css for changes (hot reload),
 * and runs expo start --web. One process: edit tokens.css and save to see changes.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TOKENS_CSS = path.join(ROOT, "src", "theme", "tokens.css");

function runSync() {
  require("./sync-tokens-web.cjs");
}

runSync();

fs.watch(TOKENS_CSS, (eventType, filename) => {
  if (filename && (eventType === "change" || eventType === "rename")) {
    runSync();
  }
});

const expo = spawn("npx", ["expo", "start", "--web"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});
expo.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
expo.on("close", (code) => process.exit(code ?? 0));
