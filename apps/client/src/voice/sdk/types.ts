import type { VoiceSignalMessage } from "../contracts/voice-signals";

export interface VoiceSignalingAdapter {
  send(msg: VoiceSignalMessage): void;
  onMessage(cb: (msg: VoiceSignalMessage) => void): void;
}
