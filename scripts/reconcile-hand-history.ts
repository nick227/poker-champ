import { getPrisma, disconnectPrisma } from "@poker-champ/db";

type CliArgs = {
  tableId?: string;
  limit?: number;
  strictFinancial?: boolean;
  strictLogs?: boolean;
};

const TERMINAL_SNAPSHOT_REASONS = new Set(["HAND_END", "SHOWDOWN"]);

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tableId") args.tableId = argv[i + 1];
    if (a === "--limit") {
      const parsed = Number.parseInt(argv[i + 1] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) args.limit = parsed;
    }
    if (a === "--strict-financial") args.strictFinancial = true;
    if (a === "--strict-logs") args.strictLogs = true;
    if (a === "--strict") {
      args.strictFinancial = true;
      args.strictLogs = true;
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
  const {
    tableId,
    limit = 200,
    strictFinancial = false,
    strictLogs = false,
  } = parseArgs(process.argv.slice(2));
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
          player: {
            select: {
              externalId: true,
              userId: true,
            },
          },
        },
      },
      actions: {
        orderBy: [{ actionIndex: "asc" }, { createdAt: "asc" }],
        select: {
          playerId: true,
          actionIndex: true,
          action: true,
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
      txs: {
        select: {
          userId: true,
          type: true,
          amountCents: true,
        },
      },
      snapshotLogs: {
        select: { reason: true },
      },
    },
  });

  let mismatchedHands = 0;
  let stackMismatchHands = 0;
  let snapshotGapHands = 0;
  let missingEndingStackHands = 0;
  let negativeEndingStackHands = 0;
  let financialIssueHands = 0;
  let logIssueHands = 0;
  const findings: string[] = [];

  for (const hand of hands) {
    const handFindings: string[] = [];
    let hasStackMismatch = false;
    let hasSnapshotGap = false;
    let hasMissingEndingStack = false;
    let hasNegativeEndingStack = false;
    let hasFinancialIssue = false;
    let hasLogIssue = false;

    const expectedActionIndexes = hand.actions.map((_: any, idx: number) => idx + 1);
    const actualActionIndexes = hand.actions.map((a: any) => a.actionIndex);
    if (JSON.stringify(expectedActionIndexes) !== JSON.stringify(actualActionIndexes)) {
      handFindings.push(`non-contiguous actionIndex sequence: actual=${actualActionIndexes.join(",")}`);
      hasLogIssue = true;
    }

    const expectedPayoutIndexes = hand.payouts.map((_: any, idx: number) => idx + 1);
    const actualPayoutIndexes = hand.payouts.map((p: any) => p.payoutIndex);
    if (JSON.stringify(expectedPayoutIndexes) !== JSON.stringify(actualPayoutIndexes)) {
      handFindings.push(`non-contiguous payoutIndex sequence: actual=${actualPayoutIndexes.join(",")}`);
      hasLogIssue = true;
    }

    const committedByPlayerId = new Map<string, number>();
    for (const p of hand.players) committedByPlayerId.set(p.playerId, 0);

    // Blind posting is now persisted as explicit HandAction rows (POST_SB / POST_BB).
    // Only infer blinds from seats for legacy rows that predate blind-action persistence.
    const hasRecordedBlindActions = hand.actions.some((a: any) => a.action === "POST_SB" || a.action === "POST_BB");
    if (!hasRecordedBlindActions) {
      const occupiedSeats = hand.players.map((p: any) => p.seat);
      const sbSeat = nextSeatFrom(hand.dealerSeat, occupiedSeats);
      const bbSeat = sbSeat == null ? null : nextSeatFrom(sbSeat, occupiedSeats);
      if (sbSeat != null) {
        const sb = hand.players.find((p: any) => p.seat === sbSeat);
        if (sb) committedByPlayerId.set(sb.playerId, (committedByPlayerId.get(sb.playerId) ?? 0) + hand.smallBlindCents);
      }
      if (bbSeat != null) {
        const bb = hand.players.find((p: any) => p.seat === bbSeat);
        if (bb) committedByPlayerId.set(bb.playerId, (committedByPlayerId.get(bb.playerId) ?? 0) + hand.bigBlindCents);
      }
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

    const playerIdByExternalId = new Map<string, string>();
    const playerIdByUserId = new Map<string, string>();
    for (const p of hand.players) {
      const externalId = p.player?.externalId;
      if (typeof externalId === "string" && externalId.length > 0) {
        playerIdByExternalId.set(externalId, p.playerId);
      }
      const userId = p.player?.userId;
      if (typeof userId === "string" && userId.length > 0) {
        playerIdByUserId.set(userId, p.playerId);
      }
    }
    const refundsByPlayerId = new Map<string, number>();
    for (const p of hand.players) refundsByPlayerId.set(p.playerId, 0);
    let refundTxCount = 0;
    for (const tx of hand.txs) {
      if (tx.type !== "REFUND") continue;
      refundTxCount += 1;
      const playerId = playerIdByUserId.get(tx.userId) ?? playerIdByExternalId.get(tx.userId);
      if (!playerId) continue;
      refundsByPlayerId.set(playerId, (refundsByPlayerId.get(playerId) ?? 0) + (tx.amountCents ?? 0));
    }

    const expectedEndingByPlayerId = new Map<string, number>();
    for (const player of hand.players) {
      const expectedEnding =
        (player.startingStackCents ?? 0) -
        (committedByPlayerId.get(player.playerId) ?? 0) +
        (payoutsByPlayerId.get(player.playerId) ?? 0) +
        (refundsByPlayerId.get(player.playerId) ?? 0);
      expectedEndingByPlayerId.set(player.playerId, expectedEnding);
    }

    // Legacy compatibility: older rows may miss REFUND transactions for uncalled returns.
    // If total ending stacks exceed computed expected mass, attribute positive remainder to
    // the top contributor (the only player eligible for uncalled return in hand resolution).
    if (refundTxCount === 0) {
      const totalActual = hand.players.reduce(
        (sum: number, p: any) => sum + (typeof p.endingStackCents === "number" ? p.endingStackCents : 0),
        0,
      );
      const totalExpected = hand.players.reduce(
        (sum: number, p: any) => sum + (expectedEndingByPlayerId.get(p.playerId) ?? 0),
        0,
      );
      const positiveRemainder = totalActual - totalExpected;
      if (positiveRemainder > 0) {
        const topCommitted = [...committedByPlayerId.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (topCommitted) {
          expectedEndingByPlayerId.set(topCommitted, (expectedEndingByPlayerId.get(topCommitted) ?? 0) + positiveRemainder);
        }
      }
    }

    for (const player of hand.players) {
      if (typeof player.endingStackCents !== "number") {
        handFindings.push(`missing endingStackCents for player=${player.playerId}`);
        hasMissingEndingStack = true;
        hasFinancialIssue = true;
        continue;
      }
      if (player.endingStackCents < 0) {
        handFindings.push(`negative endingStackCents for player=${player.playerId} value=${player.endingStackCents}`);
        hasNegativeEndingStack = true;
        hasFinancialIssue = true;
      }
      const expectedEnding = expectedEndingByPlayerId.get(player.playerId) ?? 0;
      if (expectedEnding !== player.endingStackCents) {
        handFindings.push(
          `stack mismatch player=${player.playerId} expected=${expectedEnding} actual=${player.endingStackCents}`,
        );
        hasStackMismatch = true;
        hasFinancialIssue = true;
      }
    }

    if (hand.snapshotLogs.length > 0) {
      const reasons = new Set(hand.snapshotLogs.map((s: any) => s.reason));
      if (!reasons.has("HAND_START")) {
        handFindings.push("snapshot gap: missing HAND_START");
        hasSnapshotGap = true;
        hasLogIssue = true;
      }
      const hasTerminal = [...reasons].some((reason: string) => TERMINAL_SNAPSHOT_REASONS.has(reason));
      if (!hasTerminal) {
        handFindings.push("snapshot gap: missing terminal snapshot");
        hasSnapshotGap = true;
        hasLogIssue = true;
      }
    }

    if (handFindings.length > 0) {
      mismatchedHands += 1;
      if (hasStackMismatch) stackMismatchHands += 1;
      if (hasSnapshotGap) snapshotGapHands += 1;
      if (hasMissingEndingStack) missingEndingStackHands += 1;
      if (hasNegativeEndingStack) negativeEndingStackHands += 1;
      if (hasFinancialIssue) financialIssueHands += 1;
      if (hasLogIssue) logIssueHands += 1;
      findings.push(`hand=${hand.id} table=${hand.tableId} :: ${handFindings.join(" | ")}`);
    }
  }

  const summary = {
    checkedHands: hands.length,
    mismatchedHands,
    stackMismatchHands,
    snapshotGapHands,
    missingEndingStackHands,
    negativeEndingStackHands,
    financialIssueHands,
    logIssueHands,
    strictFinancialMode: strictFinancial,
    strictLogsMode: strictLogs,
    findings,
  };

  console.log(JSON.stringify(summary, null, 2));

  const shouldFail =
    (strictFinancial && financialIssueHands > 0) ||
    (strictLogs && logIssueHands > 0) ||
    (!strictFinancial && !strictLogs && financialIssueHands > 0);
  if (shouldFail) {
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

