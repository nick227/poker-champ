import { useEffect, useRef, useState } from "react";
import { SIDE_BET_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import type { SideBetEntry } from "@/features/table/stores/table.store";
import { Toast } from "@/components/base/Toast";
import { formatCents } from "@/lib/format";

type SideBetResolvedToastProps = {
  sideBets: Record<string, SideBetEntry>;
  heroUserId?: string;
};

export function SideBetResolvedToast({ sideBets, heroUserId }: SideBetResolvedToastProps) {
  const resolved = Object.values(sideBets).filter((b) => b.status === "COMPLETED" || b.status === "VOIDED");
  const [current, setCurrent] = useState<SideBetEntry | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latest = resolved[resolved.length - 1];
    if (!latest || latest.interactionId === lastSeenIdRef.current) return;
    lastSeenIdRef.current = latest.interactionId;
    setCurrent(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the resolved set itself changes
  }, [resolved.length]);

  if (!current) return null;

  const entry = SIDE_BET_CATALOG_BY_KEY.get(current.catalogKey);
  const label = entry?.label ?? "side bet";

  let message: string;
  if (current.status === "VOIDED") {
    message = `🎲 ${label} voided — ${current.resolutionNote ?? "no result."}`;
  } else if (heroUserId && current.winnerId === heroUserId) {
    message = `🎲 You won the ${label}! +${formatCents(current.payoutCents ?? 0)}`;
  } else if (heroUserId && (current.initiatorUserId === heroUserId || current.recipientUserId === heroUserId)) {
    message = `🎲 You lost the ${label}. -${formatCents(current.payoutCents ?? 0)}`;
  } else {
    message = `🎲 ${label} resolved.`;
  }

  return <Toast message={message} variant={current.status === "VOIDED" ? "default" : "success"} onDismiss={() => setCurrent(null)} />;
}
