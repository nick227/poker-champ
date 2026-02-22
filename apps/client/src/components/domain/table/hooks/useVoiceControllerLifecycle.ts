import { useEffect, useRef } from "react";
import { createVoiceController } from "@/voice/client/create-voice-controller";
import { ColyseusVoiceAdapter } from "@/voice/adapters/ColyseusVoiceAdapter";
import type { TableRealtimeRoom } from "@/realtime/useTableRealtime";

type SeatLike = {
  occupied?: boolean;
  isBot?: boolean;
  connected?: boolean;
  userId?: unknown;
};

type UseVoiceControllerLifecycleOptions = {
  tableId: string;
  heroUserId?: string | null;
  voiceRoom: TableRealtimeRoom | null;
  seats?: SeatLike[];
  onLifecycleReset?: () => void;
};

export function useVoiceControllerLifecycle({
  tableId,
  heroUserId,
  voiceRoom,
  seats,
  onLifecycleReset,
}: UseVoiceControllerLifecycleOptions) {
  const controllerRef = useRef<ReturnType<typeof createVoiceController> | null>(null);

  useEffect(() => {
    if (!voiceRoom || !heroUserId) return;
    const adapter = new ColyseusVoiceAdapter(voiceRoom);
    const controller = createVoiceController({
      adapter,
      selfId: heroUserId,
      channelId: tableId,
    });
    controllerRef.current = controller;
    onLifecycleReset?.();

    return () => {
      const current = controllerRef.current;
      controllerRef.current = null;
      onLifecycleReset?.();
      if (current) void current.leave();
    };
  }, [voiceRoom, heroUserId, tableId, onLifecycleReset]);

  useEffect(() => {
    if (!seats || !heroUserId || !controllerRef.current) return;
    const peerIds = seats
      .filter((seat) => seat.occupied && !seat.isBot && seat.connected && seat.userId && seat.userId !== heroUserId)
      .map((seat) => String(seat.userId))
      .sort();
    controllerRef.current.setPeers(peerIds);
  }, [seats, heroUserId]);

  return { controllerRef };
}
