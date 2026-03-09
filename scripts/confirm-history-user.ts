/**
 * Confirm hand history results for a user by email.
 * Usage: npx tsx scripts/confirm-history-user.ts [email]
 */
import "dotenv/config";
import { getPrisma } from "../apps/server/src/db/prisma.js";

const email = process.argv[2] ?? "test@example.com";

async function main() {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true },
  });
  if (!user) {
    console.log(`User not found: ${email}`);
    process.exit(1);
  }
  const userId = user.id;
  console.log(`User: ${user.email} (${user.username ?? user.id})\n`);

  const hands = await prisma.hand.findMany({
    where: {
      endedAt: { not: null },
      players: { some: { player: { userId } } },
    },
    select: {
      id: true,
      createdAt: true,
      players: {
        select: {
          startingStackCents: true,
          endingStackCents: true,
          player: { select: { userId: true } },
        },
      },
      payouts: {
        select: {
          amountCents: true,
          player: { select: { userId: true } },
        },
      },
    },
  });

  let totalHands = 0;
  let totalProfitCents = 0;
  let winningHands = 0;
  let totalPotCents = 0;
  let biggestPotCents = 0;

  for (const hand of hands) {
    const hero = hand.players.find((hp) => hp.player?.userId === userId);
    if (!hero) continue;
    totalHands += 1;
    const endingStack = hero.endingStackCents ?? hero.startingStackCents;
    const netResult = endingStack - hero.startingStackCents;
    const potCents = hand.payouts.reduce((sum, p) => sum + p.amountCents, 0);
    totalProfitCents += netResult;
    if (netResult > 0) winningHands += 1;
    totalPotCents += potCents;
    if (potCents > biggestPotCents) biggestPotCents = potCents;
  }

  const winRate = totalHands > 0 ? (winningHands / totalHands) * 100 : 0;
  const avgPotCents = totalHands > 0 ? totalPotCents / totalHands : 0;

  console.log("--- Overview (computed like API) ---");
  console.log("totalHands:", totalHands);
  console.log("totalProfitCents:", totalProfitCents);
  console.log("winningHands:", winningHands);
  console.log("winRate:", winRate.toFixed(1) + "%");
  console.log("avgPotCents:", Math.round(avgPotCents));
  console.log("biggestPotCents:", biggestPotCents);
  console.log("\n--- Raw hand count (where user participated) ---");
  console.log("hands.length:", hands.length);
  console.log("\n--- PokerPlayer rows for this user ---");
  const pokerPlayers = await prisma.pokerPlayer.count({
    where: { userId },
  });
  console.log("PokerPlayer count (userId = user):", pokerPlayers);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
