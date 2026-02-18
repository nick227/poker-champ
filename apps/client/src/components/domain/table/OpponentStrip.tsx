import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "./DealerButton";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import { PotWinRing } from "./PotWinEffect";
import {
  OPPONENT_STRIP_HEIGHT,
  OPPONENT_CHIP_HEIGHT,
  OPPONENT_ROW_GAP,
  OPPONENT_STRIP_PADDING_V,
  CHIP_RADIUS,
  CARD_ZONE_HEIGHT,
  INFO_BAR_HEIGHT,
  AVATAR_SIZE,
  OPPONENT_CARD_SCALE,
} from "./constants/opponentStrip.constants";

export { OPPONENT_STRIP_HEIGHT };

/** PlayingCard height 68 * scale → row height for centered cards. */
const CARD_ROW_HEIGHT = Math.ceil(68 * OPPONENT_CARD_SCALE);
const CARD_GAP = 6;

type OpponentCardFace = { rank: string; suit: string };

export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: "folded" | "allIn" | "active" | "sittingOut";
  /** e.g. "Check", "Bet $5.00", "Raise $10" shown under bank */
  actionLabel?: string;
  cards?: {
    left?: OpponentCardFace | null;
    right?: OpponentCardFace | null;
    faceDown: boolean;
    visible: boolean;
  };
};

function getStatusLabel(status: Opponent["status"]): string | null {
  if (status === "folded") return TABLE.fold;
  if (status === "sittingOut") return TABLE.sittingOut;
  if (status === "allIn") return "All in";
  return null;
}

function OpponentCards({ opponent }: { opponent: Opponent }) {
  const { cards } = opponent;
  if (!cards?.visible) {
    return <View style={{ height: CARD_ROW_HEIGHT }} />;
  }
  const left = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.left
      ? <PlayingCard rank={cards.left.rank} suit={cards.left.suit} />
      : <PlayingCard faceDown />;
  const right = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.right
      ? <PlayingCard rank={cards.right.rank} suit={cards.right.suit} />
      : <PlayingCard faceDown />;
  return (
    <View className="ui-row ui-center" style={{ gap: CARD_GAP, height: CARD_ROW_HEIGHT }}>
      <View style={{ transform: [{ scale: OPPONENT_CARD_SCALE }] }}>{left}</View>
      <View style={{ transform: [{ scale: OPPONENT_CARD_SCALE }] }}>{right}</View>
    </View>
  );
}

export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
  height,
}: {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** Override when viewport is small (emergency fallback). */
  height?: number;
}) {
  if (opponents.length === 0) return null;
  const stripHeight = height ?? OPPONENT_STRIP_HEIGHT;
  return (
    <View
      collapsable={false}
      className="border-b border-border-subtle flex-shrink-0"
      style={{ height: stripHeight, width: "100%" }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 10,
          paddingVertical: OPPONENT_STRIP_PADDING_V,
          alignItems: "stretch",
        }}
        showsVerticalScrollIndicator
        bounces={false}
        overScrollMode="never"
        alwaysBounceVertical={false}
        scrollEventThrottle={16}
      >
        <View collapsable={false} className="ui-row-wrap" style={{ gap: OPPONENT_ROW_GAP }}>
      {opponents.map((o) => {
        const folded = o.status === "folded";
        const sittingOut = o.status === "sittingOut";
        const inactive = folded || sittingOut;
        const statusLabel = getStatusLabel(o.status);
        const actionText = o.actionLabel ?? statusLabel ?? "-";
        const isWinner = winnerName === o.name;
        const tile = (
          <View
            collapsable={false}
            className={`overflow-hidden border border-border-subtle ${o.isActive ? "bg-brand-soft/15" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
            style={[
              {
                height: OPPONENT_CHIP_HEIGHT,
                minWidth: 84,
                flexDirection: "column",
                borderRadius: CHIP_RADIUS,
              },
              o.isActive && {
                borderColor: "hsl(158, 52%, 42%)",
                shadowColor: "hsl(158, 52%, 42%)",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 6,
              },
            ]}
          >
            <View
              style={{
                height: CARD_ZONE_HEIGHT,
                minHeight: CARD_ZONE_HEIGHT,
                flexShrink: 0,
                justifyContent: "flex-start",
                alignItems: "center",
                paddingTop: 10,
              }}
            >
              <OpponentCards opponent={o} />
            </View>
            <View
              style={{
                height: INFO_BAR_HEIGHT,
                minHeight: INFO_BAR_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 8,
                gap: 6,
                overflow: "hidden",
              }}
              className="bg-panel/80 border-t border-border-subtle/80"
            >
              <View
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  overflow: "hidden",
                  justifyContent: "center",
                  alignItems: "center",
                }}
                className="bg-panel-elevated border border-border"
              >
                <Text variant="label" className="text-xs font-semibold" allowFontScaling={false}>
                  {o.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, flexDirection: "column", justifyContent: "space-between", paddingVertical: 6, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                    style={{
                      fontSize: 12,
                      fontWeight: "500",
                      color: o.isActive ? "hsl(158, 52%, 52%)" : "hsl(0, 0%, 90%)",
                    }}
                  >
                    {o.name}{o.isBot ? " [BOT]" : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", minHeight: 20 }}>
                  <Text
                    variant="muted"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ marginRight: 4 }}
                    className={`text-[10px] ${o.status === "folded" ? "text-danger" : ""}`}
                    allowFontScaling={false}
                  >
                    {actionText}
                  </Text>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      fontVariant: ["tabular-nums"],
                      color: "hsl(158, 52%, 52%)",
                    }}
                  >
                    {formatCents(o.stackCents ?? 0)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        );

        const content = (
          <View style={{ position: "relative" }} collapsable={false}>
            {tile}
            {o.isDealer ? (
              <View
                style={{
                  position: "absolute",
                  bottom: -12,
                  left: "50%",
                  marginLeft: -12,
                  zIndex: 1,
                }}
              >
                <DealerButton size="small" />
              </View>
            ) : null}
          </View>
        );

        const wrappedContent = isWinner ? (
          <PotWinRing>{content}</PotWinRing>
        ) : content;

        return onPlayerPress ? (
          <Pressable
            key={o.id}
            onPress={() => onPlayerPress(o)}
            hitSlop={8}
            android_ripple={{ color: "rgba(255,255,255,0.08)" }}
            className="ui-touch"
          >
            {wrappedContent}
          </Pressable>
        ) : (
          <View key={o.id}>{wrappedContent}</View>
        );
      })}
        </View>
      </ScrollView>
    </View>
  );
}
