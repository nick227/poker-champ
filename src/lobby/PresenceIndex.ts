import type { OnlinePlayerSummary } from "@poker-champ/realtime-contract";

type LobbyLocation = { kind: "LOBBY" };
type TableLocation = { kind: "TABLE"; tableId: string; tableName: string };
type PresenceLocation = LobbyLocation | TableLocation;
type PresenceLocationRef = { location: PresenceLocation; refs: number };

type PresenceEntry = {
  displayName?: string;
  locationsByKey: Map<string, PresenceLocationRef>;
};

type PresenceSubscriber = (totalOnline: number) => void;

function resolveDisplayName(input: { userId: string; displayName?: string }): string {
  const cleaned = input.displayName?.trim();
  if (cleaned) return cleaned;
  return `Player-${input.userId.slice(0, 4)}`;
}

function getInitials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return "P";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

function toLocationKey(location: PresenceLocation): string {
  return location.kind === "LOBBY" ? "LOBBY" : `TABLE:${location.tableId}`;
}

function locationRank(location: OnlinePlayerSummary["location"]): number {
  switch (location.kind) {
    case "TABLE":
      return 0;
    case "MULTI_TABLE":
      return 1;
    case "LOBBY":
      return 2;
    default:
      return 3;
  }
}

type PresenceIndexOptions = { maxEntries?: number };

export class PresenceIndex {
  private readonly entriesByUserId = new Map<string, PresenceEntry>();
  private readonly subscribers = new Set<PresenceSubscriber>();
  private readonly maxEntries?: number;

  constructor(options?: PresenceIndexOptions) {
    this.maxEntries = options?.maxEntries;
  }

  add(userId: string, location: PresenceLocation, displayName?: string): boolean {
    if (!userId) return false;
    const existingUser = this.entriesByUserId.has(userId);
    if (
      this.maxEntries != null &&
      this.entriesByUserId.size >= this.maxEntries &&
      !existingUser
    ) {
      return false;
    }
    const locationKey = toLocationKey(location);
    const entry = this.entriesByUserId.get(userId) ?? {
      displayName: undefined,
      locationsByKey: new Map<string, PresenceLocationRef>(),
    };

    const existing = entry.locationsByKey.get(locationKey);
    const prevTotal = this.entriesByUserId.size;
    const locationChanged = !existing || JSON.stringify(existing.location) !== JSON.stringify(location);

    if (existing) {
      existing.refs += 1;
      if (locationChanged) existing.location = location;
      entry.locationsByKey.set(locationKey, existing);
    } else {
      entry.locationsByKey.set(locationKey, { location, refs: 1 });
    }
    if (displayName && displayName.trim().length > 0) {
      entry.displayName = displayName.trim();
    }
    this.entriesByUserId.set(userId, entry);

    if (!existing || locationChanged || prevTotal !== this.entriesByUserId.size) {
      this.notify();
    }
    return true;
  }

  remove(userId: string, location: PresenceLocation): void {
    const entry = this.entriesByUserId.get(userId);
    if (!entry) return;

    const locationKey = toLocationKey(location);
    const existing = entry.locationsByKey.get(locationKey);
    if (!existing) return;

    if (existing.refs > 1) {
      existing.refs -= 1;
      entry.locationsByKey.set(locationKey, existing);
      this.entriesByUserId.set(userId, entry);
      return;
    }

    entry.locationsByKey.delete(locationKey);

    if (entry.locationsByKey.size === 0) {
      this.entriesByUserId.delete(userId);
    } else {
      this.entriesByUserId.set(userId, entry);
    }
    this.notify();
  }

  getTotalOnline(): number {
    return this.entriesByUserId.size;
  }

  getPlayersSnapshot(): OnlinePlayerSummary[] {
    const players: OnlinePlayerSummary[] = [];
    for (const [userId, entry] of this.entriesByUserId.entries()) {
      const displayName = resolveDisplayName({ userId, displayName: entry.displayName });
      const tableLocations = [...entry.locationsByKey.values()].map((locRef) => locRef.location).filter(
        (loc): loc is TableLocation => loc.kind === "TABLE",
      );

      const location: OnlinePlayerSummary["location"] =
        tableLocations.length === 0
          ? { kind: "LOBBY" }
          : tableLocations.length === 1
            ? {
                kind: "TABLE",
                tableId: tableLocations[0]!.tableId,
                tableName: tableLocations[0]!.tableName,
              }
            : {
                kind: "MULTI_TABLE",
                tables: tableLocations
                  .map((loc) => ({ tableId: loc.tableId, tableName: loc.tableName }))
                  .sort((a, b) => a.tableName.localeCompare(b.tableName)),
              };

      players.push({
        userId,
        displayName,
        initials: getInitials(displayName),
        location,
      });
    }

    return players.sort((a, b) => {
      const rankDiff = locationRank(a.location) - locationRank(b.location);
      if (rankDiff !== 0) return rankDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  }

  subscribe(fn: PresenceSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify(): void {
    const totalOnline = this.getTotalOnline();
    for (const subscriber of this.subscribers) {
      try {
        subscriber(totalOnline);
      } catch {
        // Swallow subscriber exceptions to preserve index consistency.
      }
    }
  }
}

export const presenceIndex = new PresenceIndex();
