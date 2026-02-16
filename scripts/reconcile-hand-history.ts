import { getPrisma, disconnectPrisma } from "../src/db/prisma.js";

type CliArgs = {
  tableId?: string;
  limit?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tableId") args.tableId = argv[i + 1];
    if (a === "--limit") {
      const parsed = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) args.limit = parsed;
    }
  }
  return args;
}

function nextSeatFrom(current: number, occupiedSeats: number[]): number | null {
  const sorted = [...occupiedSeats].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  for (const s of sorted) {
    if (s > current) return s;
  }
  return sorted[0] ?? null;
}

async function main() {
  const { tableId, limit = 200 } = parseArgs(process.argv.slice(2));
  const prisma = getPrisma() as any;

  const where: any = {
    endedAt: { not: null },
    ...(tableId ? { tableId } : {}),
  };

  const hands = await prisma.hand.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      players: {
        select: {
          playerId: true,
          seat: true,
          startingStackCents: true,
          endingStackCents: true,
        },
      },
      actions: {
        orderBy: [{ actionIndex: "asc" }, { createdAt: "asc" }],
        select: {
          playerId: true,
          actionIndex: true,
          amountCents: true,
        },
      },
      payouts: {
        orderBy: [{ payoutIndex: "asc" }, { createdAt: "asc" }],
        select: {
          playerId: true,
          payoutIndex: true,
          amountCents: true,
        },
      },
      snapshotLogs: {
        select: { reason: true },
      },
    },
  });

  let mismatchedHands = 0;
  const findings: string[] = [];

  for (const hand of hands) {
    const handFindings: string[] = [];

    const expectedActionIndexes = hand.actions.map((_: any, idx: number) => idx + 1);
    const actualActionIndexes = hand.actions.map((a: any) => a.actionIndex);
    if (JSON.stringify(expectedActionIndexes) !== JSON.stringify(actualActionIndexes)) {
      handFindings.push(`non-contiguous actionIndex sequence: actual=${actualActionIndexes.join(",")}`);
    }

    const expectedPayoutIndexes = hand.payouts.map((_: any, idx: number) => idx + 1);
    const actualPayoutIndexes = hand.payouts.map((p: any) => p.payoutIndex);
    if (JSON.stringify(expectedPayoutIndexes) !== JSON.stringify(actualPayoutIndexes)) {
      handFindings.push(`non-contiguous payoutIndex sequence: actual=${actualPayoutIndexes.join(",")}`);
    }

    const occupiedSeats = hand.players.map((p: any) => p.seat);
    const sbSeat = nextSeatFrom(hand.dealerSeat, occupiedSeats);
    const bbSeat = sbSeat == null ? null : nextSeatFrom(sbSeat, occupiedSeats);

    const committedByPlayerId = new Map<string, number>();
    for (const p of hand.players) committedByPlayerId.set(p.playerId, 0);

    if (sbSeat != null) {
      const sb = hand.players.find((p: any) => p.seat === sbSeat);
      if (sb) committedByPlayerId.set(sb.playerId, (committedByPlayerId.get(sb.playerId) ?? 0) + hand.smallBlindCents);
    }
    if (bbSeat != null) {
      const bb = hand.players.find((p: any) => p.seat === bbSeat);
      if (bb) committedByPlayerId.set(bb.playerId, (committedByPlayerId.get(bb.playerId) ?? 0) + hand.bigBlindCents);
    }

    for (const action of hand.actions) {
      committedByPlayerId.set(
        action.playerId,
        (committedByPlayerId.get(action.playerId) ?? 0) + (action.amountCents ?? 0),
      );
    }

    const payoutsByPlayerId = new Map<string, number>();
    for (const p of hand.players) payoutsByPlayerId.set(p.playerId, 0);
    for (const payout of hand.payouts) {
      payoutsByPlayerId.set(
        payout.playerId,
        (payoutsByPlayerId.get(payout.playerId) ?? 0) + (payout.amountCents ?? 0),
      );
    }

    for (const player of hand.players) {
      if (typeof player.endingStackCents !== "number") {
        handFindings.push(`missing endingStackCents for player=${player.playerId}`);
        continue;
      }
      const expectedEnding =
        (player.startingStackCents ?? 0) - (committedByPlayerId.get(player.playerId) ?? 0) + (payoutsByPlayerId.get(player.playerId) ?? 0);
      if (expectedEnding !== player.endingStackCents) {
        handFindings.push(
          `stack mismatch player=${player.playerId} expected=${expectedEnding} actual=${player.endingStackCents}`,
        );
      }
    }

    if (hand.snapshotLogs.length > 0) {
      const reasons = new Set(hand.snapshotLogs.map((s: any) => s.reason));
      if (!reasons.has("HAND_START")) handFindings.push("snapshot gap: missing HAND_START");
      if (!reasons.has("HAND_END")) handFindings.push("snapshot gap: missing HAND_END");
    }

    if (handFindings.length > 0) {
      mismatchedHands += 1;
      findings.push(`hand=${hand.id} table=${hand.tableId} :: ${handFindings.join(" | ")}`);
    }
  }

  const summary = {
    checkedHands: hands.length,
    mismatchedHands,
    findings,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (mismatchedHands > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
