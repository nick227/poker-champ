import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AppChrome } from "@/components/containers/AppChrome";
import { AppPageRoot } from "@/components/containers/AppPageRoot";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { Toast } from "@/components/base/Toast";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { getSoundEventForToastVariant } from "@/sound/toastSoundEvent";
import { useAwardsToastStore } from "@/stores/awardsToast.store";
import { useToastStore } from "@/stores/toast.store";

export function AppShell({ children }: { children: ReactNode }) {
  const toastMessage = useToastStore((s) => s.message);
  const toastVariant = useToastStore((s) => s.variant);
  const toastDismiss = useToastStore((s) => s.dismiss);
  const awardAwards = useAwardsToastStore((s) => s.awards);
  const awardDismiss = useAwardsToastStore((s) => s.dismiss);
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
      {awardAwards.length > 0 ? (
        <AwardToaster awards={awardAwards} onDismiss={awardDismiss} />
      ) : null}
    </AppPageRoot>
  );
}
