import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "./DealerButton";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { OpponentDisplayStatus } from "./table.adapter";
import { assertNever } from "./table.adapter";
import { PotWinRing } from "./PotWinEffect";
import { OPPONENT_STRIP_HEIGHT } from "./constants/tableLayout.constants";
import { opponentStripStyles as s, PRESSABLE_HIT_SLOP, PRESSABLE_ANDROID_RIPPLE } from "./opponentStrip.styles";

export { OPPONENT_STRIP_HEIGHT };

type OpponentCardFace = { rank: string; suit: string };

export type OpponentStripProps = {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  height?: number;
};

export type Opponent = {
  id: string;
  name: string;
  stackCents: number;
  isDealer?: boolean;
  isActive?: boolean;
  isBot?: boolean;
  status?: OpponentDisplayStatus;
  actionLabel?: string;
  cards?: {
    left?: OpponentCardFace | null;
    right?: OpponentCardFace | null;
    faceDown: boolean;
    visible: boolean;
  };
};

function getStatusLabel(status: Opponent["status"]): string | null {
  if (status == null) return null;
  switch (status) {
    case "active":
      return null;
    case "folded":
      return TABLE.fold;
    case "allIn":
      return "All in";
    case "sittingOut":
      return TABLE.sittingOut;
    case "reconnecting":
      return TABLE.reconnecting;
    default:
      return assertNever(status);
  }
}

function OpponentCards({ opponent }: { opponent: Opponent }) {
  const { cards } = opponent;
  if (!cards?.visible) {
    return <View style={s.cardPlaceholder} />;
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
    <View style={s.cardRowInner}>
      <View style={s.card}>
        <View style={s.cardScaled}>{left}</View>
      </View>
      <View style={s.card}>
        <View style={s.cardScaled}>{right}</View>
      </View>
    </View>
  );
}

export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
  height,
}: OpponentStripProps) {
  if (opponents.length === 0) return null;
  const stripHeight = height ?? OPPONENT_STRIP_HEIGHT;
  return (
    <View
      collapsable={false}
      className="flex-shrink-0"
      style={[s.strip, { height: stripHeight }]}
    >
      <ScrollView
        horizontal
        style={[s.scrollViewFill, { flexGrow: 0, flexShrink: 0, overflow: "visible" }]}
        contentContainerStyle={[s.scrollContent, s.horizontalScrollContent]}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
      >
        <View collapsable={false} style={s.opponentRow}>
          {opponents.map((o) => {
            const inactive = o.status === "folded" || o.status === "sittingOut" || o.status === "reconnecting";
            const actionText = o.actionLabel ?? getStatusLabel(o.status) ?? "---";
            const isWinner = winnerName === o.name;
            const tile = (
              <View
                collapsable={false}
                className={`border border-border-subtle ${o.isActive ? "bg-brand-soft/15" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
                style={[s.tile, o.isActive && s.tileActive]}
                data-testid="opponent-tile"
                data-opponent-id={o.id}
                data-opponent-name={o.name}
                data-stack-cents={String(o.stackCents ?? 0)}
              >
                <View style={s.cardRow}>
                  <OpponentCards opponent={o} />
                </View>
                <View style={s.usernameRow} className="border-t border-border-subtle/80 bg-panel/80">
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    allowFontScaling={false}
                    style={[s.usernameText, o.isActive && s.usernameTextActive]}
                  >
                    {o.name}{o.isBot ? " [BOT]" : ""}
                  </Text>
                </View>
                <View style={s.actionRow} className="bg-panel/80">
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
                <View style={s.avatarStackRow} className="bg-panel/80 border-t border-border-subtle/80">
                  <View style={s.avatarCol}>
                    <View style={s.avatar} className="bg-panel-elevated border border-border">
                      <Text variant="label" className="text-xs font-semibold" allowFontScaling={false}>
                        {o.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={s.stackCol}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      allowFontScaling={false}
                      style={s.stackText}
                    >
                      {formatCents(o.stackCents ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>
            );
            const content = (
              <View style={s.contentWrapper} collapsable={false}>
                {tile}
                {o.isDealer ? (
                  <View style={s.dealerBadge}>
                    <DealerButton size="small" />
                  </View>
                ) : null}
              </View>
            );
            const wrapped = isWinner ? <PotWinRing>{content}</PotWinRing> : content;
            return onPlayerPress ? (
              <Pressable
                key={o.id}
                onPress={() => onPlayerPress(o)}
                hitSlop={PRESSABLE_HIT_SLOP}
                android_ripple={PRESSABLE_ANDROID_RIPPLE}
                className="ui-touch"
              >
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
