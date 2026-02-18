import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";

type Hand = { street: string; potCents: number };
type HandResultMessage = { winnerName: string; amountCents: number; winningHandDescr?: string };

type Blinds = { smallBlindCents: number; bigBlindCents: number };

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
  return tableStatus ? `Waiting for hand - ${tableStatus}` : "Waiting for hand";
}

export function DealerAnnounceBar({
  hand,
  actionMessage,
  handResultMessage,
  tableStatus,
  nextHandAtTs,
  blinds,
}: {
  hand?: Hand;
  actionMessage?: string;
  handResultMessage?: HandResultMessage;
  tableStatus?: string;
  nextHandAtTs?: number;
  blinds?: Blinds;
}) {
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
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [nextHandAtTs]);

  const message = deriveMessage(hand, actionMessage, handResultMessage, tableStatus);

  return (
    <View className="h-[5vh] min-h-[36px] ui-center gap-x-3">
      {blinds && (
        <Text variant="label" className="text-text-subtle">
          {formatCents(blinds.smallBlindCents)} / {formatCents(blinds.bigBlindCents)}
        </Text>
      )}
      <Text variant="body">{message}</Text>
      {remaining > 0 && (
        <View className="px-2 py-0.5 rounded-full bg-surface-lowest/40 border border-border-subtle/30">
          <Text variant="label" className="font-mono text-text-subtle">
            Next deal: {remaining}s
          </Text>
        </View>
      )}
    </View>
  );
}
