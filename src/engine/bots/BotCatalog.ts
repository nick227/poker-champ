export type BotBrainType = "random_v1" | "weighted_v1" | "tight_aggressive_v1" | "ai_v1";

export type BotCatalogEntry = {
  id: string;
  name: string;
  brainType: BotBrainType;
  isEnabled: boolean;
  avatarUrl?: string;
};

export type BotSummary = {
  id: string;
  name: string;
  avatarUrl?: string;
};

const BOT_CATALOG: BotCatalogEntry[] = [
  { id: "chaos_carl", name: "Chaos Carl", brainType: "random_v1", isEnabled: true },
  { id: "nash_nate", name: "Nash Nate", brainType: "tight_aggressive_v1", isEnabled: true },
  { id: "loose_lucy", name: "Loose Lucy", brainType: "random_v1", isEnabled: true },
];

const catalogById = new Map(BOT_CATALOG.map((bot) => [bot.id, bot] as const));

export function listEnabledBotCatalogEntries(): BotCatalogEntry[] {
  return BOT_CATALOG.filter((bot) => bot.isEnabled);
}

function sortBotEntriesDeterministically(a: Pick<BotCatalogEntry, "id" | "name">, b: Pick<BotCatalogEntry, "id" | "name">): number {
  const nameSort = a.name.localeCompare(b.name);
  if (nameSort !== 0) return nameSort;
  return a.id.localeCompare(b.id);
}

export function listEnabledBotSummaries(source: BotCatalogEntry[] = BOT_CATALOG): BotSummary[] {
  return source
    .filter((bot) => bot.isEnabled)
    .slice()
    .sort(sortBotEntriesDeterministically)
    .map((bot) => ({
      id: bot.id,
      name: bot.name,
      avatarUrl: bot.avatarUrl,
    }));
}

export function getBotCatalogEntry(botId: string): BotCatalogEntry | undefined {
  const bot = catalogById.get(botId);
  if (!bot || !bot.isEnabled) return undefined;
  return bot;
}

export function getDefaultBotCatalogEntry(): BotCatalogEntry {
  const firstEnabled = listEnabledBotCatalogEntries()[0];
  return firstEnabled ?? { id: "chaos_carl", name: "Chaos Carl", brainType: "random_v1", isEnabled: true };
}

export function resolveBotSelectionForAdd(
  requestedBotId: string | undefined,
  source: BotCatalogEntry[] = BOT_CATALOG,
): { ok: true; bot: BotCatalogEntry } | { ok: false; reason: "UNKNOWN_OR_DISABLED_BOT" | "NO_ENABLED_BOTS" } {
  if (requestedBotId) {
    const selected = source.find((bot) => bot.id === requestedBotId && bot.isEnabled);
    if (!selected) return { ok: false, reason: "UNKNOWN_OR_DISABLED_BOT" };
    return { ok: true, bot: selected };
  }

  const firstEnabled = source.filter((bot) => bot.isEnabled).slice().sort(sortBotEntriesDeterministically)[0];
  if (!firstEnabled) return { ok: false, reason: "NO_ENABLED_BOTS" };
  return { ok: true, bot: firstEnabled };
}
