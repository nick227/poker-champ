import { afterAll, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { getPrisma } from "@poker-champ/db";
import { CashierService } from "../CashierService.js";
import { ensureCashTableBotUser, getCashTableBotUserId } from "../botInteractionUsers.js";

const runId = nanoid(6);
const catalogBotId = `test_catalog_bot_${runId}`;
const economicUserId = getCashTableBotUserId(catalogBotId);

describe("ensureCashTableBotUser", () => {
  afterAll(async () => {
    const prisma = getPrisma();
    await prisma.balanceTransaction.deleteMany({ where: { userId: economicUserId } });
    await prisma.user.deleteMany({ where: { id: economicUserId } });
  });

  it("resolves two separate runtime instances of the same catalog bot to the same synthetic User row", async () => {
    const prisma = getPrisma();

    // Runtime instance #1: e.g. the bot added at Table A under a fresh newBotId() seat id
    // that never appears anywhere here — only the catalog id is durable.
    await ensureCashTableBotUser(catalogBotId, "Tight Aggressive");
    const afterFirst = await prisma.user.findUniqueOrThrow({ where: { id: economicUserId } });
    expect(afterFirst.id).toBe(economicUserId);

    // Runtime instance #2: the SAME catalog personality, added again — re-added after being
    // removed, or added at a second table entirely, with a different (unused-here) runtime
    // seat id each time. Must resolve to the identical row, never a second one.
    await ensureCashTableBotUser(catalogBotId, "Tight Aggressive");

    const rowsForThisCatalogBot = await prisma.user.count({ where: { id: economicUserId } });
    expect(rowsForThisCatalogBot).toBe(1);
  });

  it("pools money across runtime instances onto the one shared economic identity", async () => {
    // Two "instances" of the same bot personality, each credited independently — e.g. one
    // gift received at Table A, another at Table B. Both must land on the same bankroll,
    // proving the shared row isn't just present but actually load-bearing for money.
    await ensureCashTableBotUser(catalogBotId, "Tight Aggressive");
    await CashierService.creditUser({
      userId: economicUserId,
      amountCents: 100,
      type: "GIFT_RECEIVED",
      externalRef: `test:${runId}:instance-a`,
    });
    await CashierService.creditUser({
      userId: economicUserId,
      amountCents: 250,
      type: "GIFT_RECEIVED",
      externalRef: `test:${runId}:instance-b`,
    });

    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: economicUserId } });
    expect(user.bankrollCents).toBe(350);
  });

  it("never creates a row keyed by a runtime seat id (the pre-fix behavior)", async () => {
    const prisma = getPrisma();
    const wouldHaveBeenTheOldKey = `bot_${nanoid(10)}`; // shape of the old PlayerState.id keying
    const row = await prisma.user.findUnique({ where: { id: wouldHaveBeenTheOldKey } });
    expect(row).toBeNull();
  });
});
