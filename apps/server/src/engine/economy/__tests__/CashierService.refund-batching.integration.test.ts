import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../CashierService.js";
import {
  tournamentAbandonExternalRef,
  tournamentAbandonRefundExternalRef,
  tournamentCancelExternalRef,
  tournamentCancelRefundExternalRef,
} from "../../../tournaments/tournament.constants.js";

const runId = nanoid(6);
const tournamentIds: string[] = [];
const allUserIds: string[] = [];

async function makeField(prefix: string, count: number, bankrollCents = 100_000) {
  const prisma = getPrisma();
  const userIds = Array.from({ length: count }, (_, i) => `${prefix}_${i}_${runId}`);
  allUserIds.push(...userIds);
  await prisma.user.createMany({
    data: userIds.map((id) => ({
      id,
      email: `${id}@refund-batch.test`,
      passwordHash: "hash",
      displayName: id,
      bankrollCents,
    })),
  });
  return userIds;
}

async function makeRunningTournament(entryFeeCents: number) {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.create({
    data: {
      name: `Batch RUNNING ${nanoid(4)}`,
      entryFeeCents,
      startTime: new Date(Date.now() - 60_000),
      maxPlayers: 500,
      startingStackCents: 5_000,
      blindStructureId: "standard_8min",
      status: "RUNNING",
    },
  });
  tournamentIds.push(tournament.id);
  return tournament;
}

async function makeCancellableTournament(entryFeeCents: number) {
  const prisma = getPrisma();
  const tournament = await prisma.tournament.create({
    data: {
      name: `Batch CANCELLABLE ${nanoid(4)}`,
      entryFeeCents,
      startTime: new Date(Date.now() + 3600_000),
      maxPlayers: 500,
      startingStackCents: 5_000,
      blindStructureId: "standard_8min",
      status: "REGISTERING",
    },
  });
  tournamentIds.push(tournament.id);
  return tournament;
}

async function registerAll(tournamentId: string, userIds: string[]) {
  const prisma = getPrisma();
  await prisma.tournamentRegistration.createMany({
    data: userIds.map((userId) => ({ tournamentId, userId, isBot: false })),
  });
}

describe("CashierService chunked refund batching (Gap 1)", () => {
  afterAll(async () => {
    const prisma = getPrisma();
    for (const id of tournamentIds) {
      await prisma.balanceTransaction.deleteMany({ where: { tournamentId: id } });
      await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: id } });
      await prisma.tournament.deleteMany({ where: { id } });
    }
    await prisma.balanceTransaction.deleteMany({ where: { userId: { in: allUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  });

  it("abandon refunds a large field across multiple batches: every player refunded exactly once, nothing dropped", async () => {
    const prisma = getPrisma();
    const entryFeeCents = 2_500;
    const fieldSize = 133; // deliberately not a multiple of the batch size
    const batchSize = 20; // forces 7 batches
    const userIds = await makeField(`abandon_big_${runId}`, fieldSize);
    const tournament = await makeRunningTournament(entryFeeCents);
    await registerAll(tournament.id, userIds);

    const externalRef = tournamentAbandonExternalRef(tournament.id);
    const result = await CashierService.processTournamentAbandonRefunds({
      tournamentId: tournament.id,
      externalRef,
      batchSize,
    });

    expect(result.refundedCount).toBe(fieldSize);

    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    expect(users).toHaveLength(fieldSize);
    for (const u of users) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }

    const refundTxCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, type: "REFUND", amountCents: entryFeeCents },
    });
    expect(refundTxCount).toBe(fieldSize);

    // Re-running (e.g. a retried caller) must be a no-op: idempotent on the
    // outer marker, no additional credits.
    const second = await CashierService.processTournamentAbandonRefunds({
      tournamentId: tournament.id,
      externalRef,
      batchSize,
    });
    expect(second.refundedCount).toBe(0);
    const usersAfterRerun = await prisma.user.findMany({ where: { id: { in: userIds } } });
    for (const u of usersAfterRerun) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }
  }, 30_000);

  it("abandon refunds resume correctly after a simulated crash partway through (no double-refund, no dropped refund)", async () => {
    const prisma = getPrisma();
    const entryFeeCents = 1_500;
    const fieldSize = 47;
    const batchSize = 10; // 5 batches
    const alreadyDoneCount = 23; // spans into the 3rd batch
    const userIds = await makeField(`abandon_resume_${runId}`, fieldSize);
    const tournament = await makeRunningTournament(entryFeeCents);
    await registerAll(tournament.id, userIds);

    // Simulate a prior run that crashed after committing refunds for the
    // first `alreadyDoneCount` players (their per-player externalRef +
    // bankroll credit already landed) but never reached the rest or the
    // outer completion marker.
    const alreadyDoneUserIds = userIds.slice(0, alreadyDoneCount);
    for (const userId of alreadyDoneUserIds) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { bankrollCents: { increment: entryFeeCents } } });
        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId,
            tournamentId: tournament.id,
            type: "REFUND",
            amountCents: entryFeeCents,
            externalRef: tournamentAbandonRefundExternalRef(tournament.id, userId),
            metaJson: { kind: "TOURNAMENT_ABANDON" },
          },
        });
      });
    }

    const externalRef = tournamentAbandonExternalRef(tournament.id);
    const result = await CashierService.processTournamentAbandonRefunds({
      tournamentId: tournament.id,
      externalRef,
      batchSize,
    });

    // All players end up refunded exactly once: the 23 "pre-done" ones were
    // recognized as already-refunded (counted, not re-credited) and the
    // remaining 24 were refunded fresh in this call.
    expect(result.refundedCount).toBe(fieldSize);

    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    for (const u of users) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }
    const refundTxCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, type: "REFUND", amountCents: entryFeeCents },
    });
    expect(refundTxCount).toBe(fieldSize);
  }, 30_000);

  it("admin cancel refunds a large field across multiple batches and is idempotent on retry", async () => {
    const prisma = getPrisma();
    const entryFeeCents = 900;
    const fieldSize = 87;
    const batchSize = 15; // 6 batches
    const adminUserId = `refund_batch_admin_${runId}`;
    allUserIds.push(adminUserId);
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: `${adminUserId}@refund-batch.test`,
        passwordHash: "hash",
        displayName: adminUserId,
        bankrollCents: 0,
      },
    });

    const userIds = await makeField(`cancel_big_${runId}`, fieldSize);
    const tournament = await makeCancellableTournament(entryFeeCents);
    await registerAll(tournament.id, userIds);

    const externalRef = tournamentCancelExternalRef(tournament.id);
    const result = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId,
      externalRef,
      batchSize,
    });

    expect(result.refundedCount).toBe(fieldSize);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    for (const u of users) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }
    const tourney = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tourney.status).toBe("CANCELLED");
    expect(tourney.prizePoolCents).toBe(0);

    const second = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId,
      externalRef,
      batchSize,
    });
    expect(second.refundedCount).toBe(0);
    const usersAfterRerun = await prisma.user.findMany({ where: { id: { in: userIds } } });
    for (const u of usersAfterRerun) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }
  }, 30_000);

  it("admin cancel resumes correctly after a simulated crash partway through a batched refund run", async () => {
    const prisma = getPrisma();
    const entryFeeCents = 1_200;
    const fieldSize = 34;
    const batchSize = 8; // ~5 batches
    const alreadyDoneCount = 17;
    const adminUserId = `refund_batch_admin_resume_${runId}`;
    allUserIds.push(adminUserId);
    await prisma.user.create({
      data: {
        id: adminUserId,
        email: `${adminUserId}@refund-batch.test`,
        passwordHash: "hash",
        displayName: adminUserId,
        bankrollCents: 0,
      },
    });

    const userIds = await makeField(`cancel_resume_${runId}`, fieldSize);
    const tournament = await makeCancellableTournament(entryFeeCents);
    await registerAll(tournament.id, userIds);

    const alreadyDoneUserIds = userIds.slice(0, alreadyDoneCount);
    for (const userId of alreadyDoneUserIds) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { bankrollCents: { increment: entryFeeCents } } });
        await tx.balanceTransaction.create({
          data: {
            id: nanoid(),
            userId,
            tournamentId: tournament.id,
            type: "REFUND",
            amountCents: entryFeeCents,
            externalRef: tournamentCancelRefundExternalRef(tournament.id, userId),
          },
        });
      });
    }

    const externalRef = tournamentCancelExternalRef(tournament.id);
    const result = await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId,
      externalRef,
      batchSize,
    });

    expect(result.refundedCount).toBe(fieldSize);
    const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    for (const u of users) {
      expect(u.bankrollCents).toBe(100_000 + entryFeeCents);
    }
    const refundTxCount = await prisma.balanceTransaction.count({
      where: { tournamentId: tournament.id, type: "REFUND", amountCents: entryFeeCents },
    });
    expect(refundTxCount).toBe(fieldSize);
    const tourney = await prisma.tournament.findUniqueOrThrow({ where: { id: tournament.id } });
    expect(tourney.status).toBe("CANCELLED");
  }, 30_000);
});
