/**
 * List hands that have replay data, with hero-decision counts and street coverage per seat.
 * Use to pick handId + heroSeat for exporting ghost lessons (aim for 4–6 decisions, prefer TURN+).
 *
 * Usage: pnpm lessons:list-replay-hands [--limit=50] [--minDecisions=4] [--maxDecisions=8]
 */

import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../src/db/prisma.js";
import { ReplayFrameService } from "../src/engine/persistence/ReplayFrameService.js";

const STREET_ORDER: Record<string, number> = {
  PREFLOP: 0,
  FLOP: 1,
  TURN: 2,
  RIVER: 3,
};

function parseArgs(argv: string[]): { limit: number; minDecisions: number; maxDecisions: number } {
  let limit = 50;
  let minDecisions = 0;
  let maxDecisions = 999;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isInteger(n) && n > 0) limit = n;
    } else if (arg.startsWith("--minDecisions=")) {
      const n = Number.parseInt(arg.slice("--minDecisions=".length), 10);
      if (Number.isInteger(n) && n >= 0) minDecisions = n;
    } else if (arg.startsWith("--maxDecisions=")) {
      const n = Number.parseInt(arg.slice("--maxDecisions=".length), 10);
      if (Number.isInteger(n) && n > 0) maxDecisions = n;
    }
  }
  return { limit, minDecisions, maxDecisions };
}

function countDecisionsAndStreetsBySeat(
  frames: { hand?: { toActSeat?: number; street?: string } }[],
): Map<number, { decisions: number; streets: string[] }> {
  const bySeat = new Map<number, { decisions: number; streets: Set<string> }>();
  for (const frame of frames) {
    const toAct = frame.hand?.toActSeat;
    const street = frame.hand?.street;
    if (toAct === undefined) continue;
    if (street === "WAITING" || street === "SHOWDOWN") continue;
    if (!bySeat.has(toAct)) bySeat.set(toAct, { decisions: 0, streets: new Set() });
    const entry = bySeat.get(toAct)!;
    entry.decisions += 1;
    if (street) entry.streets.add(street);
  }
  const result = new Map<number, { decisions: number; streets: string[] }>();
  for (const [seat, { decisions, streets }] of bySeat) {
    const streetList = [...streets].sort((a, b) => (STREET_ORDER[a] ?? 99) - (STREET_ORDER[b] ?? 99));
    result.set(seat, { decisions, streets: streetList });
  }
  return result;
}

function maxStreetRank(streets: string[]): number {
  if (streets.length === 0) return -1;
  return Math.max(...streets.map((s) => STREET_ORDER[s] ?? -1));
}

function pickBestSeat(
  bySeat: Map<number, { decisions: number; streets: string[] }>,
  minDecisions: number,
  maxDecisions: number,
): { bestSeat: number; decisionCount: number; streets: string[] } | null {
  const candidates: Array<{ seat: number; decisions: number; streets: string[]; streetRank: number }> = [];
  for (const [seat, { decisions, streets }] of bySeat) {
    if (decisions < minDecisions || decisions > maxDecisions) continue;
    candidates.push({
      seat,
      decisions,
      streets,
      streetRank: maxStreetRank(streets),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const turnFirst = b.streetRank - a.streetRank;
    if (turnFirst !== 0) return turnFirst;
    return b.decisions - a.decisions;
  });
  const best = candidates[0]!;
  return { bestSeat: best.seat, decisionCount: best.decisions, streets: best.streets };
}

async function main(): Promise<void> {
  const { limit, minDecisions, maxDecisions } = parseArgs(process.argv.slice(2));
  const prisma = getPrisma();

  const replayRows = await prisma.tableSnapshotLog.findMany({
    where: {
      handId: { not: null },
      payloadJson: { path: "$.hero.userId", equals: "SYSTEM" },
    },
    select: { handId: true },
    distinct: ["handId"],
  });

  const idsWithReplay = [...new Set((replayRows.map((r) => r.handId).filter(Boolean) as string[]))];

  const hands = await prisma.hand.findMany({
    where: { id: { in: idsWithReplay }, endedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit * 2,
    select: { id: true, createdAt: true, endedAt: true },
  });

  const results: Array<{
    handId: string;
    endedAt: string | null;
    seats: Array<{ seat: number; decisions: number; streets: string[] }>;
    bestSeat: number | null;
    decisionCount: number | null;
    streets: string[] | null;
  }> = [];

  for (const hand of hands) {
    const frames = await ReplayFrameService.getFramesForHand(hand.id);
    const bySeat = countDecisionsAndStreetsBySeat(frames);
    const seats = [...bySeat.entries()]
      .map(([seat, { decisions, streets }]) => ({ seat, decisions, streets }))
      .filter((s) => s.decisions >= 1)
      .sort((a, b) => a.seat - b.seat);

    const best = pickBestSeat(bySeat, minDecisions, maxDecisions);

    if (minDecisions > 0 || maxDecisions < 999) {
      if (!best) continue;
    }

    results.push({
      handId: hand.id,
      endedAt: hand.endedAt?.toISOString() ?? null,
      seats: seats.map((s) => ({ seat: s.seat, decisions: s.decisions, streets: s.streets })),
      bestSeat: best?.bestSeat ?? null,
      decisionCount: best?.decisionCount ?? null,
      streets: best?.streets ?? null,
    });

    if (results.length >= limit) break;
  }

  results.sort((a, b) => {
    const aRank = a.streets ? maxStreetRank(a.streets) : -1;
    const bRank = b.streets ? maxStreetRank(b.streets) : -1;
    if (bRank !== aRank) return bRank - aRank;
    return (b.decisionCount ?? 0) - (a.decisionCount ?? 0);
  });

  console.log(
    JSON.stringify(
      {
        handsWithReplay: results.length,
        filters: { minDecisions, maxDecisions },
        hands: results,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => disconnectPrisma())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
