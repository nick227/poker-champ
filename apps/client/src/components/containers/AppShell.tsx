import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/containers/AppChrome";
import { AppPageRoot } from "@/components/containers/AppPageRoot";
import { Toast } from "@/components/base/Toast";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { getSoundEventForToastVariant } from "@/sound/toastSoundEvent";
import { useToastStore } from "@/stores/toast.store";

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
    <AppPageRoot>
      <AppChrome>{children}</AppChrome>
      {toastMessage ? (
        <Toast message={toastMessage} variant={toastVariant} onDismiss={toastDismiss} />
      ) : null}
    </AppPageRoot>
  );
}
