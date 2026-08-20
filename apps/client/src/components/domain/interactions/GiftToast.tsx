import { useEffect, useRef, useState } from "react";
import type { GiftReceivedPayload } from "@poker-champ/realtime-contract";
import { GIFT_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import { Toast } from "@/components/base/Toast";

type GiftToastProps = {
  gifts: GiftReceivedPayload[];
};

export function GiftToast({ gifts }: GiftToastProps) {
  const [current, setCurrent] = useState<GiftReceivedPayload | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latest = gifts[gifts.length - 1];
    if (!latest || latest.interactionId === lastSeenIdRef.current) return;
    lastSeenIdRef.current = latest.interactionId;
    setCurrent(latest);
  }, [gifts]);

  if (!current) return null;

  const entry = GIFT_CATALOG_BY_KEY.get(current.catalogKey);
  const message = `${entry?.emoji ?? "🎁"} ${current.senderName} sent ${current.recipientName} ${entry?.label ?? "a gift"}!`;

  return <Toast message={message} variant="success" onDismiss={() => setCurrent(null)} />;
}
