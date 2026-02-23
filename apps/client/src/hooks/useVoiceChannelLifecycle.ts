import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { createVoiceController } from "@/voice/client/create-voice-controller";
import { ColyseusVoiceAdapter } from "@/voice/adapters/ColyseusVoiceAdapter";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";

export type UseVoiceChannelLifecycleOptions = {
  room: TableRealtimeRoom | null;
  channelId: string;
  selfUserId: string | null | undefined;
  peerIds: string[];
  /** When false, controller is not created (lobby: save resources when not in voice). Default true. */
  enabled?: boolean;
  onLifecycleReset?: () => void;
  onLeave?: () => void;
  leaveOnAppBackground?: boolean;
  isRealtimeConnected?: boolean;
};

/**
 * Lifecycle only: controller creation, teardown, setPeers.
 * Does NOT call join() — join/leave is handled by useVoiceJoinPolicy (or equivalent).
 */
export function useVoiceChannelLifecycle({
  room,
  channelId,
  selfUserId,
  peerIds,
  enabled = true,
  onLifecycleReset,
  onLeave,
  leaveOnAppBackground = false,
  isRealtimeConnected = true,
}: UseVoiceChannelLifecycleOptions) {
  const controllerRef = useRef<ReturnType<typeof createVoiceController> | null>(null);

  useEffect(() => {
    if (!room || !selfUserId) return;
    const adapter = new ColyseusVoiceAdapter(room, { allowedChannelId: channelId });
    const controller = createVoiceController({
      adapter,
      selfId: selfUserId,
      channelId,
    });
    controllerRef.current = controller;
    onLifecycleReset?.();

    return () => {
      const current = controllerRef.current;
      controllerRef.current = null;
      onLifecycleReset?.();
      onLeave?.();
      if (current) current.dispose();
    };
  }, [room, selfUserId, channelId, onLifecycleReset, onLeave]);

  useEffect(() => {
    const current = controllerRef.current;
    if (!current) return;
    current.setPeers(enabled ? peerIds : []);
  }, [enabled, peerIds]);

  useEffect(() => {
    if (!leaveOnAppBackground) return;
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState !== "active") {
        const current = controllerRef.current;
        if (current?.isEnabled()) {
          onLeave?.();
          current.dispose();
        }
      }
    });
    return () => subscription.remove();
  }, [leaveOnAppBackground, onLeave]);

  useEffect(() => {
    if (isRealtimeConnected) return;
    const current = controllerRef.current;
    controllerRef.current = null;
    onLifecycleReset?.();
    onLeave?.();
    if (current) current.dispose();
  }, [isRealtimeConnected, onLifecycleReset, onLeave]);

  return { controllerRef };
}
