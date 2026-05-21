export function isTournamentTableMetadata(metadata: Record<string, unknown> | undefined): boolean {
  if (!metadata) return false;
  return typeof metadata.tournamentId === "string" && metadata.tournamentId.length > 0;
}

export function filterCashLobbyTables<T extends Record<string, unknown>>(tables: T[]): T[] {
  return tables.filter((t) => !isTournamentTableMetadata(t));
}
