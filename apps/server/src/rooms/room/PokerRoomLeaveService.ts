import { CloseCode, type Client } from "@colyseus/core";
import { TableSeatSessionService } from "../../engine/seats/TableSeatSessionService.js";
import type { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import type { PokerRoomContext, PokerRoomLeaveServiceContract } from "./types/PokerRoomTypes.js";

export class PokerRoomLeaveService implements PokerRoomLeaveServiceContract {
  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly session: PokerRoomSessionManager,
  ) {}

  async handleLeave(client: Client, code?: number): Promise<void> {
    const room = this.ctx.room;
    room.touchActivityInternal();
    room.handleEmptyStateChangeInternal();

    const leaveBindingEpoch = this.session.getBindingEpochForSession(client.sessionId);
    const userId = this.session.takeUserForSession(client.sessionId) ?? client.auth?.userId;

    if (!userId) return;

    const boundClient = this.session.getBoundClient(userId);
    if (boundClient && boundClient.sessionId !== client.sessionId) {
      this.ctx.logger.info(
        { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, sessionId: client.sessionId, closeCode: code },
        "POKER_LEAVE_STALE_SESSION_IGNORED",
      );
      return;
    }

    if (!this.session.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
      this.ctx.logger.info(
        {
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          userId,
          sessionId: client.sessionId,
          leaveBindingEpoch,
          currentBindingEpoch: this.session.getBindingEpochForUser(userId),
          closeCode: code,
        },
        "POKER_LEAVE_STALE_EPOCH_IGNORED",
      );
      return;
    }

    this.ctx.dealer.unbindClient(userId);
    room.removeTablePresenceInternal(userId);
    room.updateMetadataCountsInternal();

    const consented = code === CloseCode.CONSENTED;
    this.ctx.logger.info(
      {
        roomId: room.roomId,
        tableId: this.ctx.state.tableId,
        userId,
        sessionId: client.sessionId,
        closeCode: code,
        consented,
        reconnectTimeoutMs: room.reconnectTimeoutMs,
      },
      "POKER_ON_LEAVE_PATH",
    );

    if (consented) {
      await this.ctx.dealer.handleConsentedLeave(userId);
      await room.maybeRemoveBotsIfNoHumansInternal();
      room.updateMetadataCountsInternal();
      if (room.persistentSeatsEnabledInternal) {
        await TableSeatSessionService.markLeft({
          tableId: this.ctx.state.tableId,
          userId,
          stackCentsSnapshot: 0,
          handIdSnapshot: this.ctx.state.handId || undefined,
        });
      }
      return;
    }

    if (code === room.leaveCodeSessionReplaced) {
      return;
    }

    const deadlineTs = Date.now() + room.reconnectTimeoutMs;
    this.ctx.logger.info(
      {
        roomId: room.roomId,
        tableId: this.ctx.state.tableId,
        userId,
        sessionId: client.sessionId,
        closeCode: code,
        deadlineTs,
      },
      "POKER_ON_LEAVE_DISCONNECT_WINDOW_STARTED",
    );
    await room.markDisconnectedSafeInternal(userId, deadlineTs);
    if (!this.session.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
      this.ctx.logger.info(
        {
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          userId,
          sessionId: client.sessionId,
          leaveBindingEpoch,
          currentBindingEpoch: this.session.getBindingEpochForUser(userId),
          closeCode: code,
        },
        "POKER_LEAVE_STALE_EPOCH_AFTER_DISCONNECT_IGNORED",
      );
      return;
    }
    room.updateMetadataCountsInternal();

    if (room.persistentSeatsEnabledInternal) {
      const stackCents = room.getPlayerStackCentsInternal(userId);
      await TableSeatSessionService.markSittingOut({
        tableId: this.ctx.state.tableId,
        userId,
        stackCentsSnapshot: stackCents,
        handIdSnapshot: this.ctx.state.handId || undefined,
      });
      if (!this.session.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
        this.ctx.logger.info(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            sessionId: client.sessionId,
            leaveBindingEpoch,
            currentBindingEpoch: this.session.getBindingEpochForUser(userId),
            closeCode: code,
          },
          "POKER_LEAVE_STALE_EPOCH_AFTER_PERSIST_IGNORED",
        );
        return;
      }
    }

    try {
      const reconnected = await room.allowReconnection(client, Math.ceil(room.reconnectTimeoutMs / 1000));
      if (!this.session.isBindingEpochCurrent(userId, leaveBindingEpoch)) {
        this.ctx.logger.info(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            sessionId: client.sessionId,
            leaveBindingEpoch,
            currentBindingEpoch: this.session.getBindingEpochForUser(userId),
            closeCode: code,
          },
          "POKER_LEAVE_STALE_EPOCH_AFTER_ALLOW_RECONNECT_IGNORED",
        );
        try {
          reconnected.leave(room.leaveCodeSessionReplaced);
        } catch (err) {
          void err;
        }
        return;
      }

      if (room.isDeletingInternal) {
        room.sendTableMessageInternal(reconnected, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        try {
          reconnected.leave();
        } catch (err) {
          void err;
        }
        return;
      }

      this.session.rebindClientExclusive(userId, reconnected);
      room.logRestoreBindOkInternal(userId, reconnected.sessionId);
      await room.markReconnectedSafeInternal(userId);
      await room.clearSittingOutOnRestoreSafeInternal(userId);
      room.addTablePresenceInternal(reconnected, userId);
      if (room.persistentSeatsEnabledInternal) {
        const stackCents = room.getPlayerStackCentsInternal(userId);
        await TableSeatSessionService.touchConnected({
          tableId: this.ctx.state.tableId,
          userId,
          stackCentsSnapshot: stackCents,
          handIdSnapshot: this.ctx.state.handId || undefined,
        });
      }
      room.sendTableMessageInternal(reconnected, "SESSION_RESTORED", { userId, deadlineTs: 0, joinMode: "RESTORE" });
      await room.emitSnapshotsToAllSafeInternal("RECONNECT");
      room.updateMetadataCountsInternal();
    } catch {
      if (room.persistentSeatsEnabledInternal) {
        room.updateMetadataCountsInternal();
        this.ctx.logger.info({ roomId: room.roomId, tableId: this.ctx.state.tableId, userId }, "POKER_RECONNECT_WINDOW_EXPIRED_SEAT_PRESERVED");
        return;
      }
      await room.markAbandonedSafeInternal(userId);
      await room.maybeRemoveBotsIfNoHumansInternal();
      room.updateMetadataCountsInternal();
    }
  }
}
