import { useEffect, useRef } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

function getSeatedHumanUserIds(snapshot: TableSnapshotPayload): Set<string> {
  const ids = new Set<string>();
  for (const seat of snapshot.seats) {
    if (seat.occupied && !seat.isBot && seat.userId) ids.add(seat.userId);
  }
  return ids;
}

export function usePlayerJoinedSound(snapshot: TableSnapshotPayload | undefined): void {
  const prevHumanIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!snapshot?.seats?.length) return;
    const current = getSeatedHumanUserIds(snapshot);
    const prev = prevHumanIdsRef.current;
    prevHumanIdsRef.current = current;
    if (prev === null) return;
    for (const id of current) {
      if (!prev.has(id)) {
        emitSoundEvent("table.playerJoined");
        break;
      }
    }
  }, [snapshot]);
}
