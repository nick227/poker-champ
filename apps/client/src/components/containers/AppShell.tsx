import { View } from "react-native";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ApplyAppBackground } from "@/components/containers/ApplyAppBackground";
import { Text } from "@/components/base/Text";
import { Toast } from "@/components/base/Toast";
import { getRealtimeTransportMode } from "@/registry/transport.registry";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { getSoundEventForToastVariant } from "@/sound/toastSoundEvent";
import { useToastStore } from "@/stores/toast.store";
import { useE2EConnectionCountStore } from "@/stores/e2eConnectionCount.store";

export function AppShell({ children }: { children: ReactNode }) {
  const toastMessage = useToastStore((s) => s.message);
  const toastVariant = useToastStore((s) => s.variant);
  const toastDismiss = useToastStore((s) => s.dismiss);
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
    <ApplyAppBackground>
      <View className="main-wrapper flex-1 min-h-full w-full bg-red-500">
        {children}
      {toastMessage ? (
        <Toast message={toastMessage} variant={toastVariant} onDismiss={toastDismiss} />
      ) : null}
      </View>
    </ApplyAppBackground>
  );
}
