import { VoiceSDK } from "../sdk/VoiceSDK";
import { ColyseusVoiceAdapter } from "../adapters/ColyseusVoiceAdapter";
import type { VoiceSignalingAdapter } from "../sdk/types";

/**
 * create -> voice controller
 * Small helper to make app usage declarative.
 */
export function createVoiceController(params: {
  room?: any; // colyseus.js Room
  adapter?: VoiceSignalingAdapter;
  selfId?: string;
  selfUserId?: string;
  channelId: string; // tableId/gameId
}) {
  const adapter = params.adapter ?? (params.room ? new ColyseusVoiceAdapter(params.room) : null);
  if (!adapter) throw new Error("createVoiceController: adapter or room is required");

  const selfUserId = params.selfId ?? params.selfUserId;
  if (!selfUserId) throw new Error("createVoiceController: selfId/selfUserId is required");

  const sdk = new VoiceSDK({
    adapter: adapter,
    selfUserId,
    channelId: params.channelId,
  });
  let enabled = false;
  let muted = false;
  let speaking = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  sdk.setOnSpeakingChanged((nextSpeaking) => {
    if (speaking === nextSpeaking) return;
    speaking = nextSpeaking;
    notify();
  });

  const join = async () => {
    await sdk.joinChannel();
    enabled = true;
    notify();
  };

  const leave = async () => {
    await sdk.leaveChannel();
    enabled = false;
    speaking = false;
    notify();
  };

  const dispose = () => {
    sdk.dispose();
    enabled = false;
    speaking = false;
    notify();
  };

  const toggleEnabled = async (): Promise<boolean> => {
    if (enabled) {
      await leave();
      return false;
    }
    await join();
    return true;
  };

  const setMuted = (nextMuted: boolean) => {
    muted = nextMuted;
    sdk.setMuted(nextMuted);
    notify();
  };

  const toggleMute = (): boolean => {
    setMuted(!muted);
    return muted;
  };

  return {
    sdk,
    joinChannel: join,
    leaveChannel: leave,
    join,
    leave,
    dispose,
    setMuted,
    toggleEnabled,
    toggleMute,
    isEnabled: () => enabled,
    isMuted: () => muted,
    isSpeaking: () => speaking,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setPeers: (peerIds: string[]) => sdk.setPeers(peerIds),
    setChannel: (channelId: string) => sdk.setChannel(channelId),
  };
}
