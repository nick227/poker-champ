export const BOT_DEMO_PRESET = {
  name: "QA Bot Demo",
  entryFeeDollars: "10",
  maxPlayers: "6",
  fillBotCount: "5",
  startingStack: "10000",
  startsInMinutes: 15,
} as const;

export const BOT_DEMO_HELPER_COPY =
  "Bot demo: one human can register; remaining seats fill with catalog bots at start. Prize pool and payouts use human entries only.";

type BotFillTournament = {
  fillBotsAtStart?: boolean;
  fillBotCount?: number | null;
  maxPlayers: number;
  registeredCount?: number;
};

export function resolveTournamentBotFillTarget(
  tournament: BotFillTournament,
  humanCount?: number,
): number | null {
  if (!tournament.fillBotsAtStart) return null;
  const humans = humanCount ?? Math.max(0, tournament.registeredCount ?? 0);
  const openSeats = Math.max(0, tournament.maxPlayers - (tournament.registeredCount ?? 0));
  if (openSeats === 0) return 0;
  const defaultTarget = Math.max(0, tournament.maxPlayers - humans);
  const requested = tournament.fillBotCount ?? defaultTarget;
  return Math.min(openSeats, Math.max(0, requested));
}

export function formatTournamentBotFillSummary(tournament: BotFillTournament): string | null {
  if (!tournament.fillBotsAtStart) return null;
  const target = resolveTournamentBotFillTarget(tournament);
  if (target == null) return "Bot fill enabled";
  if (target === 0) return "Bot fill enabled (table full)";
  const countLabel =
    tournament.fillBotCount != null
      ? `up to ${target} bot${target === 1 ? "" : "s"}`
      : `fills open seats (up to ${target} bot${target === 1 ? "" : "s"})`;
  return `Bot fill: ${countLabel} at start`;
}
