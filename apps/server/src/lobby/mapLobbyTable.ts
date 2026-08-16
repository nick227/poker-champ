import type { LobbyTableSummary } from "./types.js";

export function resolveLobbyViewer(
  state?: "SEATED_ACTIVE" | "SEATED_SITTING_OUT",
): LobbyTableSummary["viewer"] {
  if (state === "SEATED_ACTIVE") return { status: "SEATED", canResume: true };
  if (state === "SEATED_SITTING_OUT") return { status: "RECONNECTABLE", canResume: true };
  return { status: "NONE", canResume: false };
}

export function resolveLobbyOccupancy(
  metadata: Record<string, unknown>,
  fallbackClients: number,
): number {
  if (typeof metadata.seatedCount === "number") return metadata.seatedCount;
  if (typeof metadata.humanCount === "number") return metadata.humanCount;
  return fallbackClients;
}

export function toLobbyTableSummary(r: {
  metadata?: Record<string, unknown>;
  roomId?: string;
  clients?: number;
  maxClients?: number;
}): LobbyTableSummary {
  const m = r.metadata ?? {};
  const humanCount = typeof m.humanCount === "number" ? m.humanCount : undefined;
  const connectedHumanCount = typeof m.connectedHumanCount === "number" ? m.connectedHumanCount : undefined;
  const seatedCount = typeof m.seatedCount === "number" ? m.seatedCount : undefined;
  return {
    tableId: (m.tableId as string) ?? r.roomId ?? "",
    roomId: r.roomId ?? "",
    name: (m.name as string) ?? "Hold'em",
    players: resolveLobbyOccupancy(m, r.clients ?? 0),
    maxSeats: (m.maxSeats as number) ?? r.maxClients ?? 9,
    smallBlindCents: (m.smallBlindCents as number) ?? 50,
    bigBlindCents: (m.bigBlindCents as number) ?? 100,
    minBuyInCents: (m.minBuyInCents as number) ?? 2000,
    maxBuyInCents: (m.maxBuyInCents as number) ?? 20000,
    visibility: (m.visibility as "PUBLIC" | "PRIVATE") ?? "PUBLIC",
    showStats: (m.showStats as boolean) ?? false,
    speed: (m.speed as "normal" | "fast") ?? "normal",
    runningSince: typeof m.runningSince === "number" ? m.runningSince : null,
    createdAt: (m.createdAt as number) ?? Date.now(),
    updatedAt: (m.updatedAt as number) ?? (m.createdAt as number) ?? Date.now(),
    creatorId: m.creatorId != null ? String(m.creatorId) : undefined,
    creatorName: typeof m.creatorName === "string" && m.creatorName.length > 0 ? m.creatorName : "Player",
    creatorAvatarUrl: typeof m.creatorAvatarUrl === "string" ? m.creatorAvatarUrl : null,
    humanCount,
    connectedHumanCount,
    seatedCount,
    status: "LIVE",
    viewer: resolveLobbyViewer(),
  };
}
