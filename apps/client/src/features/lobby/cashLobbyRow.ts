import type { LobbyTableRow } from "@/lib/lobbyTables";

export type CashLobbyStatus = "open" | "waitlist" | "full" | "joined";
export type CashLobbyCta = "join" | "resume" | "view";

export function resolveCashLobbyStatus(
  table: Pick<LobbyTableRow, "players" | "seats" | "waitlistCount">,
  pinned: boolean,
): CashLobbyStatus {
  if (pinned) return "joined";
  if ((table.waitlistCount ?? 0) > 0) return "waitlist";
  if (table.seats > 0 && table.players >= table.seats) return "full";
  return "open";
}

export function cashLobbyStatusLabel(
  status: CashLobbyStatus,
  waitlistCount?: number,
): string {
  if (status === "joined") return "Joined";
  if (status === "waitlist") {
    const n = waitlistCount ?? 0;
    return n === 1 ? "1 on Waitlist" : `${n} on Waitlist`;
  }
  if (status === "full") return "Full";
  return "Open";
}

export function resolveCashLobbyCta(status: CashLobbyStatus): CashLobbyCta {
  if (status === "joined") return "resume";
  if (status === "open") return "join";
  return "view";
}

export function cashLobbyCtaLabel(cta: CashLobbyCta, compact: boolean): string {
  if (cta === "resume") return "Resume";
  if (cta === "join") return compact ? "Join" : "Join Table";
  return "Watch";
}

export function occupancyDotCount(seats: number): number {
  if (seats <= 0) return 0;
  return Math.min(seats, 9);
}

export function occupancyFilledCount(players: number, seats: number): number {
  const dots = occupancyDotCount(seats);
  if (seats <= 0 || dots <= 0) return 0;
  return Math.round((Math.min(Math.max(players, 0), seats) / seats) * dots);
}
