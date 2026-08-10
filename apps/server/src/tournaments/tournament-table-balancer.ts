import { matchMaker } from "@colyseus/core";
import { getPrisma } from "@poker-champ/db";
import { logger } from "../lib/logger.js";
import { MAX_SEATS_PER_TABLE } from "./tournament.constants.js";

/** Hooks the calling table's own room provides -- everything this module needs to touch THIS
 *  room's live state without a cross-room call (the source side of a move is always the room the
 *  reconciler is already running inside). */
export type TableBalanceHooks = {
  /** Cash-free removal of a player from THIS room; returns their stack, or null if not seated here.
   *  destinationTableNumber lets the room surface a transient "you've been moved" hint (Phase 3). */
  removePlayerForTableTransfer: (userId: string, destinationTableNumber?: number) => Promise<number | null>;
  /** Block this room from dealing its next hand (mirrors the tournament-finished flag). */
  onTableBreaking: () => void;
};

type OpenTableRow = { id: string; tableNumber: number; roomId: string | null };

/**
 * Table balancing (MTT proposal, "Table balancing"): standard live-poker floor procedure, not
 * ICM-optimal -- move one player from the fullest to the emptiest OPEN table when they differ by
 * more than 1 seated player, and break (close + redistribute) the least-populated table once the
 * remaining field fits in fewer tables. Deliberately simple and auditable.
 *
 * Every decision here is scoped to the CALLING table's own post-hand pass (extends
 * TournamentTableReconciler.reconcileAfterHand, which only ever runs at street === WAITING, i.e.
 * between hands). A table only ever acts on itself -- it never reaches into another room's live
 * state -- so the only cross-room call this module makes is the one-directional "seat this player
 * at the destination room" call for the table that was independently elected fullest/emptiest.
 * This keeps every physical mutation attributable to a single already-safe (between-hands) room,
 * with a DB-level CAS as the only cross-process synchronization primitive needed.
 */
export class TournamentTableBalancer {
  async reconcileAfterHand(
    tournamentId: string,
    myTournamentTableId: string,
    hooks: TableBalanceHooks,
  ): Promise<void> {
    const prisma = getPrisma();
    const openTables = await prisma.tournamentTable.findMany({
      where: { tournamentId, status: "OPEN" },
      orderBy: { tableNumber: "asc" },
      select: { id: true, tableNumber: true, roomId: true },
    });
    // Tables without a live room yet (secondary tables lazily provisioned on first join/rebuy --
    // see MULTI_TABLE_TOURNAMENT_PROPOSAL.md) can't physically hold a moved player. They're
    // excluded from balancing; once their first registrant connects, Phase 1's existing routing
    // provisions them and they join the balancing pool from that point on.
    const liveOpenTables = openTables.filter((t) => t.roomId != null);
    if (liveOpenTables.length <= 1) return;

    const populations = await this.loadPopulations(tournamentId, liveOpenTables);

    const brokeSelf = await this.maybeBreakSelf(tournamentId, myTournamentTableId, liveOpenTables, populations, hooks);
    if (brokeSelf) return; // already redistributed this table's players this pass

    await this.maybeRebalanceSelf(tournamentId, myTournamentTableId, liveOpenTables, populations, hooks);
  }

  private async loadPopulations(tournamentId: string, liveOpenTables: OpenTableRow[]): Promise<Map<string, number>> {
    const prisma = getPrisma();
    const counts = await prisma.tournamentRegistration.groupBy({
      by: ["tournamentTableId"],
      where: {
        tournamentId,
        finishPlace: null,
        tournamentTableId: { in: liveOpenTables.map((t) => t.id) },
      },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((c) => [c.tournamentTableId as string, c._count._all]));
    return new Map(liveOpenTables.map((t) => [t.id, byId.get(t.id) ?? 0]));
  }

  private pickFewestPopulated(tables: OpenTableRow[], populations: Map<string, number>): OpenTableRow {
    return tables.reduce((fewest, table) =>
      (populations.get(table.id) ?? 0) < (populations.get(fewest.id) ?? 0) ? table : fewest,
    );
  }

  private pickFullest(tables: OpenTableRow[], populations: Map<string, number>): OpenTableRow {
    return tables.reduce((fullest, table) =>
      (populations.get(table.id) ?? 0) > (populations.get(fullest.id) ?? 0) ? table : fullest,
    );
  }

  /**
   * Break this table if it's the (deterministically tie-broken, via pickFewestPopulated's stable
   * reduce) fewest-populated live OPEN table AND the remaining field now fits in one fewer table
   * than currently OPEN. Only ever elects and acts on `myTournamentTableId` -- if a different
   * table is the elected target, this is a no-op here; that table's own next post-hand pass will
   * independently compute the same election (same population snapshot rule) and act on itself.
   */
  private async maybeBreakSelf(
    tournamentId: string,
    myTournamentTableId: string,
    liveOpenTables: OpenTableRow[],
    populations: Map<string, number>,
    hooks: TableBalanceHooks,
  ): Promise<boolean> {
    const totalRemaining = [...populations.values()].reduce((sum, n) => sum + n, 0);
    const targetTableCount = Math.max(1, Math.ceil(totalRemaining / MAX_SEATS_PER_TABLE));
    if (targetTableCount >= liveOpenTables.length) return false;

    const elected = this.pickFewestPopulated(liveOpenTables, populations);
    if (elected.id !== myTournamentTableId) return false;

    const prisma = getPrisma();
    const claim = await prisma.tournamentTable.updateMany({
      where: { id: myTournamentTableId, status: "OPEN" },
      data: { status: "BREAKING" },
    });
    if (claim.count === 0) return false; // lost a race (already breaking/closed elsewhere)

    hooks.onTableBreaking();
    await this.redistributeAndClose(tournamentId, myTournamentTableId, liveOpenTables, populations, hooks);
    logger.info({ tournamentId, tournamentTableId: myTournamentTableId }, "TOURNAMENT_TABLE_BROKEN");
    return true;
  }

  /**
   * Move every remaining registrant off the just-broken table onto the other live OPEN tables
   * (same fewest-first placement rule), then flip it CLOSED. Only ever called on the calling
   * table's own row from its own post-hand pass, so every player being moved is guaranteed to be
   * physically present in the room this reconciler is already running inside.
   */
  private async redistributeAndClose(
    tournamentId: string,
    myTournamentTableId: string,
    liveOpenTables: OpenTableRow[],
    populations: Map<string, number>,
    hooks: TableBalanceHooks,
  ): Promise<void> {
    const destinations = liveOpenTables.filter((t) => t.id !== myTournamentTableId);
    const prisma = getPrisma();
    const remaining = await prisma.tournamentRegistration.findMany({
      where: { tournamentId, tournamentTableId: myTournamentTableId, finishPlace: null },
      select: { userId: true, user: { select: { displayName: true } } },
    });

    if (destinations.length > 0) {
      const localPopulations = new Map(populations);
      for (const reg of remaining) {
        const dest = this.pickFewestPopulated(destinations, localPopulations);
        const moved = await this.moveOnePlayer(tournamentId, reg.userId, reg.user.displayName, myTournamentTableId, dest, hooks);
        if (moved) {
          localPopulations.set(dest.id, (localPopulations.get(dest.id) ?? 0) + 1);
        }
      }
    }

    await prisma.tournamentTable.update({
      where: { id: myTournamentTableId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
  }

  /** Rebalance: if this table is the (elected) fullest and it beats the emptiest by more than 1
   *  seated player, move exactly one player off it. Only the fullest table's own pass acts. */
  private async maybeRebalanceSelf(
    tournamentId: string,
    myTournamentTableId: string,
    liveOpenTables: OpenTableRow[],
    populations: Map<string, number>,
    hooks: TableBalanceHooks,
  ): Promise<void> {
    const fullest = this.pickFullest(liveOpenTables, populations);
    const emptiest = this.pickFewestPopulated(liveOpenTables, populations);
    if (fullest.id === emptiest.id) return;
    const gap = (populations.get(fullest.id) ?? 0) - (populations.get(emptiest.id) ?? 0);
    if (gap <= 1) return;
    if (fullest.id !== myTournamentTableId) return;

    const prisma = getPrisma();
    const candidate = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, tournamentTableId: myTournamentTableId, finishPlace: null },
      select: { userId: true, user: { select: { displayName: true } } },
    });
    if (!candidate) return;

    await this.moveOnePlayer(tournamentId, candidate.userId, candidate.user.displayName, myTournamentTableId, emptiest, hooks);
  }

  /**
   * Claim + physically execute a single player move: CAS the DB assignment first (source of
   * truth, guards against a concurrent balancer pass claiming the same player twice), then
   * physically remove them from the source room (always the room this reconciler is running
   * inside, via `hooks`) and seat them at the destination room with their exact carried-over
   * stack -- no new money, the same primitive the tournament rebuy flow uses to re-seat a player
   * at an explicit stack.
   */
  private async moveOnePlayer(
    tournamentId: string,
    userId: string,
    displayName: string,
    sourceTournamentTableId: string,
    destination: OpenTableRow,
    hooks: TableBalanceHooks,
  ): Promise<boolean> {
    const prisma = getPrisma();
    const claim = await prisma.tournamentRegistration.updateMany({
      where: { tournamentId, userId, tournamentTableId: sourceTournamentTableId },
      data: { tournamentTableId: destination.id },
    });
    if (claim.count === 0) return false; // lost a race -- someone else already moved this player

    const stackCents = await hooks.removePlayerForTableTransfer(userId, destination.tableNumber);
    if (stackCents == null) {
      // Not actually seated here (stale population read, e.g. a not-yet-connected registrant) --
      // revert the claim so the assignment doesn't point at a table they were never moved to.
      await prisma.tournamentRegistration.updateMany({
        where: { tournamentId, userId, tournamentTableId: destination.id },
        data: { tournamentTableId: sourceTournamentTableId },
      });
      return false;
    }

    try {
      await matchMaker.remoteRoomCall(
        destination.roomId!,
        "seatTournamentPlayerForTableTransfer" as never,
        [userId, displayName, stackCents],
        30_000,
      );
    } catch (err: unknown) {
      logger.error(
        {
          err,
          tournamentId,
          userId,
          destinationTournamentTableId: destination.id,
          message: err instanceof Error ? err.message : String(err),
        },
        "TOURNAMENT_TABLE_MOVE_SEAT_FAILED",
      );
      return false;
    }

    logger.info(
      { tournamentId, userId, fromTournamentTableId: sourceTournamentTableId, toTournamentTableId: destination.id, stackCents },
      "TOURNAMENT_TABLE_PLAYER_MOVED",
    );
    return true;
  }

  /**
   * Manual balance override (MTT proposal Phase 5): an admin-triggered rebalance pass, outside
   * the normal post-hand trigger. Same fullest/emptiest election and >1-gap threshold as the
   * automatic path, so an admin can't force a move onto tables that are already about as balanced
   * as they'll get. The one difference from the automatic path: there's no "calling table" room
   * context here (this isn't invoked from inside a table's own post-hand pass), so the source-side
   * removal also goes through matchMaker.remoteRoomCall instead of an in-room hook.
   */
  async forceRebalance(tournamentId: string): Promise<{ moved: boolean; reason?: string }> {
    const prisma = getPrisma();
    const openTables = await prisma.tournamentTable.findMany({
      where: { tournamentId, status: "OPEN" },
      orderBy: { tableNumber: "asc" },
      select: { id: true, tableNumber: true, roomId: true },
    });
    const liveOpenTables = openTables.filter((t) => t.roomId != null);
    if (liveOpenTables.length < 2) return { moved: false, reason: "not_enough_tables" };

    const populations = await this.loadPopulations(tournamentId, liveOpenTables);
    const fullest = this.pickFullest(liveOpenTables, populations);
    const emptiest = this.pickFewestPopulated(liveOpenTables, populations);
    const gap = (populations.get(fullest.id) ?? 0) - (populations.get(emptiest.id) ?? 0);
    if (fullest.id === emptiest.id || gap <= 1) return { moved: false, reason: "already_balanced" };

    const candidate = await prisma.tournamentRegistration.findFirst({
      where: { tournamentId, tournamentTableId: fullest.id, finishPlace: null },
      select: { userId: true, user: { select: { displayName: true } } },
    });
    if (!candidate) return { moved: false, reason: "no_movable_player" };

    const moved = await this.moveOnePlayer(
      tournamentId,
      candidate.userId,
      candidate.user.displayName,
      fullest.id,
      emptiest,
      {
        removePlayerForTableTransfer: (userId, destinationTableNumber) =>
          matchMaker.remoteRoomCall(
            fullest.roomId!,
            "removeTournamentPlayerForTableTransfer" as never,
            [userId, destinationTableNumber],
            30_000,
          ) as Promise<number | null>,
        onTableBreaking: () => {},
      },
    );

    return { moved, reason: moved ? undefined : "move_failed" };
  }
}

export const tournamentTableBalancer = new TournamentTableBalancer();
