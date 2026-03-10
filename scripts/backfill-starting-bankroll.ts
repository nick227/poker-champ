import { disconnectPrisma, getPrisma } from "@poker-champ/db";

const STARTING_BANKROLL_CENTS = 1_000_000;

type Mode = "dry-run" | "apply";

function parseMode(argv: string[]): Mode {
  return argv.includes("--apply") ? "apply" : "dry-run";
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const prisma = getPrisma();

  const where = { bankrollCents: 0 };
  const count = await prisma.user.count({ where });

  if (count === 0) {
    // eslint-disable-next-line no-console
    console.log("[bankroll-backfill] No users matched bankrollCents=0");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[bankroll-backfill] matched=${count} mode=${mode} target=${STARTING_BANKROLL_CENTS}`);

  if (mode === "dry-run") {
    // eslint-disable-next-line no-console
    console.log("[bankroll-backfill] Dry-run only. Re-run with --apply to execute.");
    return;
  }

  const result = await prisma.user.updateMany({
    where,
    data: { bankrollCents: STARTING_BANKROLL_CENTS },
  });

  // eslint-disable-next-line no-console
  console.log(`[bankroll-backfill] updated=${result.count}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[bankroll-backfill] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });

