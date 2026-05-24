/**
 * Owns all textual status: game messages (hand, action, result, waiting) or statusMessage (connecting/error).
 * No other component should show "Connecting", "Error", "Waiting" etc. See TABLE_SCENE_VIEWS_OVERVIEW.md.
 */
import { useEffect, useState } from "react";
import { Text } from "@/components/base/Text";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import { TABLE } from "@/constants/copy";
import type { HandResultMessage } from "./table.types";
import { Surface } from "@/components/containers/Surface";
import { buildWinnerMessageText } from "./displayMessages";

type Hand = { street: string; potCents: number };

const NEXT_DEAL_TICK_MS = 250;

function deriveMessage(
  hand: Hand | undefined,
  actionMessage: string | undefined,
  handResultMessage: HandResultMessage | undefined,
  formatPot: (amount: number) => string,
  formatWinAmount: (amount: number) => string,
  tableStatus?: string,
): string {
  if (handResultMessage) {
    return buildWinnerMessageText(handResultMessage, formatWinAmount) ?? TABLE.waitingForHand;
  }
  if (hand && actionMessage) return actionMessage;
  if (hand) return `${hand.street} - Pot ${formatPot(hand.potCents)}`;

  // For a healthy connected table, show the generic "waiting for next hand" copy.
  if (!tableStatus || tableStatus === "CONNECTED") {
    return TABLE.waitingForHand;
  }

  // For other states (e.g. restoring session, errors), keep the prefixed status line.
  return `${TABLE.waitingForHandStatus}${tableStatus}`;
}

export type DealerAnnounceBarProps = {
  hand?: Hand;
  actionMessage?: string;
  handResultMessage?: HandResultMessage;
  tableStatus?: string;
  nextHandAtTs?: number;
  /** When set (e.g. connecting/error), shown instead of derived game message. */
  statusMessage?: string;
};

export function DealerAnnounceBar({
  hand,
  actionMessage,
  handResultMessage,
  tableStatus,
  nextHandAtTs,
  statusMessage,
}: DealerAnnounceBarProps) {
  const { formatPot, formatBet } = useTableMoneyDisplay();
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!nextHandAtTs) {
      setRemaining(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.ceil((nextHandAtTs - Date.now()) / 1000));
      setRemaining(diff);
    };

    tick();
    const interval = setInterval(tick, NEXT_DEAL_TICK_MS);
    return () => clearInterval(interval);
  }, [nextHandAtTs]);

  const message =
    statusMessage ??
    deriveMessage(hand, actionMessage, handResultMessage, formatPot, formatBet, tableStatus);

  const styleId = remaining > 0
    ? "surface.sim.table.announce.highlight"
    : "surface.sim.table.announce";

  return (
    <Surface
      styleId={styleId}
      collapsable={false}
      className="relative flex-shrink-0 p-4 mx-auto max-w-[96%]"
    >
      <Text
        variant="body"
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-center"
        allowFontScaling={false}
      >
        {message}
      </Text>
    </Surface>
  );
}
