import { matchMaker, type Client } from "@colyseus/core";
import { TableJoinOptionsSchema } from "@poker-champ/realtime-contract";
import type { ZodIssue } from "zod";
import { PokerError } from "../../engine/errors.js";
import { TableSeatSessionService } from "../../engine/seats/TableSeatSessionService.js";
import { presenceIndex } from "../../lobby/PresenceIndex.js";
import type { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import type { PokerRoomContext, PokerRoomJoinServiceContract } from "./types/PokerRoomTypes.js";

export class PokerRoomJoinService implements PokerRoomJoinServiceContract {
  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly session: PokerRoomSessionManager,
  ) {}

  async handleJoin(client: Client, options: any, auth?: any): Promise<void> {
    const room = this.ctx.room;
    const userId = auth?.userId;
    const requestedBuyInCents =
      Number.isInteger(options?.buyInCents) && (options?.buyInCents as number) > 0
        ? (options!.buyInCents as number)
        : null;

    const lockKey = `${this.ctx.state.tableId}:${userId ?? client.sessionId}`;
    await room.withJoinLockInternal(lockKey, async () => {
      if (room.isDeletingInternal) {
        room.sendTableMessageInternal(client, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        client.leave();
        return;
      }
      room.touchActivityInternal();
      await room.runPersistentSeatCleanupInternal();

      this.ctx.logger.info(
        {
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          sessionId: client.sessionId,
          userId,
          hasBuyIn: Number.isInteger(options?.buyInCents),
          buyInCents: options?.buyInCents,
        },
        "POKER_JOIN_ATTEMPT",
      );

      if (!userId || !auth) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Authentication required." });
        client.leave();
        return;
      }

      const otherTableIds = presenceIndex.getTableIdsForUser(userId).filter((id) => id !== this.ctx.state.tableId);
      if (otherTableIds.length > 0) {
        type PokerRoomRef = { roomId?: string; metadata?: { tableId?: string } };
        const pokerRooms = (await matchMaker.query({ name: "poker" })) as PokerRoomRef[];
        for (const otherTableId of otherTableIds) {
          const otherRoom = pokerRooms.find((r) => r.metadata?.tableId === otherTableId);
          if (otherRoom?.roomId) {
            try {
              await matchMaker.remoteRoomCall(otherRoom.roomId, "requestUserLeaveBecauseJoiningAnotherTable" as never, [userId], 5000);
            } catch (err) {
              this.ctx.logger.warn(
                { err, roomId: room.roomId, tableId: this.ctx.state.tableId, otherTableId, userId },
                "requestUserLeaveBecauseJoiningAnotherTable failed",
              );
            }
          }
        }
      }

      if (this.ctx.dealer.hasPlayer(userId)) {
        const currentPlayer = this.ctx.state.playersById.get(userId);
        const shouldApplyJoinBuyInOverride =
          requestedBuyInCents != null &&
          this.ctx.state.street === "WAITING" &&
          currentPlayer?.stackCents === 0 &&
          currentPlayer?.status === "OUT";
        if (shouldApplyJoinBuyInOverride) {
          try {
            await room.processJoinBuyInForZeroStackSeatInternal(userId, requestedBuyInCents);
          } catch (err: any) {
            this.ctx.logger.warn(
              {
                roomId: room.roomId,
                tableId: this.ctx.state.tableId,
                userId,
                buyInCents: requestedBuyInCents,
                code: err instanceof PokerError ? err.code : "JOIN_BUYIN_FAILED",
                message: err?.message ?? String(err),
              },
              "POKER_JOIN_BUYIN_OVERRIDE_FAILED",
            );
            if (err instanceof PokerError) room.sendTableMessageInternal(client, "ERROR", { code: err.code, message: err.message });
            else room.sendTableMessageInternal(client, "ERROR", { code: "JOIN_BUYIN_FAILED", message: err?.message ?? String(err) });
            client.leave();
            return;
          }
        }

        this.session.rebindClientExclusive(userId, client);
        room.logRestoreBindOkInternal(userId, client.sessionId);
        await room.markReconnectedSafeInternal(userId);
        await room.clearSittingOutOnRestoreSafeInternal(userId);
        room.addTablePresenceInternal(client, userId, auth.username);
        if (room.persistentSeatsEnabledInternal) {
          const stackCents = room.getPlayerStackCentsInternal(userId);
          await TableSeatSessionService.touchConnected({
            tableId: this.ctx.state.tableId,
            userId,
            stackCentsSnapshot: stackCents,
            handIdSnapshot: this.ctx.state.handId || undefined,
          });
        }
        room.sendTableMessageInternal(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
        await room.emitSnapshotsToAllSafeInternal("RECONNECT");
        room.handleEmptyStateChangeInternal();
        return;
      }

      if (room.persistentSeatsEnabledInternal) {
        const persisted = await TableSeatSessionService.findRejoinableSession({
          tableId: this.ctx.state.tableId,
          userId,
        });
        if (persisted) {
          const shouldTreatPersistedAsNewJoin =
            requestedBuyInCents != null &&
            this.ctx.state.street === "WAITING" &&
            persisted.stackCentsSnapshot === 0 &&
            persisted.state === "SEATED_SITTING_OUT";
          if (shouldTreatPersistedAsNewJoin) {
            await TableSeatSessionService.markLeft({
              tableId: this.ctx.state.tableId,
              userId,
              reason: "JOIN_WITH_BUYIN_OVERRIDE",
              stackCentsSnapshot: persisted.stackCentsSnapshot,
              handIdSnapshot: this.ctx.state.handId || undefined,
            });
          } else {
            try {
              await this.ctx.dealer.restorePlayerFromSession(userId, auth.username, persisted.seat, persisted.stackCentsSnapshot);
              room.updateMetadataCountsInternal();
              this.session.rebindClientExclusive(userId, client);
              room.logRestoreBindOkInternal(userId, client.sessionId);
              await room.markReconnectedSafeInternal(userId);
              await room.clearSittingOutOnRestoreSafeInternal(userId);
              room.addTablePresenceInternal(client, userId, auth.username);
              await TableSeatSessionService.touchConnected({
                tableId: this.ctx.state.tableId,
                userId,
                stackCentsSnapshot: room.getPlayerStackCentsInternal(userId),
                handIdSnapshot: this.ctx.state.handId || undefined,
              });
              room.sendTableMessageInternal(client, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
              await room.emitSnapshotsToAllSafeInternal("RECONNECT");
              this.ctx.logger.info({ roomId: room.roomId, tableId: this.ctx.state.tableId, userId }, "POKER_JOIN_REBOUND_PERSISTED");
              room.handleEmptyStateChangeInternal();
              return;
            } catch (err: any) {
              this.ctx.logger.warn(
                {
                  roomId: room.roomId,
                  tableId: this.ctx.state.tableId,
                  userId,
                  code: err instanceof PokerError ? err.code : "RESTORE_FAILED",
                  message: err?.message ?? String(err),
                },
                "POKER_JOIN_REBOUND_PERSISTED_FAILED",
              );
              room.sendTableMessageInternal(client, "ERROR", {
                code: err instanceof PokerError ? err.code : "RESTORE_FAILED",
                message: err?.message ?? "Failed to restore persisted seat.",
              });
              client.leave();
              return;
            }
          }
        }
      }

      const parsedJoin = TableJoinOptionsSchema.safeParse(options ?? {});
      if (!parsedJoin.success) {
        const hasBuyInIssue = parsedJoin.error.issues.some((issue: ZodIssue) => issue.path[0] === "buyInCents");
        this.ctx.logger.warn(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            errors: parsedJoin.error.flatten(),
          },
          "POKER_JOIN_REJECTED_BAD_OPTIONS",
        );
        room.sendTableMessageInternal(client, "ERROR", {
          code: hasBuyInIssue ? "MISSING_BUY_IN_CENTS" : "BAD_JOIN_OPTIONS",
          message: hasBuyInIssue ? "buyInCents is required and must be a positive integer." : "Invalid join options.",
          details: parsedJoin.error.flatten(),
        });
        client.leave();
        return;
      }

      const name = auth.username;
      const buyInCents = parsedJoin.data.buyInCents;

      try {
        if (this.ctx.dealer.hasPlayer(userId)) {
          throw new PokerError("BAD_STATE", "User already seated at this table.");
        }

        this.session.rebindClientExclusive(userId, client);
        await this.ctx.dealer.addPlayer(userId, name, buyInCents);
        room.updateMetadataCountsInternal();

        if (room.persistentSeatsEnabledInternal) {
          const seat = room.findPlayerSeatInternal(userId);
          const stackCents = room.getPlayerStackCentsInternal(userId);
          if (seat !== null) {
            await TableSeatSessionService.upsertActiveSeat({
              tableId: this.ctx.state.tableId,
              userId,
              seat,
              stackCentsSnapshot: stackCents,
              buyInCents,
              handIdSnapshot: this.ctx.state.handId || undefined,
            });
          }
        }

        room.sendTableMessageInternal(client, "WELCOME", {
          roomId: room.roomId,
          playerId: userId,
          tableId: this.ctx.state.tableId,
          joinMode: "NEW",
        });
        room.addTablePresenceInternal(client, userId, auth.username);
        await room.emitSnapshotsToAllSafeInternal("JOIN");
        this.ctx.logger.info({ roomId: room.roomId, tableId: this.ctx.state.tableId, userId }, "POKER_JOIN_SUCCESS");
        room.handleEmptyStateChangeInternal();
      } catch (err: any) {
        this.ctx.logger.warn(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            code: err instanceof PokerError ? err.code : "JOIN_FAILED",
            message: err?.message ?? String(err),
          },
          "POKER_JOIN_FAILED",
        );
        if (err instanceof PokerError) room.sendTableMessageInternal(client, "ERROR", { code: err.code, message: err.message });
        else room.sendTableMessageInternal(client, "ERROR", { code: "JOIN_FAILED", message: err?.message ?? String(err) });
        client.leave();
      }
    });
  }
}
