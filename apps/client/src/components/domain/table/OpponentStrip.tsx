import { Pressable, ScrollView, View } from "react-native";
import type { ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "./DealerButton";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import { PotWinRing } from "./PotWinEffect";
import {
  OPPONENT_STRIP_HEIGHT,
  OPPONENT_TILE_HEIGHT,
  OPPONENT_ROW_GAP,
  CONTAINER_PADDING,
  TILE_RADIUS,
  TILE_WIDTH,
  TILE_PADDING,
  ROW_PADDING,
  CARD_ROW_HEIGHT,
  USERNAME_ROW_HEIGHT,
  ACTION_ROW_HEIGHT,
  AVATAR_STACK_ROW_HEIGHT,
  AVATAR_SIZE,
  OPPONENT_CARD_SCALE,
  OPPONENT_CARD_WIDTH,
  OPPONENT_CARD_HEIGHT,
  CARD_GAP,
} from "./constants/opponentStrip.constants";

export { OPPONENT_STRIP_HEIGHT };

const ROW_BASE = ROW_PADDING * 2;

const tileStyles = {
  strip: {
    width: "100%" as const,
  },
  scrollContent: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingVertical: CONTAINER_PADDING,
    alignItems: "stretch" as const,
  },
  tile: {
    width: TILE_WIDTH,
    height: OPPONENT_TILE_HEIGHT,
    padding: TILE_PADDING,
    flexDirection: "column" as const,
    borderRadius: TILE_RADIUS,
    overflow: "hidden" as const,
  },
  cardRow: {
    height: CARD_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  card: {
    width: OPPONENT_CARD_WIDTH,
    height: OPPONENT_CARD_HEIGHT,
  },
  usernameRow: {
    height: USERNAME_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center" as const,
  },
  actionRow: {
    height: ACTION_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    justifyContent: "center" as const,
  },
  avatarStackRow: {
    height: AVATAR_STACK_ROW_HEIGHT + ROW_BASE,
    padding: ROW_PADDING,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: ROW_PADDING,
  },
  avatarCol: { flex: 1 as const, maxWidth: AVATAR_SIZE, minWidth: 0 },
  stackCol: { flex: 3 as const, minWidth: 0 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  dealerBadge: {
    position: "absolute",
    bottom: -33,
    left: "50%",
    marginLeft: -12,
    zIndex: 1,
  } as ViewStyle,
};

const CARD_ROW_CONTENT_HEIGHT = OPPONENT_CARD_HEIGHT;

type OpponentCardFace = { rank: string; suit: string };

export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: "folded" | "allIn" | "active" | "sittingOut";
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
    return <View style={{ height: CARD_ROW_CONTENT_HEIGHT }} />;
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
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: CARD_GAP, height: CARD_ROW_CONTENT_HEIGHT }}>
      <View style={[tileStyles.card, { justifyContent: "center", alignItems: "center" }]}>
        <View style={{ transform: [{ scale: OPPONENT_CARD_SCALE }] }}>{left}</View>
      </View>
      <View style={[tileStyles.card, { justifyContent: "center", alignItems: "center" }]}>
        <View style={{ transform: [{ scale: OPPONENT_CARD_SCALE }] }}>{right}</View>
      </View>
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
  height?: number;
}) {
  if (opponents.length === 0) return null;
  const stripHeight = height ?? OPPONENT_STRIP_HEIGHT;
  return (
    <View
      collapsable={false}
      className="border-b border-border-subtle flex-shrink-0"
      style={[tileStyles.strip, { height: stripHeight }]}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={tileStyles.scrollContent}
        showsVerticalScrollIndicator
        bounces={false}
        overScrollMode="never"
        alwaysBounceVertical={false}
        scrollEventThrottle={16}
      >
        <View collapsable={false} className="ui-row-wrap" style={{ gap: OPPONENT_ROW_GAP }}>
          {opponents.map((o) => {
            const inactive = o.status === "folded" || o.status === "sittingOut";
            const actionText = o.actionLabel ?? getStatusLabel(o.status) ?? "---";
            const isWinner = winnerName === o.name;
            const tile = (
              <View
                collapsable={false}
                className={`border border-border-subtle ${o.isActive ? "bg-brand-soft/15" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
                style={[
                  tileStyles.tile,
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
                <View style={tileStyles.cardRow}>
                  <OpponentCards opponent={o} />
                </View>
                <View style={tileStyles.usernameRow} className="border-t border-border-subtle/80 bg-panel/80">
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                    style={{ fontSize: 12, fontWeight: "500", color: o.isActive ? "hsl(158, 52%, 52%)" : "hsl(0, 0%, 90%)" }}
                  >
                    {o.name}{o.isBot ? " [BOT]" : ""}
                  </Text>
                </View>
                <View style={tileStyles.actionRow} className="bg-panel/80">
                  <Text
                    variant="muted"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    className={`text-[10px] ${o.status === "folded" ? "text-danger" : ""}`}
                    allowFontScaling={false}
                  >
                    {actionText}
                  </Text>
                </View>
                <View style={tileStyles.avatarStackRow} className="bg-panel/80 border-t border-border-subtle/80">
                  <View style={tileStyles.avatarCol}>
                    <View style={tileStyles.avatar} className="bg-panel-elevated border border-border">
                      <Text variant="label" className="text-xs font-semibold" allowFontScaling={false}>
                        {o.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={tileStyles.stackCol}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      allowFontScaling={false}
                      style={{ fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"], color: "hsl(158, 52%, 52%)" }}
                    >
                      {formatCents(o.stackCents ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>
            );
            const content = (
              <View style={{ position: "relative" }} collapsable={false}>
                {tile}
                {o.isDealer ? (
                  <View style={tileStyles.dealerBadge}>
                    <DealerButton size="small" />
                  </View>
                ) : null}
              </View>
            );
            const wrapped = isWinner ? <PotWinRing>{content}</PotWinRing> : content;
            return onPlayerPress ? (
              <Pressable key={o.id} onPress={() => onPlayerPress(o)} hitSlop={8} android_ripple={{ color: "rgba(255,255,255,0.08)" }} className="ui-touch">
                {wrapped}
              </Pressable>
            ) : (
              <View key={o.id}>{wrapped}</View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
