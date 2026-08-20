import { nanoid } from "nanoid";
import type { Client } from "@colyseus/core";
import {
  AddBotPayloadSchema,
  ChatPayloadSchema,
  RemoveBotPayloadSchema,
  SendGiftPayloadSchema,
  ProposeSideBetPayloadSchema,
  RespondSideBetPayloadSchema,
  CancelSideBetPayloadSchema,
  SIDE_BET_CATALOG_BY_KEY,
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
  DAILY_PAIR_CAP_EXCEEDED,
  SIDE_BET_CATALOG_KEY_UNKNOWN,
  SIDE_BET_RECIPIENT_INVALID,
  SIDE_BET_STAKE_OUT_OF_BOUNDS,
  SIDE_BET_SUBJECTS_REQUIRED,
  SIDE_BET_SUBJECTS_INVALID,
  SIDE_BET_PREDICTION_REQUIRED,
  SIDE_BET_PREDICTION_INVALID,
  SIDE_BET_NO_ACTIVE_HAND,
  SIDE_BET_NOT_FOUND,
  SIDE_BET_NOT_INITIATOR,
  SIDE_BET_NOT_RECIPIENT,
  PlayerInteractionService,
} from "../../engine/economy/PlayerInteractionService.js";
import { ensureCashTableBotUser } from "../../engine/economy/botInteractionUsers.js";
import { logger } from "../../lib/logger.js";
import type { PokerRoomSessionManager } from "./PokerRoomSessionManager.js";
import type { PokerRoomContext, PokerRoomMessageRouterContract } from "./types/PokerRoomTypes.js";
import { assertNotTournamentTableSpectator } from "../../tournaments/tournament-table-spectator.js";

export class PokerRoomMessageRouter implements PokerRoomMessageRouterContract {
  constructor(
    private readonly ctx: PokerRoomContext,
    private readonly session: PokerRoomSessionManager,
  ) {}

  /** True if this seated user is currently dealt into the hand in progress (has cards live,
   *  win or fold). Used to enforce "no own-hand side bets" (docs/GIFTS_AND_SIDE_BETS_DESIGN.md
   *  §9/§10) — the router owns this check because it needs live game state, which
   *  PlayerInteractionService (DB-only) doesn't have access to. */
  private isDealtIntoCurrentHand(userId: string): boolean {
    const player = this.ctx.state.playersById.get(userId);
    return !!player && (player.status === "ACTIVE" || player.status === "FOLDED" || player.status === "ALL_IN");
  }

  /** Shared by the real RESPOND_SIDE_BET handler and the bot auto-response trigger below —
   *  same CAS-guarded respondSideBet call, same SIDE_BET_UPDATE broadcast to both sides. */
  private async respondSideBetAndBroadcast(params: {
    interactionId: string;
    recipientId: string;
    accept: boolean;
    clientRequestId: string;
  }): Promise<void> {
    const result = await PlayerInteractionService.respondSideBet({
      interactionId: params.interactionId,
      recipientId: params.recipientId,
      accept: params.accept,
      bigBlindCents: this.ctx.state.bigBlindCents,
      clientRequestId: params.clientRequestId,
      validateSubjectsStillDealtIn: ([a, b]) => this.isDealtIntoCurrentHand(a) && this.isDealtIntoCurrentHand(b),
    });
    const payload = { interactionId: result.interactionId, status: result.status };
    this.sendToUserId(result.initiatorId, "SIDE_BET_UPDATE", payload);
    this.sendToUserId(result.recipientId, "SIDE_BET_UPDATE", payload);
  }

  /** A bot recipient can't click Accept/Decline — respond immediately through the exact
   *  same path (respondSideBetAndBroadcast) a real response would use, with a simple
   *  coin-flip decision. Not meant to be a "smart" bot, just unblock the flow. */
  private async triggerBotSideBetResponse(interactionId: string, botId: string): Promise<void> {
    const accept = Math.random() < 0.5;
    await this.respondSideBetAndBroadcast({
      interactionId,
      recipientId: botId,
      accept,
      clientRequestId: `bot_auto_${nanoid(12)}`,
    });
  }

  private sendToUserId(userId: string, type: string, payload: unknown): void {
    const room = this.ctx.room;
    for (const c of room.clients) {
      if (this.session.getUserIdForSession(c.sessionId) === userId) {
        room.sendTableMessageInternal(c, type, payload);
      }
    }
  }

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
      if (!recipient) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: GIFT_RECIPIENT_INVALID,
          message: "Recipient must be seated at this table.",
        });
        return;
      }

      try {
        if (recipient.kind === "BOT") {
          await ensureCashTableBotUser(recipient.id, recipient.name);
        }
        const result = await PlayerInteractionService.sendGift({
          initiatorId: userId,
          recipientId: recipientUserId,
          tableId: this.ctx.state.tableId,
          catalogKey,
          bigBlindCents: this.ctx.state.bigBlindCents,
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
          message === "INSUFFICIENT_BANKROLL" ||
          message === GIFT_CATALOG_KEY_UNKNOWN ||
          message === GIFT_RECIPIENT_INVALID ||
          message === DAILY_PAIR_CAP_EXCEEDED
            ? message
            : "SEND_GIFT_FAILED";
        room.sendTableMessageInternal(client, "ERROR", { code, message });
      }
    });

    const sideBetErrorCodes = new Set<string>([
      "INSUFFICIENT_BANKROLL",
      DAILY_PAIR_CAP_EXCEEDED,
      SIDE_BET_CATALOG_KEY_UNKNOWN,
      SIDE_BET_RECIPIENT_INVALID,
      SIDE_BET_STAKE_OUT_OF_BOUNDS,
      SIDE_BET_SUBJECTS_REQUIRED,
      SIDE_BET_SUBJECTS_INVALID,
      SIDE_BET_PREDICTION_REQUIRED,
      SIDE_BET_PREDICTION_INVALID,
      SIDE_BET_NO_ACTIVE_HAND,
      SIDE_BET_NOT_FOUND,
      SIDE_BET_NOT_INITIATOR,
      SIDE_BET_NOT_RECIPIENT,
    ]);

    room.onMessage("PROPOSE_SIDE_BET", async (client: Client, message: unknown) => {
      if (room.isChatRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many side bet offers. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      room.touchActivityInternal();
      const parsed = ProposeSideBetPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to propose a side bet." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;
      const initiator = room.getPlayerByUserIdInternal(userId);
      if (!initiator || initiator.kind === "BOT") {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to propose a side bet." });
        return;
      }

      const { recipientUserId, catalogKey, stakeCents, subjectUserIds, predictedSubjectUserId, clientRequestId } = parsed.data;
      if (recipientUserId === userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: SIDE_BET_RECIPIENT_INVALID, message: "You cannot propose a side bet to yourself." });
        return;
      }
      const recipient = room.getPlayerByUserIdInternal(recipientUserId);
      if (!recipient) {
        room.sendTableMessageInternal(client, "ERROR", { code: SIDE_BET_RECIPIENT_INVALID, message: "Recipient must be seated at this table." });
        return;
      }

      const handId = this.ctx.state.handId;
      if (!handId || this.ctx.state.street === "WAITING") {
        room.sendTableMessageInternal(client, "ERROR", { code: SIDE_BET_NO_ACTIVE_HAND, message: "No hand in progress to bet on." });
        return;
      }

      const entry = SIDE_BET_CATALOG_BY_KEY.get(catalogKey);
      if (entry?.requiresSubjects) {
        if (!subjectUserIds || !this.isDealtIntoCurrentHand(subjectUserIds[0]) || !this.isDealtIntoCurrentHand(subjectUserIds[1])) {
          room.sendTableMessageInternal(client, "ERROR", {
            code: SIDE_BET_SUBJECTS_INVALID,
            message: "Both subjects must be currently dealt into the hand.",
          });
          return;
        }
      }

      try {
        if (recipient.kind === "BOT") {
          await ensureCashTableBotUser(recipient.id, recipient.name);
        }
        const result = await PlayerInteractionService.proposeSideBet({
          initiatorId: userId,
          recipientId: recipientUserId,
          tableId: this.ctx.state.tableId,
          handId,
          catalogKey,
          stakeCents,
          bigBlindCents: this.ctx.state.bigBlindCents,
          subjectUserIds,
          predictedSubjectUserId,
          clientRequestId,
        });
        const subjectNames = subjectUserIds
          ? ([
              room.getPlayerByUserIdInternal(subjectUserIds[0])?.name ?? "player",
              room.getPlayerByUserIdInternal(subjectUserIds[1])?.name ?? "player",
            ] as [string, string])
          : undefined;
        const payload = {
          ...result,
          initiatorName: initiator.name || `player_${userId.slice(0, 6)}`,
          subjectNames,
        };
        this.sendToUserId(userId, "SIDE_BET_OFFER", payload);
        this.sendToUserId(recipientUserId, "SIDE_BET_OFFER", payload);

        // Bots can't click Accept/Decline — respond immediately through the exact same
        // path a real RESPOND_SIDE_BET would use (same CAS guard, same re-validation).
        // A failure here (e.g. the bot's bankroll can't cover its exposure) must not break
        // the propose flow — the offer just sits PENDING and gets caught by the 30s TTL sweep,
        // same as any other unresolved offer.
        if (recipient.kind === "BOT") {
          this.triggerBotSideBetResponse(result.interactionId, recipient.id).catch((err: unknown) => {
            logger.error({ err, interactionId: result.interactionId, botId: recipient.id }, "BOT_SIDE_BET_AUTO_RESPONSE_FAILED");
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = sideBetErrorCodes.has(message) ? message : "PROPOSE_SIDE_BET_FAILED";
        room.sendTableMessageInternal(client, "ERROR", { code, message });
      }
    });

    room.onMessage("RESPOND_SIDE_BET", async (client: Client, message: unknown) => {
      if (room.isChatRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many side bet responses. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      room.touchActivityInternal();
      const parsed = RespondSideBetPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to respond to a side bet." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;

      const { interactionId, accept, clientRequestId } = parsed.data;
      try {
        await this.respondSideBetAndBroadcast({ interactionId, recipientId: userId, accept, clientRequestId });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = sideBetErrorCodes.has(message) ? message : "RESPOND_SIDE_BET_FAILED";
        room.sendTableMessageInternal(client, "ERROR", { code, message });
      }
    });

    room.onMessage("CANCEL_SIDE_BET", async (client: Client, message: unknown) => {
      if (room.isChatRateLimitedInternal(client.sessionId)) {
        room.sendTableMessageInternal(client, "ERROR", {
          code: "RATE_LIMITED",
          message: "Too many requests. Slow down.",
          retryAfterSeconds: 2,
        });
        return;
      }
      room.touchActivityInternal();
      const parsed = CancelSideBetPayloadSchema.safeParse(message);
      if (!parsed.success) {
        room.sendTableMessageInternal(client, "ERROR", { code: "BAD_MESSAGE", details: parsed.error.flatten() });
        return;
      }
      const userId = this.session.getUserIdForSession(client.sessionId);
      if (!userId) {
        room.sendTableMessageInternal(client, "ERROR", { code: "UNAUTHORIZED", message: "Must be seated to cancel a side bet." });
        return;
      }
      if (!this.session.isActiveBoundClient(userId, client)) return;

      const { interactionId, clientRequestId } = parsed.data;
      try {
        const result = await PlayerInteractionService.cancelSideBet({ interactionId, initiatorId: userId, clientRequestId });
        const payload = { interactionId: result.interactionId, status: result.status };
        this.sendToUserId(result.initiatorId, "SIDE_BET_UPDATE", payload);
        this.sendToUserId(result.recipientId, "SIDE_BET_UPDATE", payload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code = sideBetErrorCodes.has(message) ? message : "CANCEL_SIDE_BET_FAILED";
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
