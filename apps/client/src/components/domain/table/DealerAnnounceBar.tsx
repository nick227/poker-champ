/**
 * Owns all textual status: game messages (hand, action, result, waiting) or statusMessage (connecting/error).
 * No other component should show "Connecting", "Error", "Waiting" etc. See TABLE_SCENE_VIEWS_OVERVIEW.md.
 */
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HandResultMessage } from "./table.types";

type Hand = { street: string; potCents: number };

const NEXT_DEAL_TICK_MS = 250;

function deriveMessage(
  hand: Hand | undefined,
  actionMessage: string | undefined,
  handResultMessage: HandResultMessage | undefined,
  tableStatus?: string,
): string {
  if (hand && actionMessage) return actionMessage;
  if (handResultMessage) {
    const line = `${handResultMessage.winnerName} ${TABLE.wins} ${formatCents(handResultMessage.amountCents)}`;
    return handResultMessage.winningHandDescr
      ? `${line} - ${handResultMessage.winningHandDescr}`
      : line;
  }
  if (hand) return `${hand.street} - Pot ${formatCents(hand.potCents)}`;
  return tableStatus ? `${TABLE.waitingForHandStatus}${tableStatus}` : TABLE.waitingForHand;
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
    statusMessage ?? deriveMessage(hand, actionMessage, handResultMessage, tableStatus);

  return (
    <View collapsable={false} className="relative h-9 p-4 ui-row flex-shrink-0 items-center w-full justify-center ui-surface">
      <View className="min-w-0 justify-center pt-2 pb-4">
        <Text variant="body" numberOfLines={1} ellipsizeMode="tail" className="text-center" allowFontScaling={false}>
          {message}
        </Text>
      </View>
      <View className="absolute right-0 min-w-[112px] items-end">
        {remaining > 0 ? (
          <View className="px-2 py-0.5 rounded-full bg-surface-lowest/40 border border-border-subtle/30 flex-shrink-0">
            <Text variant="label" className="font-mono text-text-subtle" allowFontScaling={false}>
              {TABLE.nextDeal} {remaining}s
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
