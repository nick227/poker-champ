import { CloseCode, type Client } from "@colyseus/core";
import { TableSeatSessionService } from "../../engine/seats/TableSeatSessionService.js";
import type { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import type { PokerRoomContext, PokerRoomLeaveServiceContract } from "./types/PokerRoomTypes.js";

export class PokerRoomLeaveService implements PokerRoomLeaveServiceContract {
  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly session: PokerRoomSessionManager,
  ) {}

  private async emitReconnectSnapshotOrError(client: Client, userId: string): Promise<void> {
    const room = this.ctx.room;
    try {
      await room.emitSnapshotsToAllSafeInternal("RECONNECT");
      this.ctx.logger.info(
        {
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          tournamentId: room.getTournamentIdInternal(),
          userId,
          reason: "RECONNECT",
          handId: this.ctx.state.handId,
          street: this.ctx.state.street,
          snapshotSeq: room.lastSnapshotSeqInternal,
          nextHandAtTs: this.ctx.state.nextHandAtTs,
          readyCount: room.getReadyPlayerCountInternal(),
          activeCount: room.getActivePlayerCountInternal(),
        },
        "POKER_JOIN_SNAPSHOT_EMITTED",
      );
    } catch (err: unknown) {
      this.ctx.logger.error(
        {
          err,
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          tournamentId: room.getTournamentIdInternal(),
          userId,
          reason: "RECONNECT",
          handId: this.ctx.state.handId,
          street: this.ctx.state.street,
          snapshotSeq: room.lastSnapshotSeqInternal,
          nextHandAtTs: this.ctx.state.nextHandAtTs,
          readyCount: room.getReadyPlayerCountInternal(),
          activeCount: room.getActivePlayerCountInternal(),
          message: err instanceof Error ? err.message : String(err),
        },
        "POKER_JOIN_SNAPSHOT_FAILED",
      );
      room.sendTableMessageInternal(client, "ERROR", {
        code: "TABLE_SNAPSHOT_FAILED",
        message: "Table state could not be restored. Please retry.",
        recoveryReason: "SNAPSHOT_EMIT_FAILED",
      });
    }
  }

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
      await room.reevaluateIdleLifecycleInternal();
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

      await room.withTableLifecycleLockInternal(async () => {
      if (room.isDeletingInternal) {
        room.sendTableMessageInternal(reconnected, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        try {
          reconnected.leave();
        } catch (err) {
          void err;
        }
        return;
      }

      const reconnectWon = await room.markReconnectedSafeInternal(userId);
      if (!reconnectWon) {
        room.sendTableMessageInternal(reconnected, "ERROR", { code: "SESSION_ENDED", message: "This table session has ended." });
        reconnected.leave();
        return;
      }
      this.session.rebindClientExclusive(userId, reconnected);
      room.logRestoreBindOkInternal(userId, reconnected.sessionId);
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
      await this.emitReconnectSnapshotOrError(reconnected, userId);
      room.updateMetadataCountsInternal();
      await room.reevaluateIdleLifecycleInternal();
      });
    } catch {
      // Single abandonment policy for both persistent- and non-persistent-seat tables: once the
      // reconnect window has expired, finalize now. finalizeRemoval (PlayerLifecycleService) pairs
      // the cash-out with TableSeatSessionService.markLeft, so the durable seat, the runtime seat,
      // and PlayerBalance always move together no matter which of markAbandonedSafeInternal's two
      // callers (this one, or DisconnectManager's periodic sweep) actually wins the race -- the
      // expectedDisconnectDeadlineTs guard in Dealer.markAbandonedSerialized makes whichever one
      // loses a safe no-op instead of a second, divergent abandonment.
      this.ctx.logger.info(
        { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, persistentSeatsEnabled: room.persistentSeatsEnabledInternal },
        "POKER_RECONNECT_WINDOW_EXPIRED_FINALIZING",
      );
      await room.markAbandonedSafeInternal(userId, deadlineTs);
      await room.maybeRemoveBotsIfNoHumansInternal();
      room.updateMetadataCountsInternal();
      await room.reevaluateIdleLifecycleInternal();
    }
  }
}
