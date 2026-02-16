import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";

type Hand = { street: string; potCents: number };
type LastHandResult = { handId: string; winnerId?: string };

function deriveMessage(
  hand: Hand | undefined,
  lastHandResult: LastHandResult | undefined,
  tableStatus?: string
): string {
  if (lastHandResult) return "Hand complete";
  if (hand) return `${hand.street} · Pot ${formatCents(hand.potCents)}`;
  return tableStatus ? `Waiting for hand · ${tableStatus}` : "Waiting for hand";
}

export function DealerAnnounceBar({
  hand,
  lastHandResult,
  tableStatus,
}: {
  hand?: Hand;
  lastHandResult?: LastHandResult;
  tableStatus?: string;
}) {
  const message = deriveMessage(hand, lastHandResult, tableStatus);
  return (
    <View className="h-[5vh] min-h-[36px] ui-center border-b border-border-subtle bg-felt">
      <Text variant="body">{message}</Text>
    </View>
  );
}
