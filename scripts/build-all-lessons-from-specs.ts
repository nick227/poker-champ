/**
 * Build all lesson specs in content/lessons/content/_specs/ and then seed.
 * Specs named L43-flop-fold.json → lessonId L43, etc.
 * Usage: pnpm lessons:build:all-specs [--force] [--no-seed]
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SPECS_DIR = path.join(ROOT, "content", "lessons", "content", "_specs");

const L_ID_REGEX = /^L(\d{2,})-/;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const noSeed = argv.includes("--no-seed");

  const files = await fs.readdir(SPECS_DIR);
  const specFiles = files.filter((f) => f.endsWith(".json") && L_ID_REGEX.test(f)).sort();

  if (specFiles.length === 0) {
    console.log("No L##-*.json spec files found in _specs/");
    process.exit(0);
  }

  const forceFlag = force ? " --force" : "";
  let built = 0;
  for (const file of specFiles) {
    const match = file.match(L_ID_REGEX);
    const lessonId = match ? `L${match[1]}` : null;
    if (!lessonId) continue;
    const specPath = path.join(SPECS_DIR, file);
    try {
      execSync(
        `pnpm lessons:build:from-spec --spec=${specPath} --lessonId=${lessonId}${forceFlag}`,
        { cwd: ROOT, stdio: "inherit" },
      );
    } catch (err) {
      console.error(`Failed to build ${file} -> ${lessonId}:`, err);
      process.exit(1);
    }
    built++;
  }

  console.log(`Built ${built} lessons from specs.`);

  if (!noSeed) {
    console.log("Running pnpm lessons:seed:content ...");
    try {
      execSync("pnpm lessons:seed:content", { cwd: ROOT, stdio: "inherit" });
    } catch (err) {
      console.error("Seed failed:", err);
      process.exit(1);
    }
    console.log("Seed complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
