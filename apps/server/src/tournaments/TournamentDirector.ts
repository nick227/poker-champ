import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import type { Tournament } from "@prisma/client";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { computeNextLevelAt, getBlindLevel, getBlindLevels } from "./blind-structure.js";
import { MAX_SEATS_PER_TABLE, tournamentCancelExternalRef } from "./tournament.constants.js";
import { fillTournamentBotRegistrations } from "./tournament-bot-fill.js";
import { parseTournamentBotCatalogId } from "./tournament-bot-users.js";
import { buildTournamentTableConfig } from "./tournament-table-config.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";
import { isTournamentRoomLive, loadLivePokerRoomIds } from "./tournament-room-live.js";
import { abandonTournamentAtMaxBlind } from "./tournament-abandon.js";
import { isLateRegistrationClosed, isLateRegistrationOpen } from "./tournament-schedule.js";
import { eliminateLateRegistrationNoShows } from "./tournament-late-reg-no-shows.js";
import {
  MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
  MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL,
  MIN_TOURNAMENT_SEATED_TO_DEAL,
  type TryStartTournamentTableResult,
} from "./tournament-table-start.js";
import {
  isTournamentSpectateEligible,
  resolveRegisteredTournamentPlayerStatus,
  type TournamentPlayerStatus,
} from "./tournament-player-status.js";
import { countTournamentRebuysForUser } from "./tournament-rebuy.js";

type TournamentWithRegistrations = Tournament & {
  registrations: { userId: string; isBot: boolean; finishPlace: number | null; user: { displayName: string } }[];
};

export type TournamentEnsureTableJoinStatus =
  | "READY"
  | "RESTORED"
  | "CREATING_TABLE"
  | "ENDED"
  | "NOT_ALLOWED"
  | "FAILED";

export type TournamentEnsureTableResult = {
  tournamentId: string;
  tournamentStatus: string;
  playerStatus: TournamentPlayerStatus;
  tableId: string | null;
  roomId: string | null;
  tableLive: boolean;
  joinStatus: TournamentEnsureTableJoinStatus;
  recoveryReason?: string;
};

type SecondaryTournamentTableRoomResult =
  | { ok: true; tableId: string; roomId: string; wasAlreadyLive: boolean; hadStaleRoom: boolean }
  | { ok: false; reason: "table_not_found" | "tournament_not_found" | "room_create_failed"; tournamentStatus?: string };

/**
 * Transient TournamentTable.status value marking "a provisioning claim is in flight for this
 * table's room right now" -- distinct from the real OPEN/BREAKING/CLOSED lifecycle values (see
 * the MTT proposal). Guards `claimSecondaryTournamentTableProvisioning`'s CAS; also recognized by
 * `closeTournamentTableIfStale` so the orphan reconciler doesn't race a live claim.
 */
const TOURNAMENT_TABLE_PROVISIONING_STATUS = "PROVISIONING";
const CONCURRENT_PROVISION_WAIT_ATTEMPTS = 20;
const CONCURRENT_PROVISION_WAIT_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prisma P2002 = unique constraint violation. */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

function asFinishedSecondaryTableProvision(row: {
  status: string;
  tableId: string | null;
  roomId: string | null;
}): Extract<SecondaryTournamentTableRoomResult, { ok: true }> | null {
  if (row.status !== "OPEN" || !row.tableId || !row.roomId) return null;
  return { ok: true, tableId: row.tableId, roomId: row.roomId, wasAlreadyLive: true, hadStaleRoom: false };
}

function resolveRoomId(created: unknown): string | undefined {
  if (typeof created === "string") return created;
  if (created && typeof created === "object" && "roomId" in created) {
    const roomId = (created as { roomId?: string }).roomId;
    return typeof roomId === "string" ? roomId : undefined;
  }
  return undefined;
}

/** Lobby-phase tournaments tolerate an under-threshold seed (still waiting on players); a
 *  RUNNING/LATE_REG-closed tournament that fails to seat enough players is a hard failure. */
function isReadyToDealSeed(humanSeated: number, seated: number): boolean {
  return humanSeated >= MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL && seated >= MIN_TOURNAMENT_SEATED_TO_DEAL;
}

function resolvePrimaryTableSeedOutcome(
  status: string,
  humanSeated: number,
  seated: number,
): { ok: true; nextStatus: string; readyToDeal: boolean } | { ok: false } {
  if (isReadyToDealSeed(humanSeated, seated)) return { ok: true, nextStatus: "RUNNING", readyToDeal: true };
  if (LOBBY_PHASE_TOURNAMENT_STATUSES.has(status)) return { ok: true, nextStatus: status, readyToDeal: false };
  return { ok: false };
}

function isPrimaryTournamentTableLive(
  tournament: { roomId: string | null; tableId: string | null },
  tableLive: boolean,
): boolean {
  return Boolean(tournament.roomId && tournament.tableId && tableLive);
}

function buildHumanSeatRequests(
  registrants: { userId: string; isBot: boolean; user: { displayName: string } }[],
): { userId: string; displayName: string }[] {
  return registrants
    .filter((reg) => !reg.isBot)
    .map((reg) => ({ userId: reg.userId, displayName: reg.user.displayName }));
}

function buildBotSeatRequests(
  registrants: { userId: string; isBot: boolean; user: { displayName: string } }[],
): { userId: string; displayName: string; catalogBotId: string }[] {
  return registrants
    .filter((reg) => reg.isBot)
    .map((reg) => {
      const catalogBotId = parseTournamentBotCatalogId(reg.userId);
      if (!catalogBotId) {
        throw new Error(`TOURNAMENT_BOT_CATALOG_ID_MISSING:${reg.userId}`);
      }
      return { userId: reg.userId, displayName: reg.user.displayName, catalogBotId };
    });
}

function shouldTournamentTableStayOpen(
  status: string,
  hasStoredRoom: boolean,
  roomDead: boolean,
  staleByTime: boolean,
): boolean {
  if (status === "RUNNING" && !hasStoredRoom) return true;
  return !roomDead && !staleByTime;
}

function secondaryTableJoinStatus(room: { wasAlreadyLive: boolean; hadStaleRoom: boolean }): TournamentEnsureTableJoinStatus {
  if (room.wasAlreadyLive) return "READY";
  return room.hadStaleRoom ? "RESTORED" : "CREATING_TABLE";
}

function isSecondaryTable(
  table: { id: string; tableNumber: number } | null,
): table is { id: string; tableNumber: number } {
  return table !== null && table.tableNumber !== 1;
}

const SPECTATE_ELIGIBLE_PLAYER_STATUSES = new Set<TournamentPlayerStatus>(["ELIMINATED", "REBUY_PENDING"]);
const TERMINAL_TOURNAMENT_STATUSES = new Set(["FINISHED", "ABANDONED", "CANCELLED"]);
const SEATABLE_TOURNAMENT_STATUSES = new Set(["RUNNING", "LATE_REG", "STARTING"]);
const LOBBY_PHASE_TOURNAMENT_STATUSES = new Set(["LATE_REG", "STARTING"]);

const NOT_REGISTERED_LOG_FIELDS = {
  open: { reason: "not_registered_late_reg_open", contract: "register_first_then_ensure_table" },
  closed: { reason: "not_registered_late_reg_closed", contract: "registration_closed" },
} as const;

function bootstrapFailureJoinStatus(
  reason: Extract<TryStartTournamentTableResult, { ok: false }>["reason"],
): TournamentEnsureTableJoinStatus {
  return reason === "insufficient_registrations" || reason === "not_due" ? "NOT_ALLOWED" : "FAILED";
}

function bootstrapFailureRecoveryReason(
  reason: Extract<TryStartTournamentTableResult, { ok: false }>["reason"],
): string {
  if (reason === "insufficient_registrations") return "TOURNAMENT_AWAITING_PLAYERS";
  if (reason === "not_due") return "TOURNAMENT_NOT_DUE";
  return "TOURNAMENT_TABLE_UNAVAILABLE";
}

export class TournamentDirector {
  async tick(now: Date = new Date()): Promise<void> {
    await this.processDueTournaments(now);
    await this.processLateRegistrationWindows(now);
    await this.processLateRegistrationClosures(now);
    await this.resumeStuckStartingTournaments(now);
    await this.resumeDeadTournamentRooms(now);
    await this.reconcileOrphanRunningTournaments();
    await this.advanceDueBlindLevels(now);
  }

  /**
   * Close RUNNING/STARTING tournaments whose Colyseus room(s) no longer exist (e.g. after server
   * restart). Reconciles per-TournamentTable: each table's room can independently go stale, so
   * every non-CLOSED table is checked against `loadLivePokerRoomIds()` and closed individually;
   * the whole Tournament only flips to FINISHED once every table is CLOSED. Table #1 is always
   * checked against Tournament.tableId/roomId (the authoritative fields for the primary table,
   * mirrored but not relied upon via the TournamentTable row's own copy) so an N=1 tournament --
   * still the only case reachable while maxPlayers stays capped at 9 -- reconciles identically to
   * before this proposal. Tournaments with no TournamentTable rows at all (not yet provisioned,
   * or pre-migration) fall back to the original single-room check unchanged.
   */
  async reconcileOrphanRunningTournaments(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const open = await prisma.tournament.findMany({
      where: { status: { in: ["STARTING", "RUNNING"] } },
      take: 50,
    });
    if (open.length === 0) return;

    const liveRoomIds = await loadLivePokerRoomIds();
    const staleBefore = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    for (const tournament of open) {
      await this.reconcileOrphanTournament(tournament, now, liveRoomIds, staleBefore);
    }
  }

  private async reconcileOrphanTournament(
    tournament: { id: string; status: string; roomId: string | null; startTime: Date },
    now: Date,
    liveRoomIds: Set<string>,
    staleBefore: Date,
  ): Promise<void> {
    const prisma = getPrisma();
    const tables = await prisma.tournamentTable.findMany({
      where: { tournamentId: tournament.id, status: { not: "CLOSED" } },
      orderBy: { tableNumber: "asc" },
    });

    if (tables.length === 0) {
      await this.reconcileLegacySingleTableTournament(tournament, now, liveRoomIds, staleBefore);
      return;
    }

    const closedFlags = await Promise.all(
      tables.map((table) => this.closeTournamentTableIfStale(tournament, table, now, liveRoomIds, staleBefore)),
    );
    if (!closedFlags.every(Boolean)) return;

    await this.finishOrphanTournament(tournament, now);
  }

  /** Close a single (non-primary or primary) TournamentTable if its room is dead/stale. Returns whether it closed. */
  private async closeTournamentTableIfStale(
    tournament: { id: string; status: string; roomId: string | null; startTime: Date },
    table: { id: string; tableNumber: number; roomId: string | null; status: string },
    now: Date,
    liveRoomIds: Set<string>,
    staleBefore: Date,
  ): Promise<boolean> {
    // A table mid-provisioning-claim isn't dead -- it's actively being (re)provisioned right now
    // (see claimSecondaryTournamentTableProvisioning). Racing to close it out from under that
    // claim would strand the room the claim holder is about to persist.
    if (table.status === TOURNAMENT_TABLE_PROVISIONING_STATUS) return false;
    return this.closeStaleTournamentTable(tournament, table, now, liveRoomIds, staleBefore);
  }

  private async closeStaleTournamentTable(
    tournament: { id: string; status: string; roomId: string | null; startTime: Date },
    table: { id: string; tableNumber: number; roomId: string | null },
    now: Date,
    liveRoomIds: Set<string>,
    staleBefore: Date,
  ): Promise<boolean> {
    const isPrimary = table.tableNumber === 1;
    const roomId = isPrimary ? tournament.roomId : table.roomId;
    const hasStoredRoom = Boolean(roomId);
    const roomDead = hasStoredRoom && !isTournamentRoomLive(roomId, liveRoomIds);
    const staleByTime = tournament.startTime < staleBefore;

    if (shouldTournamentTableStayOpen(tournament.status, hasStoredRoom, roomDead, staleByTime)) return false;

    const prisma = getPrisma();
    await prisma.tournamentTable.update({
      where: { id: table.id },
      data: { status: "CLOSED", closedAt: now },
    });
    logger.info(
      { tournamentId: tournament.id, tournamentTableId: table.id, tableNumber: table.tableNumber, roomId, roomDead, staleByTime },
      "TOURNAMENT_TABLE_ORPHAN_CLOSED",
    );
    return true;
  }

  private async reconcileLegacySingleTableTournament(
    tournament: { id: string; status: string; roomId: string | null; startTime: Date },
    now: Date,
    liveRoomIds: Set<string>,
    staleBefore: Date,
  ): Promise<void> {
    const hasStoredRoom = Boolean(tournament.roomId);
    const roomDead = hasStoredRoom && !isTournamentRoomLive(tournament.roomId, liveRoomIds);
    const staleByTime = tournament.startTime < staleBefore;
    if (shouldTournamentTableStayOpen(tournament.status, hasStoredRoom, roomDead, staleByTime)) return;

    await this.finishOrphanTournament(tournament, now, { roomDead, staleByTime });
  }

  private async finishOrphanTournament(
    tournament: { id: string; roomId?: string | null },
    now: Date,
    meta?: { roomDead?: boolean; staleByTime?: boolean },
  ): Promise<void> {
    const prisma = getPrisma();
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: "FINISHED", finishedAt: now },
    });
    try {
      await processTournamentFinishResults(tournament.id);
    } catch (err: unknown) {
      logger.error(
        {
          err,
          tournamentId: tournament.id,
          message: err instanceof Error ? err.message : String(err),
        },
        "TOURNAMENT_ORPHAN_FINISH_RESULTS_FAILED",
      );
    }
    logger.info(
      { tournamentId: tournament.id, roomId: tournament.roomId ?? null, ...meta },
      "TOURNAMENT_ORPHAN_CLOSED",
    );
  }

  async processDueTournaments(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const due = await prisma.tournament.findMany({
      where: {
        status: "REGISTERING",
        startTime: { lte: now },
      },
      orderBy: { startTime: "asc" },
      take: 20,
    });

    for (const tournament of due) {
      try {
        if (tournament.lateRegMinutes > 0) {
          await this.beginLateRegistration(tournament.id, now);
        } else {
          await this.processTournament(tournament.id, now);
        }
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_DIRECTOR_PROCESS_FAILED",
        );
      }
    }
  }

  async beginLateRegistration(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const claimed = await prisma.tournament.updateMany({
      where: { id: tournamentId, status: "REGISTERING", startTime: { lte: now } },
      data: { status: "LATE_REG" },
    });
    if (claimed.count !== 1) return;

    logger.info({ tournamentId }, "TOURNAMENT_LATE_REG_OPENED");
    const start = await this.tryStartTournamentTable(tournamentId);
    if (!start.ok && start.reason === "insufficient_registrations") {
      logger.info(
        {
          tournamentId,
          registrationCount: start.registrationCount,
          required: MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
        },
        "TOURNAMENT_TABLE_AWAITING_PLAYERS",
      );
    }
  }

  async processLateRegistrationWindows(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const open = await prisma.tournament.findMany({
      where: { status: "LATE_REG", lateRegMinutes: { gt: 0 } },
      take: 20,
    });
    for (const row of open) {
      try {
        await this.tryStartTournamentTable(row.id);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: row.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_LATE_REG_START_FAILED",
        );
      }
    }
  }

  async processLateRegistrationClosures(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const candidates = await prisma.tournament.findMany({
      where: {
        lateRegMinutes: { gt: 0 },
        status: { in: ["LATE_REG", "RUNNING"] },
      },
      take: 30,
    });

    for (const row of candidates) {
      if (!isLateRegistrationClosed(row, now)) continue;
      try {
        await this.closeLateRegistration(row.id, now);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: row.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_LATE_REG_CLOSE_FAILED",
        );
      }
    }
  }

  async closeLateRegistration(tournamentId: string, now: Date = new Date()): Promise<void> {
    const tournament = await this.loadTournamentWithRegistrations(tournamentId);
    if (!tournament || tournament.lateRegMinutes <= 0) return;
    if (!isLateRegistrationClosed(tournament, now)) return;

    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournamentId);
    }
    const refreshed = await this.loadTournamentWithRegistrations(tournamentId);
    if (!refreshed) return;

    const registeredCount = refreshed.registrations.length;
    const humanRegisteredCount = refreshed.registrations.filter((reg) => !reg.isBot).length;
    if (humanRegisteredCount < 1 || registeredCount < 2) {
      await this.cancelLowEntries(tournamentId, refreshed);
      return;
    }

    if (refreshed.status === "LATE_REG" && !refreshed.roomId) {
      await this.startTournamentWithTable(refreshed);
    }

    const afterTable = await this.loadTournamentWithRegistrations(tournamentId);
    if (afterTable?.roomId) {
      const seatedHumanUserIds = await this.loadTournamentSeatedHumanUserIds(afterTable.roomId);
      await eliminateLateRegistrationNoShows(tournamentId, seatedHumanUserIds, now);
      await this.promoteRunningAfterLateRegClose(tournamentId, afterTable.roomId);
    }

    logger.info({ tournamentId }, "TOURNAMENT_LATE_REG_CLOSED");
  }

  /** After late reg locks, flip to RUNNING when the table meets deal thresholds (including bot-only fields). */
  private async promoteRunningAfterLateRegClose(tournamentId: string, roomId: string): Promise<void> {
    const prisma = getPrisma();
    const tournament = await this.loadTournamentWithRegistrations(tournamentId);
    if (!tournament || tournament.status !== "LATE_REG") return;

    const seatedCount = await this.loadTournamentSeatedPlayerCount(roomId);
    const seatedHumanUserIds = await this.loadTournamentSeatedHumanUserIds(roomId);
    const activeHumans = tournament.registrations.filter((r) => !r.isBot && r.finishPlace == null).length;

    const botOnlyField = activeHumans === 0 && seatedCount >= MIN_TOURNAMENT_SEATED_TO_DEAL;
    const normalField =
      seatedHumanUserIds.size >= MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL &&
      seatedCount >= MIN_TOURNAMENT_SEATED_TO_DEAL;

    if (!botOnlyField && !normalField) return;

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "RUNNING" },
    });
    logger.info({ tournamentId, seatedCount, humanSeatedCount: seatedHumanUserIds.size, botOnlyField }, "TOURNAMENT_PROMOTED_AFTER_LATE_REG_CLOSE");
  }

  private async loadTournamentSeatedPlayerCount(roomId: string): Promise<number> {
    try {
      const count = (await matchMaker.remoteRoomCall(
        roomId,
        "getTournamentSeatedPlayerCount" as never,
        [],
        10_000,
      )) as number;
      return typeof count === "number" ? count : 0;
    } catch {
      return 0;
    }
  }

  private async loadTournamentSeatedHumanUserIds(roomId: string): Promise<Set<string>> {
    try {
      const ids = (await matchMaker.remoteRoomCall(
        roomId,
        "getTournamentSeatedHumanUserIds" as never,
        [],
        10_000,
      )) as string[];
      return new Set(ids);
    } catch (err: unknown) {
      logger.warn(
        {
          roomId,
          message: err instanceof Error ? err.message : String(err),
        },
        "TOURNAMENT_SEATED_HUMANS_LOOKUP_FAILED",
      );
      return new Set();
    }
  }

  async tryStartTournamentTable(tournamentId: string): Promise<TryStartTournamentTableResult> {
    const prisma = getPrisma();
    const tournament = await this.loadTournamentWithRegistrations(tournamentId);
    if (!tournament) {
      return { ok: false, reason: "not_found" };
    }
    if (tournament.status === "REGISTERING" && tournament.startTime.getTime() > Date.now()) {
      return { ok: false, reason: "not_due", registrationCount: tournament.registrations.length };
    }
    if (tournament.roomId && tournament.tableId) {
      return { ok: true, roomId: tournament.roomId, tableId: tournament.tableId };
    }
    if (tournament.roomId) {
      return { ok: false, reason: "start_failed" };
    }

    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournamentId);
    }
    const refreshed = await this.loadTournamentWithRegistrations(tournamentId);
    const registrationCount = refreshed?.registrations.length ?? 0;
    if (!refreshed || registrationCount < MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION) {
      return { ok: false, reason: "insufficient_registrations", registrationCount };
    }

    await this.startTournamentWithTable(refreshed);

    const after = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { roomId: true, tableId: true, status: true },
    });
    if (after?.roomId && after.tableId) {
      return { ok: true, roomId: after.roomId, tableId: after.tableId };
    }
    return { ok: false, reason: "start_failed", registrationCount };
  }

  async seatLateRegistrant(tournamentId: string, userId: string): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { userId },
          include: { user: { select: { displayName: true } } },
        },
      },
    });
    if (
      !tournament?.roomId ||
      (tournament.status !== "RUNNING" &&
        tournament.status !== "LATE_REG" &&
        tournament.status !== "STARTING")
    ) {
      return;
    }

    const reg = tournament.registrations[0];
    if (!reg || reg.isBot) return;

    await matchMaker.remoteRoomCall(
      tournament.roomId,
      "seedTournamentPlayers" as never,
      [
        [{ userId: reg.userId, displayName: reg.user.displayName }],
        tournament.startingStackCents,
        tournament.id,
      ],
      30_000,
    );
  }

  /**
   * Table-aware counterpart to seatLateRegistrant: seats a registrant on whichever
   * TournamentTable they're actually assigned to (resolving/persisting that assignment first via
   * the same fewest-seated-OPEN-table rule ensureTournamentTableForJoinDetailed uses), instead of
   * always the primary room. Used by the /register route so a late registrant on a multi-table
   * tournament lands on their real table. Falls back to seatLateRegistrant (primary, unchanged)
   * when the resolved table is #1 or no TournamentTable rows exist yet -- an N=1 tournament (the
   * only case reachable today) always takes that fallback, so /register's observable behavior is
   * unchanged for it.
   */
  async seatRegistrantOnAssignedTable(tournamentId: string, userId: string): Promise<void> {
    const registration = await getPrisma().tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { tournamentTableId: true },
    });
    if (!registration) return;

    const table = await this.resolveActiveTournamentTableForUser(
      tournamentId,
      userId,
      registration.tournamentTableId,
    );
    if (!isSecondaryTable(table)) {
      await this.seatLateRegistrant(tournamentId, userId);
      return;
    }

    await this.seatOnSecondaryTournamentTable(tournamentId, userId, table);
  }

  private async seatOnSecondaryTournamentTable(
    tournamentId: string,
    userId: string,
    table: { id: string; tableNumber: number },
  ): Promise<void> {
    const room = await this.ensureSecondaryTournamentTableRoomLive(tournamentId, table);
    if (!room.ok) return;
    await this.seatTournamentTableRegistrant(tournamentId, room.roomId, userId);
  }

  private async loadTournamentWithRegistrations(
    tournamentId: string,
  ): Promise<TournamentWithRegistrations | null> {
    const prisma = getPrisma();
    return prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          include: { user: { select: { displayName: true } } },
        },
      },
    });
  }

  private async cancelLowEntries(
    tournamentId: string,
    tournament: TournamentWithRegistrations,
  ): Promise<void> {
    const prisma = getPrisma();
    const registeredCount = tournament.registrations.length;
    if (registeredCount === 0) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "CANCELLED", prizePoolCents: 0 },
      });
    } else {
      await CashierService.processTournamentCancel({
        tournamentId,
        adminUserId: tournament.registrations[0]!.userId,
        externalRef: tournamentCancelExternalRef(tournamentId),
      });
    }
    logger.info({ tournamentId, registeredCount }, "TOURNAMENT_AUTO_CANCELLED_LOW_ENTRIES");
  }

  /**
   * Colyseus room gone after restart — recreate table for late reg / starting. Primary table
   * (table #1) resume is untouched: it still goes through tryStartTournamentTable, exactly as
   * before this proposal, so an N=1 tournament resumes identically. Secondary tables (2+) are
   * independent physical rooms once provisioned, so they can go stale on their own even while the
   * primary table is fine -- resumed separately below, consistent with how
   * reconcileOrphanRunningTournaments already treats each table's liveness independently.
   */
  async resumeDeadTournamentRooms(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const liveRoomIds = await loadLivePokerRoomIds();
    const candidates = await prisma.tournament.findMany({
      where: {
        status: { in: ["STARTING", "LATE_REG", "RUNNING"] },
        roomId: { not: null },
        startTime: { lte: now },
      },
      take: 10,
    });

    for (const row of candidates) {
      await this.resumeDeadPrimaryTournamentRoom(row, liveRoomIds);
    }

    await this.resumeDeadSecondaryTournamentTableRooms(now, liveRoomIds);
  }

  private async resumeDeadPrimaryTournamentRoom(
    row: { id: string; roomId: string | null },
    liveRoomIds: Set<string>,
  ): Promise<void> {
    if (isTournamentRoomLive(row.roomId, liveRoomIds)) return;
    const prisma = getPrisma();
    await prisma.tournament.update({ where: { id: row.id }, data: { roomId: null } });
    try {
      await this.tryStartTournamentTable(row.id);
      logger.info({ tournamentId: row.id }, "TOURNAMENT_DEAD_ROOM_RESUMED");
    } catch (err: unknown) {
      logger.error(
        { err, tournamentId: row.id, message: err instanceof Error ? err.message : String(err) },
        "TOURNAMENT_DEAD_ROOM_RESUME_FAILED",
      );
    }
  }

  /** Recreate + reseed any non-primary table whose previously-provisioned room has gone stale. */
  private async resumeDeadSecondaryTournamentTableRooms(now: Date, liveRoomIds: Set<string>): Promise<void> {
    const prisma = getPrisma();
    const deadTables = await prisma.tournamentTable.findMany({
      where: {
        tableNumber: { gt: 1 },
        status: "OPEN",
        roomId: { not: null },
        tournament: { status: { in: ["STARTING", "LATE_REG", "RUNNING"] }, startTime: { lte: now } },
      },
      include: { tournament: { select: { id: true } } },
      take: 20,
    });

    for (const table of deadTables) {
      await this.resumeDeadSecondaryTournamentTableRoom(table, liveRoomIds);
    }
  }

  private async resumeDeadSecondaryTournamentTableRoom(
    table: { id: string; tableNumber: number; roomId: string | null; tournament: { id: string } },
    liveRoomIds: Set<string>,
  ): Promise<void> {
    if (isTournamentRoomLive(table.roomId, liveRoomIds)) return;
    try {
      await this.resumeSecondaryTournamentTableRoom(table.tournament.id, table);
      logger.info(
        { tournamentId: table.tournament.id, tournamentTableId: table.id, tableNumber: table.tableNumber },
        "TOURNAMENT_TABLE_DEAD_ROOM_RESUMED",
      );
    } catch (err: unknown) {
      logger.error(
        {
          err,
          tournamentId: table.tournament.id,
          tournamentTableId: table.id,
          message: err instanceof Error ? err.message : String(err),
        },
        "TOURNAMENT_TABLE_DEAD_ROOM_RESUME_FAILED",
      );
    }
  }

  /**
   * Recreate a non-primary table's room after it's gone stale (or on first genuine resume) and
   * reseed every registrant currently assigned to it who hasn't finished -- mirroring how the
   * primary table's dead-room resume (via tryStartTournamentTable -> startTournamentWithTable)
   * reseeds its whole roster, not just the next joiner.
   *
   * Goes through the same provisioning claim as `provisionSecondaryTournamentTableRoom` (CAS on
   * TournamentTable.status, guarded by the roomId last observed): this cron-driven resume can
   * otherwise race a live `/ensure-table` reconnect that observes the same dead room at the same
   * instant, and both would independently call matchMaker.createRoom for the same table.
   */
  private async resumeSecondaryTournamentTableRoom(
    tournamentId: string,
    table: { id: string; tableNumber: number },
  ): Promise<void> {
    const current = await getPrisma().tournamentTable.findUnique({
      where: { id: table.id },
      select: { roomId: true },
    });
    if (!current) return;

    const claimed = await this.claimSecondaryTournamentTableProvisioning(table.id, current.roomId);
    if (!claimed) return; // a concurrent live /ensure-table reconnect (or another resume pass) already owns this table

    try {
      await this.resumeClaimedSecondaryTournamentTableRoom(tournamentId, table);
    } catch (err) {
      await this.releaseSecondaryTournamentTableProvisioningClaim(table.id);
      throw err;
    }
  }

  private async resumeClaimedSecondaryTournamentTableRoom(
    tournamentId: string,
    table: { id: string; tableNumber: number },
  ): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, startingStackCents: true, blindStructureId: true, currentLevel: true, status: true },
    });
    if (!tournament || !SEATABLE_TOURNAMENT_STATUSES.has(tournament.status)) {
      await this.releaseSecondaryTournamentTableProvisioningClaim(table.id);
      return;
    }

    const registrants = await prisma.tournamentRegistration.findMany({
      where: { tournamentId, tournamentTableId: table.id, finishPlace: null },
      include: { user: { select: { displayName: true } } },
    });

    const created = await this.createTournamentTableRoom({
      tournamentId,
      name: `${tournament.name} (Table ${table.tableNumber})`,
      maxPlayers: MAX_SEATS_PER_TABLE,
      startingStackCents: tournament.startingStackCents,
      blindStructureId: tournament.blindStructureId,
      level: tournament.currentLevel,
    });

    await this.finalizeSecondaryTournamentTableProvisioning(table.id, created);

    const { humanSeated, botSeated } = await this.seedRegistrantsIntoRoom(
      created.roomId,
      tournamentId,
      tournament.startingStackCents,
      registrants,
    );

    logger.info(
      {
        tournamentId,
        tournamentTableId: table.id,
        tableNumber: table.tableNumber,
        roomId: created.roomId,
        seated: humanSeated + botSeated,
      },
      "TOURNAMENT_TABLE_ROOM_RESUMED",
    );
  }

  async resumeStuckStartingTournaments(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const stuck = await prisma.tournament.findMany({
      where: {
        status: { in: ["STARTING", "LATE_REG"] },
        startTime: { lte: now },
        roomId: null,
      },
      take: 10,
    });

    for (const row of stuck) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: row.id },
        include: {
          registrations: {
            include: { user: { select: { displayName: true } } },
          },
        },
      });
      if (!tournament) continue;
      try {
        const start = await this.tryStartTournamentTable(tournament.id);
        if (start.ok) {
          logger.info({ tournamentId: tournament.id, roomId: start.roomId }, "TOURNAMENT_STARTING_RESUMED");
        } else if (start.reason === "insufficient_registrations") {
          logger.info(
            {
              tournamentId: tournament.id,
              registrationCount: start.registrationCount,
              required: MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
            },
            "TOURNAMENT_TABLE_AWAITING_PLAYERS",
          );
        }
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_STARTING_RESUME_FAILED",
        );
      }
    }
  }

  async processTournament(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const claimed = await prisma.tournament.updateMany({
      where: { id: tournamentId, status: "REGISTERING", startTime: { lte: now } },
      data: { status: "STARTING" },
    });
    if (claimed.count !== 1) return;

    let tournament = await this.loadTournamentWithRegistrations(tournamentId);
    if (!tournament) return;

    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournamentId);
      tournament = (await this.loadTournamentWithRegistrations(tournamentId)) ?? null;
      if (!tournament) return;
    }

    const humanRegisteredCount = tournament.registrations.filter((reg) => !reg.isBot).length;
    if (humanRegisteredCount < 1 || tournament.registrations.length < 2) {
      await this.cancelLowEntries(tournamentId, tournament);
      return;
    }

    await this.startTournamentWithTable(tournament);
  }

  private async startTournamentWithTable(tournamentInput: TournamentWithRegistrations): Promise<void> {
    const prisma = getPrisma();
    const tournament = await this.refillTournamentBotsIfNeeded(tournamentInput);

    // Multi-table provisioning (MTT proposal Phase 1): assign every current registrant to a
    // TournamentTable BEFORE the room is created/seeded below, so the primary room only ever
    // seats the registrants assigned to table #1. This is what keeps a registrant assigned to a
    // secondary table from also ending up double-seated in the primary room -- without this
    // ordering, the eager primary-room seed below would (today, unconditionally) seat every
    // registrant regardless of which table they're ultimately routed to. Runs after bot-fill
    // (unchanged above) -- it's purely distributing the final seated field, not touching who's in
    // it. For an N=1 tournament (the only case reachable today while maxPlayers stays capped at
    // 9) every registrant is assigned to table #1, so the seed lists below are unfiltered in
    // practice -- byte-for-byte the pre-multi-table behavior.
    const tableAssignment = await this.assignTournamentTables(
      tournament.id,
      tournament.registrations.map((reg) => reg.userId),
    );

    const level = getBlindLevel(tournament.blindStructureId, 1);
    const nextLevelAt = computeNextLevelAt(new Date(), level);
    const { tableId, roomId } = await this.createTournamentTableRoom({
      tournamentId: tournament.id,
      name: tournament.name,
      maxPlayers: Math.min(tournament.maxPlayers, MAX_SEATS_PER_TABLE),
      startingStackCents: tournament.startingStackCents,
      blindStructureId: tournament.blindStructureId,
      level: 1,
    });

    const primaryRegistrants = tournament.registrations.filter((reg) =>
      tableAssignment.primaryUserIds.has(reg.userId),
    );
    const { humanSeated, botSeated } = await this.seedRegistrantsIntoRoom(
      roomId,
      tournament.id,
      tournament.startingStackCents,
      primaryRegistrants,
    );
    const seated = humanSeated + botSeated;

    const outcome = resolvePrimaryTableSeedOutcome(tournament.status, humanSeated, seated);
    if (!outcome.ok) {
      await this.cancelTournamentOnSeedFailure(tournament, roomId, seated);
      return;
    }

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: outcome.nextStatus, tableId, roomId, currentLevel: 1, nextLevelAt },
    });
    await this.finalizePrimaryTournamentTable(tableAssignment.primaryTableId, tableId, roomId);

    logger.info(
      {
        tournamentId: tournament.id,
        tableId,
        roomId,
        seated,
        registeredCount: tournament.registrations.length,
        status: outcome.nextStatus,
      },
      outcome.readyToDeal ? "TOURNAMENT_STARTED" : "TOURNAMENT_TABLE_PROVISIONED",
    );
  }

  private async refillTournamentBotsIfNeeded(
    tournament: TournamentWithRegistrations,
  ): Promise<TournamentWithRegistrations> {
    if (!tournament.fillBotsAtStart) return tournament;
    await fillTournamentBotRegistrations(tournament.id);
    return (await this.loadTournamentWithRegistrations(tournament.id)) ?? tournament;
  }

  private async cancelTournamentOnSeedFailure(
    tournament: TournamentWithRegistrations,
    roomId: string,
    seated: number,
  ): Promise<void> {
    logger.error({ tournamentId: tournament.id, roomId, seated }, "TOURNAMENT_SEED_FAILED");
    await CashierService.processTournamentCancel({
      tournamentId: tournament.id,
      adminUserId: tournament.registrations[0]?.userId ?? tournament.id,
      externalRef: `${tournamentCancelExternalRef(tournament.id)}_seed_fail`,
    });
  }

  /** Build a fresh Colyseus room for one tournament table (primary or secondary). Throws on failure. */
  private async createTournamentTableRoom(params: {
    tournamentId: string;
    name: string;
    maxPlayers: number;
    startingStackCents: number;
    blindStructureId: string;
    level: number;
  }): Promise<{ tableId: string; roomId: string }> {
    const tableConfig = buildTournamentTableConfig(params);
    const created = await matchMaker.createRoom("poker", { tableConfig });
    const roomId = resolveRoomId(created);
    if (!roomId) {
      throw new Error("TOURNAMENT_ROOM_CREATE_FAILED");
    }
    return { tableId: tableConfig.tableId, roomId };
  }

  /** Seed a batch of human + bot registrants into an already-created room. */
  private async seedRegistrantsIntoRoom(
    roomId: string,
    tournamentId: string,
    startingStackCents: number,
    registrants: { userId: string; isBot: boolean; user: { displayName: string } }[],
  ): Promise<{ humanSeated: number; botSeated: number }> {
    const humanSeats = buildHumanSeatRequests(registrants);
    const botSeats = buildBotSeatRequests(registrants);

    const humanSeed = (await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentPlayers" as never,
      [humanSeats, startingStackCents, tournamentId],
      30_000,
    )) as { ok?: boolean; seated?: number } | undefined;

    const botSeated = await this.seedBotsIfAny(roomId, tournamentId, startingStackCents, botSeats);
    return { humanSeated: humanSeed?.seated ?? 0, botSeated };
  }

  private async seedBotsIfAny(
    roomId: string,
    tournamentId: string,
    startingStackCents: number,
    botSeats: ReturnType<typeof buildBotSeatRequests>,
  ): Promise<number> {
    if (botSeats.length === 0) return 0;
    const botSeed = (await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentBots" as never,
      [botSeats, startingStackCents, tournamentId],
      30_000,
    )) as { ok?: boolean; seated?: number } | undefined;
    return botSeed?.seated ?? 0;
  }

  /**
   * Multi-table provisioning at STARTING (Phase 1 of the MTT proposal). Creates one
   * TournamentTable row per MAX_SEATS_PER_TABLE-sized chunk of the registrant field and
   * distributes registrants round-robin across them via TournamentRegistration.tournamentTableId
   * -- BEFORE the primary room is created/seeded, so callers can filter their seed list down to
   * just the registrants assigned to table #1 (critical: without this ordering, a registrant
   * assigned to a secondary table would also get eagerly seated into the primary room, i.e.
   * double-seated across two live rooms simultaneously).
   *
   * For an N=1 tournament (the only case reachable today while maxPlayers stays capped at 9),
   * every registrant is assigned to table #1, so `primaryUserIds` covers the whole field --
   * identical to the pre-multi-table behavior. Idempotent: if tables already exist for this
   * tournament (e.g. a dead-room resume re-running startTournamentWithTable), no redistribution
   * happens (that's balancing, Phase 2, not implemented here) -- persisted assignments are read
   * back instead, with any not-yet-assigned registrant defaulting to table #1.
   */
  private async assignTournamentTables(
    tournamentId: string,
    registrantUserIds: string[],
  ): Promise<{ primaryTableId: string; primaryUserIds: Set<string> }> {
    const prisma = getPrisma();
    const existingTables = await prisma.tournamentTable.findMany({
      where: { tournamentId },
      orderBy: { tableNumber: "asc" },
    });

    if (existingTables.length > 0) {
      return this.reuseExistingTournamentTableAssignment(tournamentId, registrantUserIds, existingTables);
    }
    return this.provisionNewTournamentTables(tournamentId, registrantUserIds);
  }

  private async reuseExistingTournamentTableAssignment(
    tournamentId: string,
    registrantUserIds: string[],
    existingTables: { id: string; tableNumber: number }[],
  ): Promise<{ primaryTableId: string; primaryUserIds: Set<string> }> {
    const prisma = getPrisma();
    const primary = existingTables.find((t) => t.tableNumber === 1) ?? existingTables[0]!;
    const regs = await prisma.tournamentRegistration.findMany({
      where: { tournamentId, userId: { in: registrantUserIds } },
      select: { userId: true, tournamentTableId: true },
    });
    const primaryUserIds = new Set(
      regs.filter((r) => (r.tournamentTableId ?? primary.id) === primary.id).map((r) => r.userId),
    );
    return { primaryTableId: primary.id, primaryUserIds };
  }

  private async provisionNewTournamentTables(
    tournamentId: string,
    registrantUserIds: string[],
  ): Promise<{ primaryTableId: string; primaryUserIds: Set<string> }> {
    const tableCount = Math.max(1, Math.ceil(registrantUserIds.length / MAX_SEATS_PER_TABLE));
    const tables = await this.createTournamentTableRows(tournamentId, tableCount);
    const primaryUserIds = await this.distributeRegistrantsAcrossTables(tournamentId, registrantUserIds, tables);

    logger.info(
      { tournamentId, tableCount, registrantCount: registrantUserIds.length },
      "TOURNAMENT_TABLES_PROVISIONED",
    );

    const primary = tables.find((t) => t.tableNumber === 1)!;
    return { primaryTableId: primary.id, primaryUserIds };
  }

  private async createTournamentTableRows(
    tournamentId: string,
    tableCount: number,
  ): Promise<{ id: string; tableNumber: number }[]> {
    const prisma = getPrisma();
    const tables: { id: string; tableNumber: number }[] = [];
    for (let tableNumber = 1; tableNumber <= tableCount; tableNumber++) {
      const row = await prisma.tournamentTable.create({
        data: { tournamentId, tableNumber, status: "OPEN" },
      });
      tables.push({ id: row.id, tableNumber: row.tableNumber });
    }
    return tables;
  }

  private async distributeRegistrantsAcrossTables(
    tournamentId: string,
    registrantUserIds: string[],
    tables: { id: string; tableNumber: number }[],
  ): Promise<Set<string>> {
    const prisma = getPrisma();
    const primaryUserIds = new Set<string>();
    for (let i = 0; i < registrantUserIds.length; i++) {
      const table = tables[i % tables.length];
      if (table.tableNumber === 1) primaryUserIds.add(registrantUserIds[i]);
      await prisma.tournamentRegistration.update({
        where: { tournamentId_userId: { tournamentId, userId: registrantUserIds[i] } },
        data: { tournamentTableId: table.id },
      });
    }
    return primaryUserIds;
  }

  /** Mirror the just-created/resumed primary room onto its TournamentTable row (table #1). */
  private async finalizePrimaryTournamentTable(
    primaryTableRowId: string,
    primaryTableId: string,
    primaryRoomId: string,
  ): Promise<void> {
    const prisma = getPrisma();
    await prisma.tournamentTable.update({
      where: { id: primaryTableRowId },
      data: { tableId: primaryTableId, roomId: primaryRoomId, status: "OPEN" },
    });
  }

  /**
   * Ensure table exists and joining user is seated; promotes to RUNNING when deal threshold met.
   *
   * Per-user table routing (MTT proposal, "Player routing"): once the tournament's primary table
   * (table #1, mirrored by Tournament.tableId/roomId) is confirmed provisioned and live -- via the
   * exact pre-multi-table mechanism below, untouched -- this looks up which TournamentTable the
   * caller belongs to and routes there. Table #1 is handled entirely through the original
   * Tournament.tableId/roomId code path (so an N=1 tournament, still the only case reachable while
   * `maxPlayers` stays capped at 9, behaves identically to before this proposal); tables 2+ are
   * provisioned/resumed lazily on first join via `ensureSecondaryTournamentTableJoin`.
   */
  async ensureTournamentTableForJoinDetailed(
    tournamentId: string,
    userId: string,
  ): Promise<TournamentEnsureTableResult> {
    const context = await this.loadEnsureTableContext(tournamentId, userId);
    const earlyResult = this.resolveEnsureTableEarlyResult(tournamentId, userId, context);
    if (earlyResult) return earlyResult;

    const { tournament, registration, playerStatus, tableLive, logBase } = context!;

    // ACTIVE player from here on. First, ensure the tournament's primary table (table #1) is
    // provisioned and live -- byte-for-byte the pre-multi-table bootstrap mechanism, keyed off
    // Tournament.tableId/roomId, so an N=1 tournament never deviates from today's path.
    const bootstrap = await this.ensurePrimaryTournamentTableBootstrapped(
      tournamentId,
      tournament,
      tableLive,
      playerStatus,
      logBase,
    );
    if (!bootstrap.ok) return bootstrap.result;

    // Resolve which table (primary or secondary) this user belongs on -- routes to the secondary
    // path when applicable, or returns null to fall through to the primary path below. A
    // tournament with only one table (today's only reachable case) always falls through.
    const secondaryResult = await this.tryRouteToSecondaryTable(
      tournamentId,
      userId,
      playerStatus,
      registration!.tournamentTableId,
      tournament.status,
    );
    if (secondaryResult) return secondaryResult;

    // PRIMARY TABLE PATH (table #1) -- keyed off Tournament.tableId/roomId, identical to
    // pre-multi-table behavior.
    return this.finishPrimaryTournamentTableJoin(tournamentId, userId, playerStatus, tournament, bootstrap, logBase);
  }

  /**
   * Resolves any early-exit result for ensureTournamentTableForJoinDetailed: tournament not found,
   * terminal, or a registered-but-not-ACTIVE player. Null means "keep going" (an ACTIVE player on
   * a real tournament) -- also responsible for the one-time "ensure_table requested" log line,
   * since every non-null-context path needs it.
   */
  private resolveEnsureTableEarlyResult(
    tournamentId: string,
    userId: string,
    context: Awaited<ReturnType<TournamentDirector["loadEnsureTableContext"]>>,
  ): TournamentEnsureTableResult | null {
    if (!context) return this.buildEnsureTableNotFoundResult(tournamentId, userId);

    const { tournament, playerStatus, terminal, lateRegOpen, tableLive, logBase } = context;
    logger.info({ ...logBase, reason: "ensure_table" }, "TOURNAMENT_ENSURE_TABLE_REQUESTED");

    if (terminal) return this.buildEnsureTableTerminalResult(tournamentId, tournament, playerStatus);
    if (playerStatus !== "ACTIVE") {
      return this.buildNotActiveEnsureTableResult(tournamentId, tournament, playerStatus, lateRegOpen, tableLive, logBase);
    }
    return null;
  }

  private buildEnsureTableNotFoundResult(tournamentId: string, userId: string): TournamentEnsureTableResult {
    logger.warn({ tournamentId, userId }, "TOURNAMENT_ENSURE_TABLE_NOT_FOUND");
    return {
      tournamentId,
      tournamentStatus: "NOT_FOUND",
      playerStatus: "NOT_REGISTERED",
      tableId: null,
      roomId: null,
      tableLive: false,
      joinStatus: "FAILED",
      recoveryReason: "TOURNAMENT_NOT_FOUND",
    };
  }

  private buildEnsureTableTerminalResult(
    tournamentId: string,
    tournament: { status: string; tableId: string | null; roomId: string | null },
    playerStatus: TournamentPlayerStatus,
  ): TournamentEnsureTableResult {
    return {
      tournamentId,
      tournamentStatus: tournament.status,
      playerStatus,
      tableId: tournament.tableId,
      roomId: tournament.roomId,
      tableLive: false,
      joinStatus: "ENDED",
      recoveryReason: tournament.status,
    };
  }

  /** Routes an ACTIVE player to their secondary table's join result, or null to fall through to primary. */
  private async tryRouteToSecondaryTable(
    tournamentId: string,
    userId: string,
    playerStatus: TournamentPlayerStatus,
    tournamentTableId: string | null,
    tournamentStatusFallback: string,
  ): Promise<TournamentEnsureTableResult | null> {
    const resolvedTable = await this.resolveActiveTournamentTableForUser(tournamentId, userId, tournamentTableId);
    if (!isSecondaryTable(resolvedTable)) return null;
    return this.ensureSecondaryTournamentTableJoin(tournamentId, userId, playerStatus, resolvedTable, tournamentStatusFallback);
  }

  private async finishPrimaryTournamentTableJoin(
    tournamentId: string,
    userId: string,
    playerStatus: TournamentPlayerStatus,
    tournament: { status: string; tableId: string | null; roomId: string | null },
    bootstrap: { bootstrapped: boolean; hadStaleRoom: boolean },
    logBase: Record<string, unknown>,
  ): Promise<TournamentEnsureTableResult> {
    await this.seatLateRegistrant(tournamentId, userId);
    await this.promoteTournamentToRunningOnJoin(tournamentId);

    if (!bootstrap.bootstrapped) {
      return this.buildPrimaryTableReadyResult(tournamentId, playerStatus, tournament);
    }
    return this.buildPrimaryTableProvisionedResult(tournamentId, playerStatus, bootstrap.hadStaleRoom, logBase);
  }

  private async resolveEnsureTablePlayerStatus(
    tournamentId: string,
    userId: string,
    tournament: { status: string; playFormat: string; startTime: Date; rebuyPeriodMinutes: number; maxRebuysPerPlayer: number },
    registration:
      | { finishPlace: number | null; eliminatedAt: Date | null; rebuyPendingAt: Date | null }
      | undefined,
  ): Promise<TournamentPlayerStatus> {
    if (!registration) return "NOT_REGISTERED";
    const rebuyCount =
      registration.rebuyPendingAt != null ? await countTournamentRebuysForUser(tournamentId, userId) : 0;
    return resolveRegisteredTournamentPlayerStatus(tournament, registration, rebuyCount);
  }

  /** Load + precompute everything ensureTournamentTableForJoinDetailed's branches need. */
  private async loadEnsureTableContext(tournamentId: string, userId: string) {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { userId },
          select: {
            userId: true,
            finishPlace: true,
            eliminatedAt: true,
            rebuyPendingAt: true,
            tournamentTableId: true,
          },
        },
      },
    });
    if (!tournament) return null;

    const registration = tournament.registrations[0];
    const playerStatus = await this.resolveEnsureTablePlayerStatus(tournamentId, userId, tournament, registration);
    const terminal = TERMINAL_TOURNAMENT_STATUSES.has(tournament.status);
    const lateRegOpen = isLateRegistrationOpen(tournament);
    const liveRoomIds = await loadLivePokerRoomIds();
    const tableLive = isTournamentRoomLive(tournament.roomId, liveRoomIds);
    const logBase = {
      tournamentId,
      tableId: tournament.tableId,
      roomId: tournament.roomId,
      tournamentStatus: tournament.status,
      playerStatus,
      tableLive,
      handId: null,
      street: null,
      snapshotSeq: null,
      nextHandAtTs: null,
      readyCount: null,
      activeCount: null,
      lateRegOpen,
    };

    return { tournament, registration, playerStatus, terminal, lateRegOpen, tableLive, logBase };
  }

  /** Build the NOT_ALLOWED / spectate-READY result for a registered-but-not-ACTIVE player. */
  private buildNotActiveEnsureTableResult(
    tournamentId: string,
    tournament: { status: string; tableId: string | null; roomId: string | null },
    playerStatus: TournamentPlayerStatus,
    lateRegOpen: boolean,
    tableLive: boolean,
    logBase: Record<string, unknown>,
  ): TournamentEnsureTableResult {
    const spectateResult = this.buildSpectateResultIfEligible(tournamentId, tournament, playerStatus, tableLive);
    if (spectateResult) return spectateResult;

    this.logNotRegisteredEnsureTable(playerStatus, lateRegOpen, logBase);

    return {
      tournamentId,
      tournamentStatus: tournament.status,
      playerStatus,
      tableId: tournament.tableId,
      roomId: tournament.roomId,
      tableLive,
      joinStatus: "NOT_ALLOWED",
      recoveryReason: playerStatus === "ELIMINATED" ? "TOURNAMENT_PLAYER_ELIMINATED" : "TOURNAMENT_NOT_REGISTERED",
    };
  }

  /** ELIMINATED/REBUY_PENDING players may spectate the (still-live) table; null when they can't. */
  private buildSpectateResultIfEligible(
    tournamentId: string,
    tournament: { status: string; tableId: string | null; roomId: string | null },
    playerStatus: TournamentPlayerStatus,
    tableLive: boolean,
  ): TournamentEnsureTableResult | null {
    if (!SPECTATE_ELIGIBLE_PLAYER_STATUSES.has(playerStatus)) return null;
    const canSpectate = isTournamentSpectateEligible({
      tournamentStatus: tournament.status,
      tableId: tournament.tableId,
      roomId: tournament.roomId,
    });
    if (!canSpectate) return null;
    return {
      tournamentId,
      tournamentStatus: tournament.status,
      playerStatus,
      tableId: tournament.tableId,
      roomId: tournament.roomId,
      tableLive,
      joinStatus: "READY",
      recoveryReason: playerStatus === "REBUY_PENDING" ? "TOURNAMENT_REBUY_PENDING" : "TOURNAMENT_PLAYER_ELIMINATED",
    };
  }

  private logNotRegisteredEnsureTable(
    playerStatus: TournamentPlayerStatus,
    lateRegOpen: boolean,
    logBase: Record<string, unknown>,
  ): void {
    if (playerStatus !== "NOT_REGISTERED") return;
    this.logNotRegisteredRequested(lateRegOpen, logBase);
    if (!lateRegOpen) {
      logger.warn({ ...logBase, reason: "late_reg_closed" }, "TOURNAMENT_ENSURE_TABLE_LATE_REG_CLOSED");
    }
  }

  private logNotRegisteredRequested(lateRegOpen: boolean, logBase: Record<string, unknown>): void {
    const fields = lateRegOpen ? NOT_REGISTERED_LOG_FIELDS.open : NOT_REGISTERED_LOG_FIELDS.closed;
    logger.warn({ ...logBase, ...fields }, "TOURNAMENT_ENSURE_TABLE_NOT_REGISTERED");
  }

  /**
   * Ensure the primary table (table #1) is provisioned and live, exactly as
   * ensureTournamentTableForJoinDetailed always has -- stale Tournament.tableId/roomId cleared,
   * tryStartTournamentTable invoked if needed. Returns `bootstrapped: true` when a
   * create-or-restore just happened (caller uses this to pick READY vs RESTORED/CREATING_TABLE),
   * or a ready-made failure result when the table couldn't be started at all.
   */
  private async ensurePrimaryTournamentTableBootstrapped(
    tournamentId: string,
    tournament: { roomId: string | null; tableId: string | null; status: string },
    tableLive: boolean,
    playerStatus: TournamentPlayerStatus,
    logBase: Record<string, unknown>,
  ): Promise<
    { ok: true; bootstrapped: boolean; hadStaleRoom: boolean } | { ok: false; result: TournamentEnsureTableResult }
  > {
    if (isPrimaryTournamentTableLive(tournament, tableLive)) {
      return { ok: true, bootstrapped: false, hadStaleRoom: false };
    }

    const hadStaleRoom = await this.clearStalePrimaryTournamentRoom(tournamentId, tournament, logBase);
    const start = await this.tryStartTournamentTable(tournamentId);
    if (!start.ok) {
      return {
        ok: false,
        result: await this.buildPrimaryBootstrapFailureResult(tournamentId, tournament, playerStatus, logBase, start),
      };
    }

    return { ok: true, bootstrapped: true, hadStaleRoom };
  }

  /** Clears a stale Tournament.tableId/roomId pair before re-provisioning; returns whether one was cleared. */
  private async clearStalePrimaryTournamentRoom(
    tournamentId: string,
    tournament: { roomId: string | null; tableId: string | null },
    logBase: Record<string, unknown>,
  ): Promise<boolean> {
    const hadStaleRoom = Boolean(tournament.roomId || tournament.tableId);
    if (!hadStaleRoom) {
      logger.warn({ ...logBase, reason: "no_room_or_table_id" }, "TOURNAMENT_ENSURE_TABLE_ROOM_MISSING");
      return false;
    }
    logger.warn({ ...logBase, reason: "stale_room_id" }, "TOURNAMENT_ENSURE_STALE_ROOM_ID");
    await getPrisma().tournament.update({
      where: { id: tournamentId },
      data: { roomId: null, tableId: null },
    });
    return true;
  }

  private async buildPrimaryBootstrapFailureResult(
    tournamentId: string,
    tournament: { status: string; tableId: string | null; roomId: string | null },
    playerStatus: TournamentPlayerStatus,
    logBase: Record<string, unknown>,
    start: Extract<TryStartTournamentTableResult, { ok: false }>,
  ): Promise<TournamentEnsureTableResult> {
    const prisma = getPrisma();
    const refreshed = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, tableId: true, roomId: true },
    });
    const source = refreshed ?? tournament;

    this.logPrimaryBootstrapFailure(logBase, source.tableId, source.roomId, source.status, start);

    return {
      tournamentId,
      tournamentStatus: source.status,
      playerStatus,
      tableId: refreshed ? refreshed.tableId : null,
      roomId: refreshed ? refreshed.roomId : null,
      tableLive: false,
      joinStatus: bootstrapFailureJoinStatus(start.reason),
      recoveryReason: bootstrapFailureRecoveryReason(start.reason),
    };
  }

  /** Emits the two diagnostic log lines for a failed primary-table bootstrap (unchanged messages/shape). */
  private logPrimaryBootstrapFailure(
    logBase: Record<string, unknown>,
    tableId: string | null,
    roomId: string | null,
    tournamentStatus: string,
    start: Extract<TryStartTournamentTableResult, { ok: false }>,
  ): void {
    logger.warn(
      { ...logBase, tableId, roomId, tournamentStatus, reason: start.reason, registrationCount: start.registrationCount },
      "TOURNAMENT_ENSURE_TABLE_FAILED",
    );
    if (start.reason !== "start_failed") return;
    logger.warn(
      { ...logBase, tableId, roomId, tournamentStatus, reason: "start_failed_room_missing" },
      "TOURNAMENT_ENSURE_TABLE_ROOM_MISSING",
    );
  }

  /** Primary-table result when the room was already live at entry (fast path, no bootstrap). */
  private async buildPrimaryTableReadyResult(
    tournamentId: string,
    playerStatus: TournamentPlayerStatus,
    tournament: { status: string; tableId: string | null; roomId: string | null },
  ): Promise<TournamentEnsureTableResult> {
    const prisma = getPrisma();
    const refreshed = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, tableId: true, roomId: true },
    });
    const source = refreshed ?? tournament;
    return {
      tournamentId,
      tournamentStatus: source.status,
      playerStatus,
      tableId: source.tableId,
      roomId: source.roomId,
      tableLive: true,
      joinStatus: "READY",
    };
  }

  /** Primary-table result after a create-or-restore bootstrap just ran. */
  private async buildPrimaryTableProvisionedResult(
    tournamentId: string,
    playerStatus: TournamentPlayerStatus,
    hadStaleRoom: boolean,
    logBase: Record<string, unknown>,
  ): Promise<TournamentEnsureTableResult> {
    const prisma = getPrisma();
    const row = await prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { tableId: true, roomId: true, status: true },
    });
    const refreshedLiveRoomIds = await loadLivePokerRoomIds();
    const refreshedLive = isTournamentRoomLive(row.roomId, refreshedLiveRoomIds);
    const joinStatus: TournamentEnsureTableJoinStatus = hadStaleRoom ? "RESTORED" : "CREATING_TABLE";
    this.logPrimaryTableProvisioned(logBase, row, refreshedLive, hadStaleRoom);
    return {
      tournamentId,
      tournamentStatus: row.status,
      playerStatus,
      tableId: row.tableId,
      roomId: row.roomId,
      tableLive: refreshedLive,
      joinStatus,
      recoveryReason: hadStaleRoom ? "STALE_ROOM_REPLACED" : undefined,
    };
  }

  private logPrimaryTableProvisioned(
    logBase: Record<string, unknown>,
    row: { tableId: string | null; roomId: string | null; status: string },
    tableLive: boolean,
    hadStaleRoom: boolean,
  ): void {
    const common = { ...logBase, tableId: row.tableId, roomId: row.roomId, tournamentStatus: row.status, tableLive };
    logger.info(
      { ...common, reason: hadStaleRoom ? "room_restored" : "table_created" },
      hadStaleRoom ? "TOURNAMENT_ENSURE_ROOM_RESTORED" : "TOURNAMENT_ENSURE_TABLE_CREATED",
    );
    if (!hadStaleRoom) return;
    logger.info({ ...common, recoveryReason: "STALE_ROOM_REPLACED" }, "TOURNAMENT_ENSURE_TABLE_ROOM_RECOVERED");
  }

  /**
   * Resolve which TournamentTable a registered, ACTIVE user belongs to (MTT "Player routing"):
   * their persisted `tournamentTableId` if it's still OPEN, else the OPEN table with the fewest
   * seated registrants (persisted for stability across repeated calls). Returns null when no
   * TournamentTable rows exist for the tournament yet (legacy tournaments pre-migration, or a
   * caller invoked before the tournament has ever been provisioned) -- callers treat that the
   * same as "table #1" since Tournament.tableId/roomId is the fallback source of truth.
   */
  private async resolveActiveTournamentTableForUser(
    tournamentId: string,
    userId: string,
    currentTournamentTableId: string | null,
  ): Promise<{ id: string; tableNumber: number } | null> {
    const assigned = await this.loadOpenTournamentTableById(currentTournamentTableId);
    if (assigned) return assigned;

    const openTables = await this.loadOpenTournamentTables(tournamentId);
    if (openTables.length === 0) return null;

    const chosen = await this.pickSeatableTournamentTable(tournamentId, openTables);
    return this.claimTournamentTableAssignment(tournamentId, userId, currentTournamentTableId, chosen);
  }

  private async loadOpenTournamentTableById(
    tournamentTableId: string | null,
  ): Promise<{ id: string; tableNumber: number } | null> {
    if (!tournamentTableId) return null;
    const current = await getPrisma().tournamentTable.findUnique({
      where: { id: tournamentTableId },
      select: { id: true, tableNumber: true, status: true },
    });
    if (!current || current.status !== "OPEN") return null;
    return { id: current.id, tableNumber: current.tableNumber };
  }

  private async loadOpenTournamentTables(tournamentId: string): Promise<{ id: string; tableNumber: number }[]> {
    return getPrisma().tournamentTable.findMany({
      where: { tournamentId, status: "OPEN" },
      orderBy: { tableNumber: "asc" },
      select: { id: true, tableNumber: true },
    });
  }

  /**
   * Standard live-poker floor rule: seat a joiner at whichever OPEN table has the fewest players
   * -- unless every existing OPEN table is already at MAX_SEATS_PER_TABLE, in which case a
   * late-registering field has outgrown what was provisioned at STARTING (provisioning only ever
   * sizes tables for the registrant count *at that moment*; late registration is explicitly
   * allowed to keep growing the field afterward). In that case, provision a new table rather than
   * routing this joiner onto a table with no open seat.
   *
   * Previously a silent bug: entry-fee registration succeeded (money collected) but the
   * subsequent seat-seed call then failed with "Table is full" server-side, and the player was
   * never actually seated anywhere -- found during a live QA pass, see
   * docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md.
   */
  private async pickSeatableTournamentTable(
    tournamentId: string,
    openTables: { id: string; tableNumber: number }[],
  ): Promise<{ id: string; tableNumber: number }> {
    const fewest = await this.pickOpenTableWithFewestRegistrants(tournamentId, openTables);
    if (fewest.count < MAX_SEATS_PER_TABLE) return fewest.table;
    return this.provisionOverflowTournamentTable(tournamentId);
  }

  private async pickOpenTableWithFewestRegistrants(
    tournamentId: string,
    openTables: { id: string; tableNumber: number }[],
  ): Promise<{ table: { id: string; tableNumber: number }; count: number }> {
    const countByTableId = await this.countRegistrationsByTable(
      tournamentId,
      openTables.map((t) => t.id),
    );
    const table = openTables.reduce((fewest, table) =>
      (countByTableId.get(table.id) ?? 0) < (countByTableId.get(fewest.id) ?? 0) ? table : fewest,
    );
    return { table, count: countByTableId.get(table.id) ?? 0 };
  }

  /**
   * Every existing OPEN table is full -- create a new one. Race-safe via the
   * `@@unique([tournamentId, tableNumber])` constraint: if two late registrants concurrently
   * observe "all tables full" and both try to create the next tableNumber, only one insert
   * succeeds; the loser re-resolves among the now-current OPEN set (which includes the winner's
   * new table) instead of retrying its own insert.
   */
  private async provisionOverflowTournamentTable(
    tournamentId: string,
  ): Promise<{ id: string; tableNumber: number }> {
    const prisma = getPrisma();
    const highest = await prisma.tournamentTable.findFirst({
      where: { tournamentId },
      orderBy: { tableNumber: "desc" },
      select: { tableNumber: true },
    });
    const nextTableNumber = (highest?.tableNumber ?? 0) + 1;

    try {
      const created = await prisma.tournamentTable.create({
        data: { tournamentId, tableNumber: nextTableNumber, status: "OPEN" },
      });
      logger.info(
        { tournamentId, tournamentTableId: created.id, tableNumber: created.tableNumber },
        "TOURNAMENT_TABLE_OVERFLOW_PROVISIONED",
      );
      return { id: created.id, tableNumber: created.tableNumber };
    } catch (err: unknown) {
      if (!isUniqueConstraintViolation(err)) throw err;
      const refreshedOpenTables = await this.loadOpenTournamentTables(tournamentId);
      return this.pickSeatableTournamentTable(tournamentId, refreshedOpenTables);
    }
  }

  private async countRegistrationsByTable(tournamentId: string, tableIds: string[]): Promise<Map<string, number>> {
    const counts = await getPrisma().tournamentRegistration.groupBy({
      by: ["tournamentTableId"],
      where: { tournamentId, tournamentTableId: { in: tableIds } },
      _count: { _all: true },
    });
    return new Map(counts.map((c) => [c.tournamentTableId as string, c._count._all]));
  }

  /**
   * Atomically claim `chosen` for this registrant via a CAS updateMany guarded on the
   * `tournamentTableId` value we last observed (`currentTournamentTableId`, typically null for a
   * never-before-assigned registrant). A racing caller computing this concurrently (e.g. /register
   * and /ensure-table both firing for the same brand-new registrant) can read a different "fewest
   * seated" table and reach this point with a different `chosen` -- only one updateMany can
   * actually match the still-unchanged row, so only one caller wins the write. The loser's
   * updateMany affects 0 rows; it must never proceed with its own local `chosen` (that would seat
   * the user at a table nobody else agrees they're on) -- it re-reads the value the winner
   * actually persisted and routes there instead, so both callers converge on the same table.
   */
  private async claimTournamentTableAssignment(
    tournamentId: string,
    userId: string,
    currentTournamentTableId: string | null,
    chosen: { id: string; tableNumber: number },
  ): Promise<{ id: string; tableNumber: number }> {
    if (chosen.id === currentTournamentTableId) return chosen;

    const claim = await getPrisma().tournamentRegistration.updateMany({
      where: { tournamentId, userId, tournamentTableId: currentTournamentTableId },
      data: { tournamentTableId: chosen.id },
    });
    if (claim.count > 0) return chosen;

    return this.reloadClaimedTournamentTableAssignment(tournamentId, userId, chosen);
  }

  /** Lost the assignment CAS race -- re-read whatever the winner actually persisted. */
  private async reloadClaimedTournamentTableAssignment(
    tournamentId: string,
    userId: string,
    fallback: { id: string; tableNumber: number },
  ): Promise<{ id: string; tableNumber: number }> {
    const prisma = getPrisma();
    const reg = await prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      select: { tournamentTableId: true },
    });
    if (!reg?.tournamentTableId) return fallback;

    const winningTable = await prisma.tournamentTable.findUnique({
      where: { id: reg.tournamentTableId },
      select: { id: true, tableNumber: true },
    });
    return winningTable ?? fallback;
  }

  /**
   * Route + seat a user on a non-primary (tableNumber !== 1) TournamentTable: resolve/provision
   * its room via `ensureSecondaryTournamentTableRoomLive` (shared with `seatRegistrantOnAssignedTable`
   * for the /register path), then seat + promote + build the result.
   */
  private async ensureSecondaryTournamentTableJoin(
    tournamentId: string,
    userId: string,
    playerStatus: TournamentPlayerStatus,
    table: { id: string; tableNumber: number },
    tournamentStatusFallback: string,
  ): Promise<TournamentEnsureTableResult> {
    const room = await this.ensureSecondaryTournamentTableRoomLive(tournamentId, table);
    if (!room.ok) {
      return this.buildSecondaryTableFailureResult(tournamentId, playerStatus, tournamentStatusFallback, room);
    }

    await this.seatTournamentTableRegistrant(tournamentId, room.roomId, userId);
    await this.promoteTournamentToRunningOnJoin(tournamentId);
    return this.buildSecondaryTableSuccessResult(tournamentId, playerStatus, tournamentStatusFallback, room);
  }

  private async buildSecondaryTableSuccessResult(
    tournamentId: string,
    playerStatus: TournamentPlayerStatus,
    tournamentStatusFallback: string,
    room: Extract<SecondaryTournamentTableRoomResult, { ok: true }>,
  ): Promise<TournamentEnsureTableResult> {
    const prisma = getPrisma();
    const liveRoomIds = await loadLivePokerRoomIds();
    const status = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });

    return {
      tournamentId,
      tournamentStatus: status ? status.status : tournamentStatusFallback,
      playerStatus,
      tableId: room.tableId,
      roomId: room.roomId,
      tableLive: isTournamentRoomLive(room.roomId, liveRoomIds),
      joinStatus: secondaryTableJoinStatus(room),
      recoveryReason: !room.wasAlreadyLive && room.hadStaleRoom ? "STALE_ROOM_REPLACED" : undefined,
    };
  }

  private buildSecondaryTableFailureResult(
    tournamentId: string,
    playerStatus: TournamentPlayerStatus,
    tournamentStatusFallback: string,
    room: Extract<SecondaryTournamentTableRoomResult, { ok: false }>,
  ): TournamentEnsureTableResult {
    return {
      tournamentId,
      tournamentStatus:
        room.reason === "tournament_not_found" ? "NOT_FOUND" : (room.tournamentStatus ?? tournamentStatusFallback),
      playerStatus,
      tableId: null,
      roomId: null,
      tableLive: false,
      joinStatus: "FAILED",
      recoveryReason: room.reason === "tournament_not_found" ? "TOURNAMENT_NOT_FOUND" : "TOURNAMENT_TABLE_UNAVAILABLE",
    };
  }

  /**
   * Resolve a live room for a non-primary TournamentTable, provisioning/recreating it if it's
   * unset or stale. Shared by the ensure-table join path and the /register late-registrant path
   * (`seatRegistrantOnAssignedTable`) so both route through the same provisioning rule.
   */
  private async ensureSecondaryTournamentTableRoomLive(
    tournamentId: string,
    table: { id: string; tableNumber: number },
  ): Promise<SecondaryTournamentTableRoomResult> {
    const prisma = getPrisma();
    const current = await prisma.tournamentTable.findUnique({ where: { id: table.id } });
    if (!current) return { ok: false, reason: "table_not_found" };

    const liveRoomIds = await loadLivePokerRoomIds();
    const alreadyLive = this.asAlreadyLiveSecondaryTableResult(current, liveRoomIds);
    if (alreadyLive) return alreadyLive;

    if (current.status !== "OPEN") {
      // Someone else already holds the provisioning claim on this table (a racing caller, or the
      // resume cron) -- never start a second, independent provision. Wait for theirs.
      return this.awaitConcurrentSecondaryTableProvision(table.id);
    }

    return this.provisionSecondaryTournamentTableRoom(tournamentId, table, current.roomId);
  }

  private asAlreadyLiveSecondaryTableResult(
    current: { tableId: string | null; roomId: string | null },
    liveRoomIds: Set<string>,
  ): SecondaryTournamentTableRoomResult | null {
    if (!current.tableId || !current.roomId) return null;
    if (!isTournamentRoomLive(current.roomId, liveRoomIds)) return null;
    return { ok: true, tableId: current.tableId, roomId: current.roomId, wasAlreadyLive: true, hadStaleRoom: false };
  }

  /**
   * Provision (or re-provision) a secondary table's room, guarded by an atomic status-based
   * claim (see `claimSecondaryTournamentTableProvisioning`) so two callers who both observe the
   * table's room as dead/unset at the same instant -- e.g. two `/ensure-table` calls for
   * different users assigned to the same never-before-provisioned table right at tournament
   * start, or this same code racing the `resumeSecondaryTournamentTableRoom` cron path -- can
   * never both call `matchMaker.createRoom` and both write a `TournamentTable` row: only the
   * claim winner creates a room; the loser waits for and reuses the winner's result.
   */
  private async provisionSecondaryTournamentTableRoom(
    tournamentId: string,
    table: { id: string; tableNumber: number },
    observedRoomId: string | null,
  ): Promise<SecondaryTournamentTableRoomResult> {
    const claimed = await this.claimSecondaryTournamentTableProvisioning(table.id, observedRoomId);
    if (!claimed) return this.awaitConcurrentSecondaryTableProvision(table.id);

    return this.provisionClaimedSecondaryTournamentTableRoom(tournamentId, table, Boolean(observedRoomId));
  }

  private async provisionClaimedSecondaryTournamentTableRoom(
    tournamentId: string,
    table: { id: string; tableNumber: number },
    hadStaleRoom: boolean,
  ): Promise<SecondaryTournamentTableRoomResult> {
    const tournament = await getPrisma().tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, startingStackCents: true, blindStructureId: true, currentLevel: true, status: true },
    });
    if (!tournament) {
      await this.releaseSecondaryTournamentTableProvisioningClaim(table.id);
      return { ok: false, reason: "tournament_not_found" };
    }

    const created = await this.createClaimedSecondaryTournamentTableRoom(tournamentId, table, tournament);
    if (!created) {
      return { ok: false, reason: "room_create_failed", tournamentStatus: tournament.status };
    }

    await this.finalizeSecondaryTournamentTableProvisioning(table.id, created);
    logger.info(
      { tournamentId, tournamentTableId: table.id, tableNumber: table.tableNumber, roomId: created.roomId, hadStaleRoom },
      hadStaleRoom ? "TOURNAMENT_TABLE_ROOM_RESTORED" : "TOURNAMENT_TABLE_ROOM_CREATED",
    );
    return { ok: true, tableId: created.tableId, roomId: created.roomId, wasAlreadyLive: false, hadStaleRoom };
  }

  private async createClaimedSecondaryTournamentTableRoom(
    tournamentId: string,
    table: { id: string; tableNumber: number },
    tournament: { name: string; startingStackCents: number; blindStructureId: string; currentLevel: number },
  ): Promise<{ tableId: string; roomId: string } | null> {
    try {
      return await this.createTournamentTableRoom({
        tournamentId,
        name: `${tournament.name} (Table ${table.tableNumber})`,
        maxPlayers: MAX_SEATS_PER_TABLE,
        startingStackCents: tournament.startingStackCents,
        blindStructureId: tournament.blindStructureId,
        level: tournament.currentLevel,
      });
    } catch {
      await this.releaseSecondaryTournamentTableProvisioningClaim(table.id);
      logger.error(
        { tournamentId, tournamentTableId: table.id, tableNumber: table.tableNumber },
        "TOURNAMENT_TABLE_ROOM_CREATE_FAILED",
      );
      return null;
    }
  }

  /**
   * Atomically claim the right to (re)provision a non-primary TournamentTable's room, CAS-guarded
   * on the roomId we last observed (the same claim pattern claimStripeEvent uses for StripeEvent:
   * an atomic updateMany with a WHERE-guard, checked by affected-row count). Flips `status` to a
   * transient "PROVISIONING" marker so a concurrent claimant's updateMany (guarded on
   * `status: "OPEN"`) can't also match -- and so `closeTournamentTableIfStale` leaves a claimed
   * table alone instead of racing to close it out from under an in-flight provision.
   */
  private async claimSecondaryTournamentTableProvisioning(
    tableId: string,
    observedRoomId: string | null,
  ): Promise<boolean> {
    const claim = await getPrisma().tournamentTable.updateMany({
      where: { id: tableId, status: "OPEN", roomId: observedRoomId },
      data: { status: TOURNAMENT_TABLE_PROVISIONING_STATUS },
    });
    return claim.count > 0;
  }

  private async releaseSecondaryTournamentTableProvisioningClaim(tableId: string): Promise<void> {
    await getPrisma().tournamentTable.updateMany({
      where: { id: tableId, status: TOURNAMENT_TABLE_PROVISIONING_STATUS },
      data: { status: "OPEN" },
    });
  }

  private async finalizeSecondaryTournamentTableProvisioning(
    tableId: string,
    created: { tableId: string; roomId: string },
  ): Promise<void> {
    await getPrisma().tournamentTable.updateMany({
      where: { id: tableId, status: TOURNAMENT_TABLE_PROVISIONING_STATUS },
      data: { tableId: created.tableId, roomId: created.roomId, status: "OPEN" },
    });
  }

  /**
   * Lost the provisioning claim race (or found one already in flight) -- never create a second
   * room for the same table. Poll briefly for the claim holder to finish and reuse its result,
   * bounded so a crashed claimant can't wedge every future joiner forever (the orphan reconciler
   * / resume cron are the longer-horizon backstop for a truly abandoned claim).
   */
  private async awaitConcurrentSecondaryTableProvision(tableId: string): Promise<SecondaryTournamentTableRoomResult> {
    for (let attempt = 0; attempt < CONCURRENT_PROVISION_WAIT_ATTEMPTS; attempt++) {
      const row = await getPrisma().tournamentTable.findUnique({
        where: { id: tableId },
        select: { tableId: true, roomId: true, status: true },
      });
      if (row === null) return { ok: false, reason: "table_not_found" };
      const finished = asFinishedSecondaryTableProvision(row);
      if (finished) return finished;
      await sleep(CONCURRENT_PROVISION_WAIT_MS);
    }
    return { ok: false, reason: "room_create_failed" };
  }

  /** Seat a single joining/reconnecting user into an arbitrary (non-primary) tournament table room. */
  private async seatTournamentTableRegistrant(tournamentId: string, roomId: string, userId: string): Promise<void> {
    const tournament = await this.loadSeatableTournament(tournamentId);
    if (!tournament) return;

    const reg = await this.loadSeatableHumanRegistration(tournamentId, userId);
    if (!reg) return;

    await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentPlayers" as never,
      [[{ userId: reg.userId, displayName: reg.user.displayName }], tournament.startingStackCents, tournamentId],
      30_000,
    );
  }

  private async loadSeatableTournament(
    tournamentId: string,
  ): Promise<{ status: string; startingStackCents: number } | null> {
    const tournament = await getPrisma().tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, startingStackCents: true },
    });
    if (!tournament || !SEATABLE_TOURNAMENT_STATUSES.has(tournament.status)) return null;
    return tournament;
  }

  private async loadSeatableHumanRegistration(tournamentId: string, userId: string) {
    const reg = await getPrisma().tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      include: { user: { select: { displayName: true } } },
    });
    if (!reg || reg.isBot) return null;
    return reg;
  }

  async ensureTournamentTableForJoin(
    tournamentId: string,
    userId: string,
  ): Promise<{ tableId: string; roomId: string }> {
    const ensured = await this.ensureTournamentTableForJoinDetailed(tournamentId, userId);
    if (ensured.joinStatus === "NOT_ALLOWED" && ensured.recoveryReason === "TOURNAMENT_AWAITING_PLAYERS") {
      throw new Error("TOURNAMENT_AWAITING_PLAYERS");
    }
    if (!ensured.tableId || !ensured.roomId || !["READY", "RESTORED", "CREATING_TABLE"].includes(ensured.joinStatus)) {
      throw new Error(ensured.recoveryReason ?? "TOURNAMENT_TABLE_UNAVAILABLE");
    }
    return { tableId: ensured.tableId, roomId: ensured.roomId };
  }

  /** First join after table provision — start the event; hands still need 2+ seated. */
  private async promoteTournamentToRunningOnJoin(tournamentId: string): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true },
    });
    if (!tournament || tournament.status === "RUNNING") return;
    if (tournament.status !== "LATE_REG" && tournament.status !== "STARTING") return;

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: "RUNNING" },
    });
    logger.info({ tournamentId }, "TOURNAMENT_PROMOTED_TO_RUNNING");
  }

  async advanceDueBlindLevels(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const due = await prisma.tournament.findMany({
      where: {
        status: "RUNNING",
        nextLevelAt: { lte: now },
        roomId: { not: null },
      },
      take: 20,
    });

    for (const tournament of due) {
      try {
        await this.advanceBlindLevel(tournament.id, now);
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: tournament.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_BLIND_ADVANCE_FAILED",
        );
      }
    }
  }

  async advanceBlindLevel(tournamentId: string, now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.status !== "RUNNING" || !tournament.roomId) return;

    const levels = getBlindLevels(tournament.blindStructureId);
    const maxLevel = levels[levels.length - 1].level;
    const nextLevel = Math.min(tournament.currentLevel + 1, maxLevel);
    const level = getBlindLevel(tournament.blindStructureId, nextLevel);
    const nextLevelAt = computeNextLevelAt(now, level);

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        currentLevel: nextLevel,
        nextLevelAt,
      },
    });

    const applied = (await matchMaker.remoteRoomCall(
      tournament.roomId,
      "applyTournamentBlinds" as never,
      [
        {
          currentLevel: nextLevel,
          smallBlindCents: level.smallBlindCents,
          bigBlindCents: level.bigBlindCents,
          anteCents: level.anteCents,
          nextLevelAtTs: nextLevelAt.getTime(),
          status: tournament.status,
        },
      ],
      10_000,
    )) as { applied?: boolean } | undefined;

    logger.info(
      {
        tournamentId,
        roomId: tournament.roomId,
        currentLevel: nextLevel,
        applied: applied?.applied ?? false,
      },
      "TOURNAMENT_BLIND_LEVEL_ADVANCED",
    );

    await abandonTournamentAtMaxBlind(tournamentId, now);
  }
}

export const tournamentDirector = new TournamentDirector();
