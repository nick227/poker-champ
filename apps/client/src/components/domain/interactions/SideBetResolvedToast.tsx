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
  // The evaluator's note refers to bet subjects positionally ("First subject", "Second
  // subject") since it has no access to display names — swap in the actual names captured
  // on the original offer so the reason reads naturally instead of "First subject won."
  const note = current.subjectNames
    ? current.resolutionNote
        ?.replace("First subject", current.subjectNames[0])
        .replace("Second subject", current.subjectNames[1])
    : current.resolutionNote;

  let message: string;
  if (current.status === "VOIDED") {
    message = `🎲 ${label} voided — ${note ?? "no result."}`;
  } else if (heroUserId && current.winnerId === heroUserId) {
    message = `🎲 You won ${formatCents(current.payoutCents ?? 0)} — ${label}${note ? `. ${note}` : ""}`;
  } else if (heroUserId && (current.initiatorUserId === heroUserId || current.recipientUserId === heroUserId)) {
    message = `🎲 You lost ${formatCents(current.payoutCents ?? 0)} — ${label}${note ? `. ${note}` : ""}`;
  } else {
    message = `🎲 ${label} resolved${note ? `. ${note}` : ""}`;
  }

  return <Toast message={message} variant={current.status === "VOIDED" ? "default" : "success"} onDismiss={() => setCurrent(null)} />;
}
