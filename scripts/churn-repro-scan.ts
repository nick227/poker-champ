import { readFile } from "node:fs/promises";
import path from "node:path";

type RecordedEvent = {
  seq: number;
  kind: string;
  handId: string | null;
  street: string | null;
  digest?: {
    actionable?: boolean;
    eligibleActors?: number;
    needsAction?: number;
    toActStatus?: string | null;
    toActNeedsAction?: boolean | null;
  };
};

async function resolveLatestReproFolder(): Promise<string | null> {
  const root = path.join(process.cwd(), "artifacts", "churn-repro");
  let entries: import("node:fs").Dirent[];
  try {
    const fs = await import("node:fs/promises");
    entries = await fs.readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory());
    if (dirs.length === 0) return null;
    const stamped = await Promise.all(
      dirs.map(async (dir) => {
        const fullPath = path.join(root, dir.name);
        const stats = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stats.mtimeMs };
      }),
    );
    stamped.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return stamped[0]?.fullPath ?? null;
  } catch {
    return null;
  }
}

async function parseArgs(): Promise<{ folder: string }> {
  const folder = process.argv[2];
  if (folder) {
    return { folder };
  }
  const latest = await resolveLatestReproFolder();
  if (!latest) throw new Error("Usage: pnpm repro:scan <repro-folder> (or run after a churn repro artifact exists)");
  return { folder: latest };
}

function parseJsonl<T>(raw: string): T[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function findFirst<T>(items: T[], predicate: (value: T) => boolean): T | undefined {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return undefined;
}

async function main(): Promise<void> {
  const { folder } = await parseArgs();
  const eventsPath = path.join(folder, "events.jsonl");
  const eventsRaw = await readFile(eventsPath, "utf8");
  const events = parseJsonl<RecordedEvent>(eventsRaw);

  const actionableNoEligible = findFirst(
    events,
    (e) => Boolean(e.digest?.actionable) && (e.digest?.eligibleActors ?? 0) === 0,
  );
  const actionableNoNeedsAction = findFirst(
    events,
    (e) => Boolean(e.digest?.actionable) && (e.digest?.needsAction ?? 0) === 0,
  );
  const actionableBadToAct = findFirst(
    events,
    (e) =>
      Boolean(e.digest?.actionable) &&
      (e.digest?.toActStatus !== "ACTIVE" || e.digest?.toActNeedsAction !== true),
  );

  const summary = {
    totalEvents: events.length,
    firstActionableNoEligible: actionableNoEligible
      ? { seq: actionableNoEligible.seq, kind: actionableNoEligible.kind, handId: actionableNoEligible.handId, street: actionableNoEligible.street }
      : null,
    firstActionableNoNeedsAction: actionableNoNeedsAction
      ? { seq: actionableNoNeedsAction.seq, kind: actionableNoNeedsAction.kind, handId: actionableNoNeedsAction.handId, street: actionableNoNeedsAction.street }
      : null,
    firstActionableBadToAct: actionableBadToAct
      ? { seq: actionableBadToAct.seq, kind: actionableBadToAct.kind, handId: actionableBadToAct.handId, street: actionableBadToAct.street }
      : null,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("repro scan failed", err);
  process.exit(1);
});
