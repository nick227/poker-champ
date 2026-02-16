import { View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { Toast } from "@/components/base/Toast";
import { getRealtimeTransportMode } from "@/registry/transport.registry";
import { useToastStore } from "@/stores/toast.store";

export function AppShell({ children }: { children: ReactNode }) {
  const transport = getRealtimeTransportMode();
  const showWsDevBadge = transport === "ws";
  const toastMessage = useToastStore((s) => s.message);
  const toastVariant = useToastStore((s) => s.variant);
  const toastDismiss = useToastStore((s) => s.dismiss);

  return (
    <View className="flex-1 bg-bg min-h-full">
      {children}
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
