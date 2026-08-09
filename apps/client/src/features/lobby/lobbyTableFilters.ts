import type { LobbyTableRow } from "@/lib/lobbyTables";

export type LobbyTableFilters = {
  query: string;
  hideFull: boolean;
  maxBigBlindCents: number | null;
};

export const DEFAULT_LOBBY_FILTERS: LobbyTableFilters = {
  query: "",
  hideFull: false,
  maxBigBlindCents: null,
};

const STORAGE_KEY = "lobby-table-filters-v1";

export function loadLobbyFilters(): LobbyTableFilters {
  if (typeof sessionStorage === "undefined") return DEFAULT_LOBBY_FILTERS;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOBBY_FILTERS;
    const parsed = JSON.parse(raw) as Partial<LobbyTableFilters>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      hideFull: Boolean(parsed.hideFull),
      maxBigBlindCents:
        typeof parsed.maxBigBlindCents === "number" ? parsed.maxBigBlindCents : null,
    };
  } catch {
    return DEFAULT_LOBBY_FILTERS;
  }
}

export function saveLobbyFilters(filters: LobbyTableFilters): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
}

export function applyLobbyFilters(
  rows: LobbyTableRow[],
  filters: LobbyTableFilters,
): LobbyTableRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.hideFull && row.players >= row.seats) return false;
    if (filters.maxBigBlindCents != null && row.bigBlindCents > filters.maxBigBlindCents) {
      return false;
    }
    if (q && !row.name.toLowerCase().includes(q) && !(row.blinds ?? "").includes(q)) {
      return false;
    }
    return true;
  });
}
