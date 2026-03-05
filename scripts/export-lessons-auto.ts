/**
 * Auto-export ghost lessons: scan replay hands (4–6 decisions, prefer TURN), pick best seat per hand, export to L22–L31.
 * Usage: pnpm lessons:export:auto [--count=10] [--force]
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_LESSONS = path.join(ROOT, "content", "lessons", "content");

function parseArgs(argv: string[]): { count: number; force: boolean } {
  let count = 10;
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg.startsWith("--count=")) {
      const n = Number.parseInt(arg.slice("--count=".length), 10);
      if (Number.isInteger(n) && n > 0) count = n;
    }
  }
  return { count, force };
}

function lessonExists(lessonId: string): boolean {
  const dir = path.join(CONTENT_LESSONS, lessonId);
  return existsSync(path.join(dir, "step-config.json")) || existsSync(path.join(dir, "export-meta.json"));
}

type ListHand = {
  handId: string;
  bestSeat: number | null;
  decisionCount: number | null;
  streets: string[] | null;
};

function listHands(limit: number): ListHand[] {
  const cmd = `pnpm lessons:list-replay-hands --minDecisions=4 --maxDecisions=8 --limit=${limit}`;
  const out = execSync(cmd, { encoding: "utf8", cwd: ROOT });
  const parsed = JSON.parse(out) as { hands?: ListHand[] };
  return parsed.hands ?? [];
}

function main(): void {
  const { count, force } = parseArgs(process.argv.slice(2));
  const lessonIds = Array.from({ length: count }, (_, i) => `L${22 + i}`);

  const hands = listHands(count);
  if (hands.length === 0) {
    console.error("No hands with 4–8 decisions and a recommended seat. Play more hands with replay enabled.");
    process.exit(1);
  }

  for (let i = 0; i < count && i < hands.length; i++) {
    const hand = hands[i]!;
    if (hand.bestSeat == null) continue;
    const lessonId = lessonIds[i]!;
    if (lessonExists(lessonId) && !force) {
      console.error(`Error: Lesson ${lessonId} already exists. Use --force to overwrite.`);
      process.exit(1);
    }
    const forceFlag = force ? " --force" : "";
    const cmd = `pnpm lessons:export:replay --handId=${hand.handId} --heroSeat=${hand.bestSeat} --lessonId=${lessonId} --maxSteps=6${forceFlag}`;
    console.log(`Exporting ${lessonId} from hand ${hand.handId} seat ${hand.bestSeat} (${hand.decisionCount} decisions)`);
    execSync(cmd, { stdio: "inherit", cwd: ROOT });
  }

  console.log(JSON.stringify({ exported: Math.min(count, hands.length), lessonIds: lessonIds.slice(0, hands.length) }, null, 2));
}

main();
