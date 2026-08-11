import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { useToastStore } from "@/stores/toast.store";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { formatCountdownTo } from "@/lib/tournament.utils";

type RebuyCountdownProps = {
  rebuyWindowClosesAtTs: number | null | undefined;
  rebuysRemaining: number | undefined;
};

/** Ticking countdown to the rebuy window closing; fires a one-shot toast when it hits zero. */
export function RebuyCountdown({ rebuyWindowClosesAtTs, rebuysRemaining }: RebuyCountdownProps) {
  const [countdown, setCountdown] = useState<string | null>(formatCountdownTo(rebuyWindowClosesAtTs));
  const notifiedForRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rebuyWindowClosesAtTs) {
      setCountdown(null);
      return;
    }
    if (Date.now() >= rebuyWindowClosesAtTs) {
      // Already past close when this mounted (e.g. remount on reconnect) — don't fire a
      // duplicate/stale notification, just seed the guard.
      notifiedForRef.current = rebuyWindowClosesAtTs;
      setCountdown(formatCountdownTo(rebuyWindowClosesAtTs));
      return;
    }
    const tick = () => {
      setCountdown(formatCountdownTo(rebuyWindowClosesAtTs));
      if (Date.now() >= rebuyWindowClosesAtTs && notifiedForRef.current !== rebuyWindowClosesAtTs) {
        notifiedForRef.current = rebuyWindowClosesAtTs;
        useToastStore.getState().show("Rebuys closed.");
        emitSoundEvent("table.notificationBell");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [rebuyWindowClosesAtTs]);

  if (!countdown) return null;

  return (
    <View className="items-center">
      <Text variant="muted" className="text-center">
        Rebuy closes in {countdown}
        {typeof rebuysRemaining === "number" ? ` · ${rebuysRemaining} rebuy${rebuysRemaining === 1 ? "" : "s"} left` : ""}
      </Text>
    </View>
  );
}
