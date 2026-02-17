import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import { PotWinRing } from "./PotWinEffect";

export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: "folded" | "allIn" | "active" | "sittingOut";
  /** e.g. "Check", "Bet $5.00", "Raise $10" – shown under bank */
  actionLabel?: string;
};

function getStatusLabel(status: Opponent["status"]): string | null {
  if (status === "folded") return TABLE.fold;
  if (status === "sittingOut") return TABLE.sittingOut;
  if (status === "allIn") return "All in";
  return null;
}

export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
}: {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
}) {
  if (opponents.length === 0) return null;
  return (
    <View className="max-h-[22vh] ui-row-wrap border-b border-border-subtle px-3 py-3" style={{ gap: 10 }}>
      {opponents.map((o) => {
        const folded = o.status === "folded";
        const sittingOut = o.status === "sittingOut";
        const inactive = folded || sittingOut;
        const statusLabel = getStatusLabel(o.status);
        const actionText = o.actionLabel ?? statusLabel ?? "—";
        const isWinner = winnerName === o.name;
        const content = (
          <View
            className={`ui-col ui-center rounded-lg px-3 py-2 min-w-[80px] ${
              o.isActive ? "border-brand bg-brand-soft/30 border-2" : "ui-surface"
            } ${inactive ? "opacity-50" : ""}`}
            style={{ gap: 6 }}
          >
            <View className="relative">
              <View className="h-10 w-10 ui-center rounded-full bg-panel border border-border-subtle">
                <Text variant="label" className="text-sm">{o.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              {o.isDealer ? (
                <View className="absolute -right-0.5 -top-0.5 h-4 w-4 ui-center rounded-full bg-gold">
                  <Text variant="label" className="text-[10px]">D</Text>
                </View>
              ) : null}
            </View>
            <Text variant="label" numberOfLines={1} className="text-xs">
              {o.name}{o.isBot ? " 🤖" : ""}
            </Text>
            <Text variant="h2" className="text-base font-semibold">{formatCents(o.stackCents)}</Text>
            <Text
              variant="muted"
              numberOfLines={1}
              className={`text-xs ${o.status === "folded" ? "text-danger" : ""}`}
            >
              {actionText}
            </Text>
          </View>
        );

        const wrappedContent = isWinner ? (
          <PotWinRing>{content}</PotWinRing>
        ) : content;

        return onPlayerPress ? (
          <Pressable key={o.id} onPress={() => onPlayerPress(o)} className="ui-touch">
            {wrappedContent}
          </Pressable>
        ) : (
          <View key={o.id}>{wrappedContent}</View>
        );
      })}
    </View>
  );
}
