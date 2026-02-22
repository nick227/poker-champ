/**
 * Inspect hole cards in HandPlayer rows: compare humans vs bots.
 * Usage: npx tsx scripts/inspect-hand-hole-cards.ts [limit]
 * Requires DATABASE_URL and NODE_ENV !== "test".
 */
import "dotenv/config";
import { getPrisma } from "../src/db/prisma.js";

const limit = parseInt(process.argv[2] ?? "20", 10);

async function main() {
  const prisma = getPrisma();

  const hands = await prisma.hand.findMany({
    where: { endedAt: { not: null } },
    select: {
      id: true,
      reason: true,
      createdAt: true,
      players: {
        select: {
          seat: true,
          holeCardsJson: true,
          player: {
            select: {
              externalId: true,
              userId: true,
              displayName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  console.log(`\n--- Last ${hands.length} completed hands: hole card presence ---\n`);

  let handsWithBots = 0;
  let botPlayersTotal = 0;
  let botPlayersWithCards = 0;
  let humanPlayersTotal = 0;
  let humanPlayersWithCards = 0;

  for (const hand of hands) {
    const botPlayers = hand.players.filter((hp) => hp.player.userId == null);
    const humanPlayers = hand.players.filter((hp) => hp.player.userId != null);

    if (botPlayers.length === 0) continue;
    handsWithBots += 1;

    for (const hp of botPlayers) {
      botPlayersTotal += 1;
      const cards = hp.holeCardsJson as unknown;
      const hasCards = Array.isArray(cards) && cards.length >= 2;
      if (hasCards) botPlayersWithCards += 1;
    }
    for (const hp of humanPlayers) {
      humanPlayersTotal += 1;
      const cards = hp.holeCardsJson as unknown;
      const hasCards = Array.isArray(cards) && cards.length >= 2;
      if (hasCards) humanPlayersWithCards += 1;
    }
  }

  console.log("Hands with at least one bot:", handsWithBots);
  console.log("Bot HandPlayer rows:", botPlayersTotal);
  console.log("Bot rows with holeCardsJson (length>=2):", botPlayersWithCards);
  console.log("Human HandPlayer rows (in those hands):", humanPlayersTotal);
  console.log("Human rows with holeCardsJson (length>=2):", humanPlayersWithCards);

  if (handsWithBots > 0) {
    console.log("\n--- Sample hand with bots (first found) ---");
    const sample = hands.find((h) =>
      h.players.some((hp) => hp.player.userId == null)
    );
    if (sample) {
      for (const hp of sample.players.sort((a, b) => a.seat - b.seat)) {
        const isBot = hp.player.userId == null;
        const cards = hp.holeCardsJson as unknown;
        const hasCards = Array.isArray(cards) && cards.length >= 2;
        console.log(
          `  Seat ${hp.seat}: ${hp.player.displayName} (${isBot ? "BOT" : "human"}) externalId=${hp.player.externalId} holeCards=${hasCards ? JSON.stringify(cards) : "null/empty"}`
        );
      }
      // Simulate API response mapping (same as HandHistoryRouter)
      const players = sample.players.map((hp) => {
        const holeCards = (hp.holeCardsJson as string[] | null) ?? undefined;
        return {
          userId: hp.player.userId ?? hp.player.externalId,
          displayName: hp.player.displayName,
          seat: hp.seat,
          holeCards,
        };
      });
      console.log("\n--- API-style players array (as client would receive) ---");
      for (const p of players) {
        console.log(`  ${p.displayName}: holeCards=${JSON.stringify(p.holeCards)}`);
      }
    }
  }

  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
