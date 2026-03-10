import type { Client } from "@colyseus/core";
import { VOICE_SIGNAL_TYPE } from "../../voice/contracts/voice-signals.js";
import { parseVoiceSignalMessage } from "./voice-signal-schema.js";
import { getClientUserId } from "./voice-client-identity.js";
import { shouldAllowVoiceRelay } from "./voice-feature-flag.js";
import { createVoiceRateLimiter } from "./voice-rate-limit.js";
import { getMessageByteSize } from "./voice-size-guard.js";
import { logger } from "../../lib/logger.js";

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
type VoiceRelayRoom = {
  roomId: string;
  state?: { tableId?: string };
  clients: Client[];
  onMessage(type: string | number, callback: (client: Client, raw: unknown) => void): void;
};

export function registerVoiceRelay(room: VoiceRelayRoom) {
  const limiter = createVoiceRateLimiter();

  room.onMessage(VOICE_SIGNAL_TYPE, (client: Client, raw: unknown) => {
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
    const roomChannel = room.state?.tableId ?? room.roomId;
    if (msg.channelId !== roomChannel) {
      logger.warn({ roomChannel, msgChannel: msg.channelId }, "VOICE_SIGNAL dropped (wrong channel)");
      return;
    }

    // Targeted forward
    const recipient = room.clients.find((c: Client) => getClientUserId(c) === msg.toUserId);
    if (!recipient) return;

    recipient.send(VOICE_SIGNAL_TYPE, msg);
  });
}
