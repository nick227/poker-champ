import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { Toast } from "@/components/base/Toast";
import { getRealtimeTransportMode } from "@/registry/transport.registry";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { getSoundEventForToastVariant } from "@/sound/toastSoundEvent";
import { useToastStore } from "@/stores/toast.store";
import { useE2EConnectionCountStore } from "@/stores/e2eConnectionCount.store";

export function AppShell({ children }: { children: ReactNode }) {
  const transport = getRealtimeTransportMode();
  const showWsDevBadge = transport === "ws";
  const toastMessage = useToastStore((s) => s.message);
  const toastVariant = useToastStore((s) => s.variant);
  const toastDismiss = useToastStore((s) => s.dismiss);
  const tableConnectionCount = useE2EConnectionCountStore((s) => s.tableConnectionCount);
  const lastToastSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!toastMessage) {
      lastToastSignatureRef.current = null;
      return;
    }
    const signature = `${toastVariant}:${toastMessage}`;
    if (lastToastSignatureRef.current === signature) return;
    emitSoundEvent(getSoundEventForToastVariant(toastVariant));
    lastToastSignatureRef.current = signature;
  }, [toastMessage, toastVariant]);

  return (
    <View className="flex-1 bg-bg min-h-full" style={{ backgroundColor: "#0d0d0d" }}>
      {children}
      {process.env.NODE_ENV !== "production" ? (
        <View
          aria-hidden
          style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
          data-e2e-connection-count={String(tableConnectionCount)}
        />
      ) : null}
      {toastMessage ? (
        <Toast message={toastMessage} variant={toastVariant} onDismiss={toastDismiss} />
      ) : null}
      {showWsDevBadge ? (
        <View className="absolute right-2 top-2 ui-surface px-2 py-1 opacity-80">
          <Text variant="muted">DEV TRANSPORT: WS</Text>
        </View>
      ) : null}
    </View>
  );
}
