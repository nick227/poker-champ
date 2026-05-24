import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import type { Tournament } from "@prisma/client";
import { CashierService } from "../engine/economy/CashierService.js";
import { logger } from "../lib/logger.js";
import { computeNextLevelAt, getBlindLevel, getBlindLevels } from "./blind-structure.js";
import { tournamentCancelExternalRef } from "./tournament.constants.js";
import { fillTournamentBotRegistrations } from "./tournament-bot-fill.js";
import { parseTournamentBotCatalogId } from "./tournament-bot-users.js";
import { buildTournamentTableConfig } from "./tournament-table-config.js";
import { processTournamentFinishResults } from "./tournament-result-processor.js";
import { isTournamentRoomLive, loadLivePokerRoomIds } from "./tournament-room-live.js";
import { abandonTournamentAtMaxBlind } from "./tournament-abandon.js";
import { isLateRegistrationClosed, isLateRegistrationOpen } from "./tournament-schedule.js";
import {
  MIN_TOURNAMENT_REGISTRATIONS_TO_PROVISION,
  MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL,
  MIN_TOURNAMENT_SEATED_TO_DEAL,
  type TryStartTournamentTableResult,
} from "./tournament-table-start.js";
import {
  isTournamentSpectateEligible,
  resolveTournamentPlayerStatus,
  type TournamentPlayerStatus,
} from "./tournament-player-status.js";

type TournamentWithRegistrations = Tournament & {
  registrations: { userId: string; isBot: boolean; user: { displayName: string } }[];
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

function resolveRoomId(created: unknown): string | undefined {
  if (typeof created === "string") return created;
  if (created && typeof created === "object" && "roomId" in created) {
    const roomId = (created as { roomId?: string }).roomId;
    return typeof roomId === "string" ? roomId : undefined;
  }
  return undefined;
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

  /** Close RUNNING/STARTING tournaments whose Colyseus room no longer exists (e.g. after server restart). */
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
      const roomDead = !isTournamentRoomLive(tournament.roomId, liveRoomIds);
      const staleByTime = tournament.startTime < staleBefore;
      if (!roomDead && !staleByTime) continue;

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
        { tournamentId: tournament.id, roomId: tournament.roomId, roomDead, staleByTime },
        "TOURNAMENT_ORPHAN_CLOSED",
      );
    }
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

    logger.info({ tournamentId }, "TOURNAMENT_LATE_REG_CLOSED");
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

  /** Colyseus room gone after restart — recreate table for late reg / starting. */
  async resumeDeadTournamentRooms(now: Date = new Date()): Promise<void> {
    const prisma = getPrisma();
    const liveRoomIds = await loadLivePokerRoomIds();
    const candidates = await prisma.tournament.findMany({
      where: {
        status: { in: ["STARTING", "LATE_REG"] },
        roomId: { not: null },
        startTime: { lte: now },
      },
      take: 10,
    });

    for (const row of candidates) {
      if (isTournamentRoomLive(row.roomId, liveRoomIds)) continue;
      await prisma.tournament.update({
        where: { id: row.id },
        data: { roomId: null },
      });
      try {
        await this.tryStartTournamentTable(row.id);
        logger.info({ tournamentId: row.id }, "TOURNAMENT_DEAD_ROOM_RESUMED");
      } catch (err: unknown) {
        logger.error(
          {
            err,
            tournamentId: row.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "TOURNAMENT_DEAD_ROOM_RESUME_FAILED",
        );
      }
    }
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
    let tournament = tournamentInput;
    if (tournament.fillBotsAtStart) {
      await fillTournamentBotRegistrations(tournament.id);
      tournament =
        (await prisma.tournament.findUnique({
          where: { id: tournament.id },
          include: {
            registrations: {
              include: { user: { select: { displayName: true } } },
            },
          },
        })) ?? tournament;
    }

    const level = getBlindLevel(tournament.blindStructureId, 1);
    const nextLevelAt = computeNextLevelAt(new Date(), level);
    const tableConfig = buildTournamentTableConfig({
      tournamentId: tournament.id,
      name: tournament.name,
      maxPlayers: tournament.maxPlayers,
      startingStackCents: tournament.startingStackCents,
      blindStructureId: tournament.blindStructureId,
      level: 1,
    });

    const created = await matchMaker.createRoom("poker", { tableConfig });
    const roomId = resolveRoomId(created);
    if (!roomId) {
      throw new Error("TOURNAMENT_ROOM_CREATE_FAILED");
    }

    const humanSeats = tournament.registrations
      .filter((reg) => !reg.isBot)
      .map((reg) => ({
        userId: reg.userId,
        displayName: reg.user.displayName,
      }));
    const botSeats = tournament.registrations
      .filter((reg) => reg.isBot)
      .map((reg) => {
        const catalogBotId = parseTournamentBotCatalogId(reg.userId);
        if (!catalogBotId) {
          throw new Error(`TOURNAMENT_BOT_CATALOG_ID_MISSING:${reg.userId}`);
        }
        return {
          userId: reg.userId,
          displayName: reg.user.displayName,
          catalogBotId,
        };
      });

    const humanSeed = (await matchMaker.remoteRoomCall(
      roomId,
      "seedTournamentPlayers" as never,
      [humanSeats, tournament.startingStackCents, tournament.id],
      30_000,
    )) as { ok?: boolean; seated?: number } | undefined;

    let botSeated = 0;
    if (botSeats.length > 0) {
      const botSeed = (await matchMaker.remoteRoomCall(
        roomId,
        "seedTournamentBots" as never,
        [botSeats, tournament.startingStackCents, tournament.id],
        30_000,
      )) as { ok?: boolean; seated?: number } | undefined;
      botSeated = botSeed?.seated ?? 0;
    }

    const humanSeated = humanSeed?.seated ?? 0;
    const seated = humanSeated + botSeated;
    const lobbyPhase =
      tournament.status === "LATE_REG" || tournament.status === "STARTING";
    const readyToDeal =
      humanSeated >= MIN_TOURNAMENT_SEATED_HUMANS_TO_DEAL &&
      seated >= MIN_TOURNAMENT_SEATED_TO_DEAL;

    if (!lobbyPhase && !readyToDeal) {
      logger.error(
        { tournamentId: tournament.id, roomId, seated },
        "TOURNAMENT_SEED_FAILED",
      );
      await CashierService.processTournamentCancel({
        tournamentId: tournament.id,
        adminUserId: tournament.registrations[0]?.userId ?? tournament.id,
        externalRef: `${tournamentCancelExternalRef(tournament.id)}_seed_fail`,
      });
      return;
    }

    const nextStatus = lobbyPhase && !readyToDeal ? tournament.status : "RUNNING";

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        status: nextStatus,
        tableId: tableConfig.tableId,
        roomId,
        currentLevel: 1,
        nextLevelAt,
      },
    });

    logger.info(
      {
        tournamentId: tournament.id,
        tableId: tableConfig.tableId,
        roomId,
        seated,
        registeredCount: tournament.registrations.length,
        status: nextStatus,
      },
      readyToDeal ? "TOURNAMENT_STARTED" : "TOURNAMENT_TABLE_PROVISIONED",
    );
  }

  /** Ensure table exists and joining user is seated; promotes to RUNNING when deal threshold met. */
  async ensureTournamentTableForJoinDetailed(
    tournamentId: string,
    userId: string,
  ): Promise<TournamentEnsureTableResult> {
    const prisma = getPrisma();
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { userId },
          select: { userId: true, finishPlace: true, eliminatedAt: true },
        },
      },
    });
    if (!tournament) {
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

    const registration = tournament.registrations[0];
    const playerStatus = resolveTournamentPlayerStatus({
      isRegistered: Boolean(registration),
      tournamentStatus: tournament.status,
      finishPlace: registration?.finishPlace ?? null,
      eliminatedAt: registration?.eliminatedAt ?? null,
    });
    const terminal = ["FINISHED", "ABANDONED", "CANCELLED"].includes(tournament.status);
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
    logger.info({ ...logBase, reason: "ensure_table" }, "TOURNAMENT_ENSURE_TABLE_REQUESTED");

    if (terminal) {
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

    if (playerStatus !== "ACTIVE") {
      if (playerStatus === "ELIMINATED") {
        const canSpectate = isTournamentSpectateEligible({
          tournamentStatus: tournament.status,
          tableId: tournament.tableId,
          roomId: tournament.roomId,
        });
        if (canSpectate) {
          return {
            tournamentId,
            tournamentStatus: tournament.status,
            playerStatus,
            tableId: tournament.tableId,
            roomId: tournament.roomId,
            tableLive,
            joinStatus: "READY",
            recoveryReason: "TOURNAMENT_PLAYER_ELIMINATED",
          };
        }
      }
      if (playerStatus === "NOT_REGISTERED") {
        logger.warn(
          {
            ...logBase,
            reason: lateRegOpen ? "not_registered_late_reg_open" : "not_registered_late_reg_closed",
            contract: lateRegOpen ? "register_first_then_ensure_table" : "registration_closed",
          },
          "TOURNAMENT_ENSURE_TABLE_NOT_REGISTERED",
        );
        if (!lateRegOpen) {
          logger.warn(
            { ...logBase, reason: "late_reg_closed" },
            "TOURNAMENT_ENSURE_TABLE_LATE_REG_CLOSED",
          );
        }
      }
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

    if (tournament.roomId && tournament.tableId && tableLive) {
      await this.seatLateRegistrant(tournamentId, userId);
      await this.promoteTournamentToRunningOnJoin(tournamentId);
      const refreshed = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { status: true, tableId: true, roomId: true },
      });
      return {
        tournamentId,
        tournamentStatus: refreshed?.status ?? tournament.status,
        playerStatus,
        tableId: refreshed?.tableId ?? tournament.tableId,
        roomId: refreshed?.roomId ?? tournament.roomId,
        tableLive: true,
        joinStatus: "READY",
      };
    }

    const hadStaleRoom = Boolean(tournament.roomId || tournament.tableId);
    if (hadStaleRoom) {
      logger.warn({ ...logBase, reason: "stale_room_id" }, "TOURNAMENT_ENSURE_STALE_ROOM_ID");
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { roomId: null, tableId: null },
      });
    } else {
      logger.warn({ ...logBase, reason: "no_room_or_table_id" }, "TOURNAMENT_ENSURE_TABLE_ROOM_MISSING");
    }

    const start = await this.tryStartTournamentTable(tournamentId);
    if (!start.ok) {
      const refreshed = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { status: true, tableId: true, roomId: true },
      });
      logger.warn(
        {
          ...logBase,
          tableId: refreshed?.tableId ?? tournament.tableId,
          roomId: refreshed?.roomId ?? tournament.roomId,
          tournamentStatus: refreshed?.status ?? tournament.status,
          reason: start.reason,
          registrationCount: start.registrationCount,
        },
        "TOURNAMENT_ENSURE_TABLE_FAILED",
      );
      if (start.reason === "start_failed") {
        logger.warn(
          {
            ...logBase,
            tableId: refreshed?.tableId ?? tournament.tableId,
            roomId: refreshed?.roomId ?? tournament.roomId,
            tournamentStatus: refreshed?.status ?? tournament.status,
            reason: "start_failed_room_missing",
          },
          "TOURNAMENT_ENSURE_TABLE_ROOM_MISSING",
        );
      }
      return {
        tournamentId,
        tournamentStatus: refreshed?.status ?? tournament.status,
        playerStatus,
        tableId: refreshed?.tableId ?? null,
        roomId: refreshed?.roomId ?? null,
        tableLive: false,
        joinStatus: start.reason === "insufficient_registrations" || start.reason === "not_due" ? "NOT_ALLOWED" : "FAILED",
        recoveryReason:
          start.reason === "insufficient_registrations"
            ? "TOURNAMENT_AWAITING_PLAYERS"
            : start.reason === "not_due"
              ? "TOURNAMENT_NOT_DUE"
              : "TOURNAMENT_TABLE_UNAVAILABLE",
      };
    }

    await this.seatLateRegistrant(tournamentId, userId);
    await this.promoteTournamentToRunningOnJoin(tournamentId);

    const row = await prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      select: { tableId: true, roomId: true, status: true },
    });
    const refreshedLiveRoomIds = await loadLivePokerRoomIds();
    const refreshedLive = isTournamentRoomLive(row.roomId, refreshedLiveRoomIds);
    const joinStatus: TournamentEnsureTableJoinStatus = hadStaleRoom ? "RESTORED" : "CREATING_TABLE";
    logger.info(
      {
        ...logBase,
        tableId: row.tableId,
        roomId: row.roomId,
        tournamentStatus: row.status,
        tableLive: refreshedLive,
        reason: hadStaleRoom ? "room_restored" : "table_created",
      },
      hadStaleRoom ? "TOURNAMENT_ENSURE_ROOM_RESTORED" : "TOURNAMENT_ENSURE_TABLE_CREATED",
    );
    if (hadStaleRoom) {
      logger.info(
        {
          ...logBase,
          tableId: row.tableId,
          roomId: row.roomId,
          tournamentStatus: row.status,
          tableLive: refreshedLive,
          recoveryReason: "STALE_ROOM_REPLACED",
        },
        "TOURNAMENT_ENSURE_TABLE_ROOM_RECOVERED",
      );
    }
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
