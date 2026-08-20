import { useEffect, useRef, useState } from "react";
import { SIDE_BET_CATALOG_BY_KEY } from "@poker-champ/realtime-contract";
import type { SideBetEntry } from "@/features/table/stores/table.store";
import { Toast } from "@/components/base/Toast";
import { formatCents } from "@/lib/format";

type SideBetStatusToastProps = {
  sideBets: Record<string, SideBetEntry>;
  heroUserId?: string;
};

type StatusEvent = { key: string; message: string; variant: "default" | "success" | "danger" };

/**
 * Announces the sent/accepted/declined/cancelled/expired transitions that the always-visible
 * ActiveSideBetsStrip communicates only implicitly (a declined or expired offer just silently
 * drops out of the strip — see docs/GIFTS_AND_SIDE_BETS_DESIGN.md UX walkthrough). Only ever
 * shown to whichever side wasn't the one that just acted (the recipient already knows they
 * clicked Accept/Decline; the initiator already knows they clicked cancel).
 */
export function SideBetStatusToast({ sideBets, heroUserId }: SideBetStatusToastProps) {
  // null (not {}) distinguishes "never observed" from "observed, empty" — the first effect run
  // after mount (or remount, e.g. a reconnect that recreates this component) only seeds the
  // baseline and fires nothing. Without that distinction, a bet that was already DECLINED/
  // EXPIRED/CANCELLED before mount looks identical to a fresh transition on first render (those
  // three branches below don't require a specific prior status, unlike "sent"/"accepted" which
  // explicitly check for PENDING) and would replay a stale toast on every reconnect.
  const lastStatusRef = useRef<Record<string, SideBetEntry["status"]> | null>(null);
  const [current, setCurrent] = useState<StatusEvent | null>(null);

  useEffect(() => {
    if (!heroUserId) return;
    const isFirstObservation = lastStatusRef.current === null;
    const prevMap = lastStatusRef.current ?? {};
    const nextMap: Record<string, SideBetEntry["status"]> = { ...prevMap };

    for (const bet of Object.values(sideBets)) {
      const isInitiator = bet.initiatorUserId === heroUserId;
      const isRecipient = bet.recipientUserId === heroUserId;
      if (!isInitiator && !isRecipient) continue;

      const prevStatus = prevMap[bet.interactionId];
      nextMap[bet.interactionId] = bet.status;
      if (isFirstObservation) continue;
      if (prevStatus === bet.status) continue;

      const label = SIDE_BET_CATALOG_BY_KEY.get(bet.catalogKey)?.label ?? "side bet";
      const counterpartyName = isInitiator ? bet.recipientName : bet.initiatorName;
      let event: StatusEvent | null = null;

      if (prevStatus === undefined && bet.status === "PENDING" && isInitiator) {
        event = {
          key: `${bet.interactionId}:sent`,
          message: `🎲 Side bet sent to ${counterpartyName ?? "them"} — waiting for response.`,
          variant: "default",
        };
      } else if (bet.status === "ACTIVE" && prevStatus === "PENDING" && isInitiator) {
        event = {
          key: `${bet.interactionId}:accepted`,
          message: `✅ ${counterpartyName ?? "They"} accepted your side bet — ${label} · ${formatCents(bet.stakeCents)}.`,
          variant: "success",
        };
      } else if (bet.status === "DECLINED" && isInitiator) {
        event = {
          key: `${bet.interactionId}:declined`,
          message: `❌ ${counterpartyName ?? "They"} declined your side bet — ${label}.`,
          variant: "danger",
        };
      } else if (bet.status === "EXPIRED" && isInitiator) {
        event = {
          key: `${bet.interactionId}:expired`,
          message: `⌛ Side bet expired — ${counterpartyName ?? "they"} didn't respond in time.`,
          variant: "default",
        };
      } else if (bet.status === "CANCELLED" && isRecipient) {
        event = {
          key: `${bet.interactionId}:cancelled`,
          message: `🚫 ${counterpartyName ?? "The initiator"} cancelled the side bet offer.`,
          variant: "default",
        };
      }

      if (event) setCurrent(event);
    }

    lastStatusRef.current = nextMap;
  }, [sideBets, heroUserId]);

  if (!current) return null;
  return <Toast key={current.key} message={current.message} variant={current.variant} onDismiss={() => setCurrent(null)} />;
}
