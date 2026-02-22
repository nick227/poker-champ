import type { VoiceSignalingAdapter } from "../sdk/types";
import type { VoiceSignalMessage } from "../contracts/voice-signals";
import { VOICE_SIGNAL_TYPE } from "../contracts/voice-signals";

type RoomLike = {
  send: (type: string, payload: unknown) => void;
  onMessage: (type: string, cb: (payload: unknown) => void) => void;
};

/**
 * ColyseusVoiceAdapter
 * - Thin wrapper around room.send / room.onMessage
 * - Keeps VoiceSDK independent of Colyseus.
 */
export class ColyseusVoiceAdapter implements VoiceSignalingAdapter {
  constructor(private readonly room: RoomLike) {}

  send(msg: VoiceSignalMessage): void {
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
    this.room.onMessage(VOICE_SIGNAL_TYPE, (msg: any) => cb(msg as VoiceSignalMessage));
  }
}
