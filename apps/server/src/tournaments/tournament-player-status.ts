import { canRebuyTournament } from "./tournament-schedule.js";

export type TournamentPlayerStatus =
  | "ACTIVE"
  | "ELIMINATED"
  | "REBUY_PENDING"
  | "WINNER"
  | "NOT_REGISTERED";

export function resolveTournamentPlayerStatus(input: {
  isRegistered: boolean;
  tournamentStatus: string;
  finishPlace: number | null;
  eliminatedAt: Date | null;
  rebuyPendingAt?: Date | null;
  rebuyEligible?: boolean;
}): TournamentPlayerStatus {
  if (!input.isRegistered) {
    return "NOT_REGISTERED";
  }
  if (input.finishPlace === 1 && input.tournamentStatus === "FINISHED") {
    return "WINNER";
  }
  if (input.finishPlace != null && input.finishPlace > 1) {
    return "ELIMINATED";
  }
  if (input.rebuyPendingAt != null && input.finishPlace == null) {
    return input.rebuyEligible === false ? "ELIMINATED" : "REBUY_PENDING";
  }
  if (input.eliminatedAt != null) {
    return "ELIMINATED";
  }
  return "ACTIVE";
}

export function isTournamentRebuyEligible(
  tournament: {
    playFormat: string;
    startTime: Date;
    rebuyPeriodMinutes: number;
    maxRebuysPerPlayer: number;
  },
  rebuyCount: number,
  now: Date = new Date(),
): boolean {
  return canRebuyTournament(tournament, { rebuyCount }, now);
}

export function resolveRegisteredTournamentPlayerStatus(
  tournament: {
    status: string;
    playFormat: string;
    startTime: Date;
    rebuyPeriodMinutes: number;
    maxRebuysPerPlayer: number;
  },
  registration: {
    finishPlace: number | null;
    eliminatedAt: Date | null;
    rebuyPendingAt: Date | null;
  },
  rebuyCount = 0,
  now: Date = new Date(),
): TournamentPlayerStatus {
  const rebuyEligible =
    registration.rebuyPendingAt != null
      ? isTournamentRebuyEligible(tournament, rebuyCount, now)
      : undefined;
  return resolveTournamentPlayerStatus({
    isRegistered: true,
    tournamentStatus: tournament.status,
    finishPlace: registration.finishPlace,
    eliminatedAt: registration.eliminatedAt,
    rebuyPendingAt: registration.rebuyPendingAt,
    rebuyEligible,
  });
}

export function isTournamentSpectateEligible(input: {
  tournamentStatus: string;
  tableId: string | null;
  roomId: string | null;
}): boolean {
  if (!input.tableId || !input.roomId) {
    return false;
  }
  return (
    input.tournamentStatus === "STARTING" ||
    input.tournamentStatus === "LATE_REG" ||
    input.tournamentStatus === "RUNNING"
  );
}
