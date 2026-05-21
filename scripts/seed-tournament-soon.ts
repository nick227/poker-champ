import { disconnectPrisma, getPrisma } from "@poker-champ/db";

const BLIND_STRUCTURE_ID = "standard_8min";

type SeedOptions = {
  name: string;
  entryFeeCents: number;
  maxPlayers: number;
  startingStackCents: number;
  startsInMinutes: number;
  fillBotsAtStart: boolean;
  fillBotCount: number | null;
};

function parseArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function parseOptions(argv: string[]): SeedOptions {
  const entryFee = Number(parseArg(argv, "--entry-fee-cents") ?? "1000");
  const maxPlayers = Number(parseArg(argv, "--max-players") ?? "6");
  const startingStack = Number(parseArg(argv, "--starting-stack-cents") ?? "10000");
  const startsInMinutes = Number(parseArg(argv, "--starts-in-minutes") ?? "5");
  const name = parseArg(argv, "--name") ?? `QA Tournament ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  const fillBotsAtStart = argv.includes("--fill-bots");
  const fillBotCountRaw = parseArg(argv, "--bot-count");
  const fillBotCount =
    fillBotCountRaw == null ? null : Number(fillBotCountRaw);

  if (!Number.isInteger(entryFee) || entryFee <= 0) {
    throw new Error("--entry-fee-cents must be a positive integer");
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 9) {
    throw new Error("--max-players must be between 2 and 9");
  }
  if (!Number.isInteger(startingStack) || startingStack <= 0) {
    throw new Error("--starting-stack-cents must be a positive integer");
  }
  if (!Number.isInteger(startsInMinutes) || startsInMinutes < 1 || startsInMinutes > 1440) {
    throw new Error("--starts-in-minutes must be between 1 and 1440");
  }
  if (fillBotCount != null && (!Number.isInteger(fillBotCount) || fillBotCount < 1 || fillBotCount > 8)) {
    throw new Error("--bot-count must be between 1 and 8");
  }

  return {
    name,
    entryFeeCents: entryFee,
    maxPlayers,
    startingStackCents: startingStack,
    startsInMinutes,
    fillBotsAtStart,
    fillBotCount,
  };
}

async function main() {
  const opts = parseOptions(process.argv.slice(2));
  const prisma = getPrisma();
  const startTime = new Date(Date.now() + opts.startsInMinutes * 60_000);

  const tournament = await prisma.tournament.create({
    data: {
      name: opts.name,
      status: "REGISTERING",
      entryFeeCents: opts.entryFeeCents,
      prizePoolCents: 0,
      startTime,
      maxPlayers: opts.maxPlayers,
      startingStackCents: opts.startingStackCents,
      blindStructureId: BLIND_STRUCTURE_ID,
      lateRegMinutes: 0,
      fillBotsAtStart: opts.fillBotsAtStart,
      fillBotCount: opts.fillBotCount,
    },
  });

  // eslint-disable-next-line no-console
  console.log("[tournament-seed] created", {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    entryFeeCents: tournament.entryFeeCents,
    maxPlayers: tournament.maxPlayers,
    startingStackCents: tournament.startingStackCents,
    startTime: tournament.startTime.toISOString(),
    startsInMinutes: opts.startsInMinutes,
    blindStructureId: tournament.blindStructureId,
    fillBotsAtStart: tournament.fillBotsAtStart,
    fillBotCount: tournament.fillBotCount,
  });
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[tournament-seed] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
