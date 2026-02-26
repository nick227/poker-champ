import type { VoiceSignalingAdapter } from "../sdk/types";
import type { VoiceSignalMessage } from "../contracts/voice-signals";
import { VOICE_SIGNAL_TYPE } from "../contracts/voice-signals";

type RoomLike = {
  send: (type: string, payload: unknown) => void;
  onMessage: (type: string, cb: (payload: unknown) => void) => void;
};

export type ColyseusVoiceAdapterOptions = {
  /** If set, only messages with this channelId are sent. Enforces client-side channel isolation. */
  allowedChannelId?: string;
};

/**
 * ColyseusVoiceAdapter
 * - Thin wrapper around room.send / room.onMessage
 * - When allowedChannelId is set: refuses to send VOICE_SIGNAL if msg.channelId !== allowedChannelId.
 *   Lobby: allowedChannelId = "lobby". Table: allowedChannelId = tableId (rejects "lobby").
 */
export class ColyseusVoiceAdapter implements VoiceSignalingAdapter {
  private warnedInvalidRoom = false;

  constructor(
    private readonly room: RoomLike,
    private readonly options: ColyseusVoiceAdapterOptions = {},
  ) {}

  private hasValidRoomMethods(): boolean {
    const candidate = this.room as unknown as { send?: unknown; onMessage?: unknown };
    const ok = typeof candidate.send === "function" && typeof candidate.onMessage === "function";
    if (!ok && !this.warnedInvalidRoom) {
      this.warnedInvalidRoom = true;
      console.warn("[VoiceAdapter] Invalid room passed to ColyseusVoiceAdapter", {
        hasSend: typeof candidate.send === "function",
        hasOnMessage: typeof candidate.onMessage === "function",
      });
    }
    return ok;
  }

  send(msg: VoiceSignalMessage): void {
    if (!this.hasValidRoomMethods()) return;
    const { allowedChannelId } = this.options;
    if (allowedChannelId != null && msg.channelId !== allowedChannelId) return;
    let size: number;
    try {
      size = JSON.stringify(msg).length;
    } catch {
      return;
    }
    if (size > 32_000) return;
    this.room.send(VOICE_SIGNAL_TYPE, msg);
  }

  onMessage(cb: (msg: VoiceSignalMessage) => void): void {
    if (!this.hasValidRoomMethods()) return;
    this.room.onMessage(VOICE_SIGNAL_TYPE, (msg: any) => cb(msg as VoiceSignalMessage));
  }
}
