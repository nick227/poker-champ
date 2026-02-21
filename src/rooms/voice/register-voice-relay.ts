import type { Room } from "@colyseus/core";
import { VOICE_SIGNAL_TYPE } from "../../voice/contracts/voice-signals";
import { parseVoiceSignalMessage } from "./voice-signal-schema";
import { getClientUserId } from "./voice-client-identity";
import { shouldAllowVoiceRelay } from "./voice-feature-flag";
import { createVoiceRateLimiter } from "./voice-rate-limit";
import { getMessageByteSize } from "./voice-size-guard";
import { logger } from "../../lib/logger";

/**
 * register -> voice relay
 * Adds a message handler to the PokerRoom to forward VOICE signals:
 * - validate
 * - rate-limit
 * - size limit
 * - targeted forward to recipient only
 *
 * This MUST stay lightweight for free Railway servers.
 */
export function registerVoiceRelay(room: Room) {
  const limiter = createVoiceRateLimiter();

  room.onMessage(VOICE_SIGNAL_TYPE, (client: any, raw: any) => {
    if (!shouldAllowVoiceRelay()) return;

    const size = getMessageByteSize(raw);
    if (size > 32_000) {
      logger.warn({ size }, "VOICE_SIGNAL dropped (too large)");
      return;
    }

    const userId = getClientUserId(client);
    if (!userId) return;

    if (!limiter.allow(client.sessionId)) {
      logger.warn({ sessionId: client.sessionId }, "VOICE_SIGNAL dropped (rate limited)");
      return;
    }

    const msg = parseVoiceSignalMessage(raw);
    if (!msg) return;

    // Basic anti-spoof: enforce fromUserId matches this client userId.
    if (msg.fromUserId !== userId) {
      logger.warn({ userId, fromUserId: msg.fromUserId }, "VOICE_SIGNAL dropped (spoof)");
      return;
    }

    if (msg.toUserId === msg.fromUserId) {
      logger.warn({ userId, toUserId: msg.toUserId }, "VOICE_SIGNAL dropped (self-loop)");
      return;
    }

    // Channel policy: default uses roomId as channel, but we keep it flexible.
    // In poker-champ, channelId should be tableId.
    const roomChannel = (room as any).state?.tableId ?? (room as any).roomId;
    if (msg.channelId !== roomChannel) {
      logger.warn({ roomChannel, msgChannel: msg.channelId }, "VOICE_SIGNAL dropped (wrong channel)");
      return;
    }

    // Targeted forward
    const recipient = room.clients.find((c: any) => getClientUserId(c) === msg.toUserId);
    if (!recipient) return;

    recipient.send(VOICE_SIGNAL_TYPE, msg);
  });
}
