import { useMemo } from "react";
import { useVoiceChannelLifecycle } from "@/hooks/useVoiceChannelLifecycle";
import type { TableRealtimeRoom } from "@/features/table/realtime/useTableRealtime";

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

export function peerIdsFromSeats(seats: SeatLike[] | undefined, heroUserId: string | null | undefined): string[] {
  if (!seats || heroUserId == null) return [];
  return seats
    .filter((seat) => seat.occupied && !seat.isBot && seat.connected && seat.userId && seat.userId !== heroUserId)
    .map((seat) => String(seat.userId))
    .sort();
}

export function useVoiceControllerLifecycle({
  tableId,
  heroUserId,
  voiceRoom,
  seats,
  onLifecycleReset,
}: UseVoiceControllerLifecycleOptions) {
  const peerIds = useMemo(
    () => peerIdsFromSeats(seats, heroUserId ?? null),
    [seats, heroUserId],
  );

  return useVoiceChannelLifecycle({
    room: voiceRoom,
    channelId: tableId,
    selfUserId: heroUserId,
    peerIds,
    onLifecycleReset,
    leaveOnAppBackground: false,
    isRealtimeConnected: true,
  });
}

