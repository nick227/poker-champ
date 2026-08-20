import { nanoid } from "nanoid";
import type { Client } from "@colyseus/core";
import {
  AddBotPayloadSchema,
  ChatPayloadSchema,
  RemoveBotPayloadSchema,
  SendGiftPayloadSchema,
  TableInboundMessageSchema,
} from "@poker-champ/realtime-contract";
import { ActionPayloadSchema } from "@poker-champ/realtime-contract";
import { PokerError } from "../../engine/errors.js";
import type { SnapshotReason } from "../../engine/dealer/hand/SnapshotService.js";
import { newBotId } from "../../engine/bots/botIds.js";
import { listEnabledBotSummaries, resolveBotSelectionForAdd } from "../../engine/bots/BotCatalog.js";
import { TableSeatSessionService } from "../../engine/seats/TableSeatSessionService.js";
import { dealerRuntimeMetrics } from "../../engine/dealer/metrics/dealerRuntimeMetrics.js";
import {
  GIFT_CATALOG_KEY_UNKNOWN,
  GIFT_RECIPIENT_INVALID,
  PlayerInteractionService,
} from "../../engine/economy/PlayerInteractionService.js";
import type { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import type { PokerRoomContext, PokerRoomMessageRouterContract } from "./types/PokerRoomTypes.js";
import { assertNotTournamentTableSpectator } from "../../tournaments/tournament-table-spectator.js";

export class PokerRoomMessageRouter implements PokerRoomMessageRouterContract {
  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly session: PokerRoomSessionManager,
  ) {}

  private assertHeroCanAct(userId: string): void {
    assertNotTournamentTableSpectator({
      tournamentId: this.ctx.room.getTournamentIdInternal(),
      hasPlayer: (id) => this.ctx.dealer.hasPlayer(id),
      userId,
    });
  }

  private static asErrorLike(err: unknown): { code?: string; message: string } {
    if (err instanceof PokerError) return { code: err.code, message: err.message };
    if (err instanceof Error) return { message: err.message };
    return { message: String(err) };
  }

  private async emitUserSnapshotOrError(client: Client, userId: string, reason: SnapshotReason): Promise<void> {
    const room = this.ctx.room;
    try {
      await this.ctx.dealer.emitSnapshotToUser(userId, reason);
      this.ctx.logger.info(
        {
          roomId: room.roomId,
          tableId: this.ctx.state.tableId,
          tournamentId: room.getTournamentIdInternal(),
          userId,
          reason,
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
          reason,
          handId: this.ctx.state.handId,
          street: this.ctx.state.street,
          snapshotSeq: room.lastSnapshotSeqInternal,
          nextHandAtTs: this.ctx.state.nextHandAtTs,
          readyCount: room.getReadyPlayerCountInternal(),
          activeCount: room.getActivePlayerCountInternal(),
          message: PokerRoomMessageRouter.asErrorLike(err).message,
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

  registerAll(): void {
    const room = this.ctx.room;

    room.onMessage("ADD_BOT", async (client: Client, message: unknown) => {
      const parsed = AddBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to add a bot." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;

      try {
        const resolved = resolveBotSelectionForAdd(parsed.data.botId);
        if (!resolved.ok) {
          const reasonMessage =
            resolved.reason === "NO_ENABLED_BOTS" ? "No enabled bots are available." : "Unknown or disabled botId.";
          room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: reasonMessage });
          return;
        }
        const runtimeBotId = newBotId();
        const botName = resolved.bot.name ?? parsed.data.name ?? "Bot";
        await this.ctx.dealer.addBot(runtimeBotId, botName, parsed.data.buyInCents, resolved.bot.id);
        room.updateMetadataCountsInternal();
      } catch (err: unknown) {
        const e = PokerRoomMessageRouter.asErrorLike(err);
        room.sendTableMessageInternal(client, "ERROR", { code: e.code ?? "ADD_BOT_FAILED", message: e.message });
      }
    });

    room.onMessage("LIST_BOTS", (client: Client, message: unknown) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "LIST_BOTS", payload: message ?? {} });
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      room.sendTableMessageInternal(client, "BOTS_LIST", { bots: listEnabledBotSummaries() });
    });

    room.onMessage("REMOVE_BOT", async (client: Client, message: unknown) => {
      const parsed = RemoveBotPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to remove a bot." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      const bot = this.ctx.state.playersById.get(parsed.data.botId);
      const canRemoveBetweenHands = this.ctx.state.street === "WAITING";
      const canRemoveDuringHand =
        bot?.kind === "BOT" &&
        (bot.status === "ABANDONED" || bot.status === "OUT" || bot.sittingOutUntilNextHand || bot.stackCents === 0);
      if (!canRemoveBetweenHands && !canRemoveDuringHand) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "REMOVE_BOT_NOT_ALLOWED",
          message: "Can only remove bots between hands, or during a hand if the bot is sitting out or has zero stack.",
        });
        return;
      }
      try {
        await this.ctx.dealer.removeBot(parsed.data.botId);
        room.updateMetadataCountsInternal();
      } catch (err: unknown) {
        const e = PokerRoomMessageRouter.asErrorLike(err);
        room.sendTableMessageInternal(client, "ERROR", {
          code: e.code ?? "REMOVE_BOT_FAILED",
          message: e.message,
        });
      }
    });

    room.onMessage("CHAT", (client: Client, message: unknown) => {
      if (room.isChatRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many messages. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      room.touchActivityInternal();
      const parsed = ChatPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid chat message." });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be in the room to chat." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      const player = room.getPlayerByUserIdInternal(userId);
      if (!player || player.kind === "BOT") {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to chat." });
        return;
      }
      const payload = {
        id: nanoid(),
        tableId: this.ctx.state.tableId,
        senderUserId: userId,
        senderName: player.name || `player_${userId.slice(0, 6)}`,
        text: parsed.data.text,
        createdAtTs: Date.now(),
      };
      room.clients.forEach((c: Client) => room.sendTableMessageInternal(c, "CHAT_MESSAGE", payload));
    });

    room.onMessage("SEND_GIFT", async (client: Client, message: unknown) => {
      if (room.isChatRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many gifts. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      room.touchActivityInternal();
      const parsed = SendGiftPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to send a gift." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      const sender = room.getPlayerByUserIdInternal(userId);
      if (!sender || sender.kind === "BOT") {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to send a gift." });
        return;
      }

      const { recipientUserId, catalogKey, clientRequestId } = parsed.data;
      if (recipientUserId === userId) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: GIFT_RECIPIENT_INVALID,
          message: "You cannot send a gift to yourself.",
        });
        return;
      }
      const recipient = room.getPlayerByUserIdInternal(recipientUserId);
      if (!recipient || recipient.kind === "BOT") {
        room.sendTableMessageInternal(client, "ERROR", {
          code: GIFT_RECIPIENT_INVALID,
          message: "Recipient must be seated at this table.",
        });
        return;
      }

      try {
        const result = await PlayerInteractionService.sendGift({
          initiatorId: userId,
          recipientId: recipientUserId,
          tableId: this.ctx.state.tableId,
          catalogKey,
          clientRequestId,
        });
        const payload = {
          ...result,
          senderName: sender.name || `player_${userId.slice(0, 6)}`,
          recipientName: recipient.name || `player_${recipientUserId.slice(0, 6)}`,
        };
        room.clients.forEach((c: Client) => room.sendTableMessageInternal(c, "GIFT_RECEIVED", payload));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          message === "INSUFFICIENT_BANKROLL" || message === GIFT_CATALOG_KEY_UNKNOWN || message === GIFT_RECIPIENT_INVALID
            ? message
            : "SEND_GIFT_FAILED";
        room.sendTableMessageInternal(client, "ERROR", { code, message });
      }
    });

    room.onMessage("ACTION", async (client: Client, message: unknown) => {
      if (room.isActionRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many actions. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      const envelope = TableInboundMessageSchema.safeParse({ type: "ACTION", payload: message });
      if (!envelope.success) {
        const missingActionId = envelope.error.issues.some((issue) => issue.path.join(".") === "payload.actionId");
        if (missingActionId) {
          room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "actionId is required for idempotency." });
          return;
        }
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: envelope.error.flatten() });
        return;
      }

      const rawMessage = (message && typeof message === "object" ? message : {}) as Record<string, unknown>;
      const normalized = room.normalizeActionPayloadInternal(rawMessage);
      if (!normalized) {
        const topLevelActionId = rawMessage.actionId;
        const nestedActionId =
          rawMessage.payload &&
          typeof rawMessage.payload === "object" &&
          typeof (rawMessage.payload as Record<string, unknown>).actionId === "string"
            ? (rawMessage.payload as Record<string, unknown>).actionId
            : undefined;
        const hasActionId =
          (typeof topLevelActionId === "string" && topLevelActionId.length > 0) ||
          (typeof nestedActionId === "string" && nestedActionId.length > 0);
        if (!hasActionId) {
          room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "actionId is required for idempotency." });
          return;
        }
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid ACTION message format." });
        return;
      }

      const parsed = ActionPayloadSchema.safeParse(normalized.payload);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }

      const userId = this.session.getUserIdForSession(client.sessionId);
      try {
        if (!userId) {
          dealerRuntimeMetrics.recordActionRejected("SESSION_NOT_BOUND");
          this.ctx.logger.warn(
            { roomId: room.roomId, tableId: this.ctx.state.tableId, sessionId: client.sessionId },
            "ACTION_REJECTED reason=SESSION_NOT_BOUND",
          );
          throw new PokerError("BAD_STATE", "Session is not bound to a seated user.");
        }

        const expectedEpoch = this.session.getBindingEpochForUser(userId);
        const sessionEpoch = this.session.getBindingEpochForSession(client.sessionId);
        if (sessionEpoch !== expectedEpoch) {
          dealerRuntimeMetrics.recordActionRejected("STALE_SESSION");
          this.ctx.logger.warn(
            { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, sessionId: client.sessionId, expectedEpoch, sessionEpoch },
            "ACTION_REJECTED reason=STALE_SESSION",
          );
          return;
        }
        if (!this.session.isActiveBoundClient(userId, client)) {
          dealerRuntimeMetrics.recordActionRejected("INACTIVE_BOUND_CLIENT");
          this.ctx.logger.warn(
            { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, sessionId: client.sessionId },
            "ACTION_REJECTED reason=INACTIVE_BOUND_CLIENT",
          );
          return;
        }

        this.assertHeroCanAct(userId);

        room.touchActivityInternal();
        const currentHandId = this.ctx.state.handId;
        if (normalized.handId && normalized.handId !== currentHandId) {
          dealerRuntimeMetrics.recordActionRejected("HAND_ID_MISMATCH");
          this.ctx.logger.warn(
            {
              roomId: room.roomId,
              tableId: this.ctx.state.tableId,
              userId,
              action: parsed.data.action,
              providedHandId: normalized.handId,
              currentHandId,
            },
            "ACTION_REJECTED reason=HAND_ID_MISMATCH",
          );
          throw new PokerError(
            "HAND_NOT_STARTED",
            "Action handId does not match the current hand.",
            { providedHandId: normalized.handId, currentHandId },
          );
        }
        this.ctx.logger.info(
          { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, action: parsed.data.action, amountCents: parsed.data.amountCents },
          "POKER_ACTION_ATTEMPT",
        );

        await this.ctx.dealer.handleAction(userId, parsed.data, normalized.actionId, client);
        room.setLastAcceptedActionInternal(userId, {
          action: parsed.data.action,
          amountCents: parsed.data.amountCents,
          actionId: normalized.actionId,
          atTs: Date.now(),
        });

        this.ctx.logger.info(
          { roomId: room.roomId, tableId: this.ctx.state.tableId, userId, action: parsed.data.action, amountCents: parsed.data.amountCents },
          "POKER_ACTION_ACCEPTED",
        );
      } catch (err: unknown) {
        const isBenignDuplicateRetry = (() => {
          if (!(err instanceof PokerError)) return false;
          if (err.code !== "NOT_YOUR_TURN" && err.code !== "HAND_NOT_STARTED") return false;
          const last = room.getLastAcceptedActionInternal(userId ?? "");
          if (!last) return false;
          if (last.actionId !== normalized.actionId) return false;
          if (last.action !== parsed.data.action) return false;
          if ((last.amountCents ?? undefined) !== (parsed.data.amountCents ?? undefined)) return false;
          return Date.now() - last.atTs <= 1200;
        })();
        if (isBenignDuplicateRetry) {
          this.ctx.logger.info(
            {
              roomId: room.roomId,
              tableId: this.ctx.state.tableId,
              sessionId: client.sessionId,
              userId,
              action: parsed.data.action,
              amountCents: parsed.data.amountCents,
            },
            "POKER_ACTION_DUPLICATE_RETRY_IGNORED",
          );
          return;
        }

        this.ctx.logger.warn(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            sessionId: client.sessionId,
            code: err instanceof PokerError ? err.code : "ACTION_REJECTED",
            message: PokerRoomMessageRouter.asErrorLike(err).message,
          },
          "POKER_ACTION_REJECTED",
        );
        dealerRuntimeMetrics.recordActionRejected(err instanceof PokerError ? err.code : "ACTION_REJECTED");
        if (err instanceof PokerError) {
          room.sendTableMessageInternal(client, "ERROR", { code: err.code, message: err.message, ...(err.meta ?? {}) });
        } else {
          room.sendTableMessageInternal(client, "ERROR", { code: "ACTION_REJECTED", message: PokerRoomMessageRouter.asErrorLike(err).message });
        }
      }
    });

    room.onMessage("SET_SITTING_OUT", async (client: Client, message: unknown) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "SET_SITTING_OUT", payload: message });
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.type !== "SET_SITTING_OUT") {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid sit-out payload." });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Session is not bound to a seated user." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      try {
        this.assertHeroCanAct(userId);
        await this.ctx.dealer.setPlayerSittingOut(userId, parsed.data.payload.sittingOut);
        room.updateMetadataCountsInternal();
      } catch (err: unknown) {
        if (err instanceof PokerError) {
          room.sendTableMessageInternal(client, "ERROR", { code: err.code, message: err.message, ...(err.meta ?? {}) });
          return;
        }
        room.sendTableMessageInternal(client, "ERROR", { code: "SIT_OUT_TOGGLE_FAILED", message: PokerRoomMessageRouter.asErrorLike(err).message });
      }
    });

    room.onMessage("REJOIN", async (client: Client, message: unknown) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "REJOIN", payload: message });
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.type !== "REJOIN") {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid rejoin payload." });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "REJOIN_FAILED_NOT_SEATED", message: "Could not rejoin table. You are not seated." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      try {
        this.assertHeroCanAct(userId);
      } catch (err: unknown) {
        const e = PokerRoomMessageRouter.asErrorLike(err);
        room.sendTableMessageInternal(client, "ERROR", { code: e.code ?? "BAD_STATE", message: e.message });
        return;
      }
      await room.withTableLifecycleLockInternal(async () => {
      if (room.isDeletingInternal) {
        room.sendTableMessageInternal(client, "ERROR", { code: "REJOIN_FAILED_TABLE_GONE", message: "Table no longer exists" });
        return;
      }
      if (!this.ctx.dealer.hasPlayer(userId)) {
        room.sendTableMessageInternal(client, "ERROR", { code: "REJOIN_FAILED_NOT_SEATED", message: "Could not rejoin table. You are not seated." });
        return;
      }
      if (room.getPlayerStackCentsInternal(userId) <= 0) {
        room.sendTableMessageInternal(client, "ERROR", { code: "REJOIN_FAILED_OUT_OF_CHIPS", message: "Could not rejoin table. You are out of chips." });
        return;
      }
      try {
        await this.ctx.dealer.setPlayerSittingOut(userId, false);
        room.updateMetadataCountsInternal();
        await this.emitUserSnapshotOrError(client, userId, "RECONNECT");
      } catch (err: unknown) {
        this.ctx.logger.warn(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            code: err instanceof PokerError ? err.code : "REJOIN_FAILED_TEMPORARY",
            message: PokerRoomMessageRouter.asErrorLike(err).message,
          },
          "POKER_REJOIN_FAILED",
        );
        room.sendTableMessageInternal(client, "ERROR", { code: "REJOIN_FAILED_TEMPORARY", message: "Could not rejoin table. Please retry." });
      }
      });
    });

    room.onMessage("JOIN_TABLE", async (client: Client, message: unknown) => {
      const parsed = TableInboundMessageSchema.safeParse({ type: "JOIN_TABLE", payload: message });
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      if (parsed.data.type !== "JOIN_TABLE") {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", message: "Invalid join payload." });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Session is not bound to a user." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      try {
        this.assertHeroCanAct(userId);
      } catch (err: unknown) {
        const e = PokerRoomMessageRouter.asErrorLike(err);
        room.sendTableMessageInternal(client, "ERROR", { code: e.code ?? "BAD_STATE", message: e.message });
        return;
      }
      const buyInCents = parsed.data.payload.buyInCents;
      await room.withTableLifecycleLockInternal(async () => {
      if (room.isDeletingInternal) {
        room.sendTableMessageInternal(client, "ERROR", { code: "TABLE_GONE", message: "Table no longer exists" });
        return;
      }
      if (this.ctx.dealer.hasPlayer(userId)) {
        room.sendTableMessageInternal(client, "ERROR", { code: "ALREADY_SEATED", message: "You are already seated." });
        return;
      }

      const username =
        typeof client.auth?.username === "string" && client.auth.username.trim().length > 0
          ? client.auth.username
          : `player_${userId.slice(0, 6)}`;

      try {
        await this.ctx.dealer.addPlayer(userId, username, buyInCents);
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
        room.addTablePresenceInternal(client, userId, username);
        await this.emitUserSnapshotOrError(client, userId, "JOIN");
      } catch (err: unknown) {
        this.ctx.logger.warn(
          {
            roomId: room.roomId,
            tableId: this.ctx.state.tableId,
            userId,
            code: err instanceof PokerError ? err.code : "JOIN_FAILED",
            message: PokerRoomMessageRouter.asErrorLike(err).message,
          },
          "POKER_JOIN_TABLE_FAILED",
        );
        if (err instanceof PokerError) {
          room.sendTableMessageInternal(client, "ERROR", { code: err.code, message: err.message });
        } else {
          room.sendTableMessageInternal(client, "ERROR", { code: "JOIN_FAILED", message: PokerRoomMessageRouter.asErrorLike(err).message });
        }
      }
      });
    });
  }
}
