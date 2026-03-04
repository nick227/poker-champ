import { Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { DealerButton } from "./DealerButton";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { Opponent } from "./table.adapter";
import { assertNever } from "./table.adapter";

export type { Opponent } from "./table.adapter";
import { PotWinRing } from "./PotWinEffect";
import { OPPONENT_STRIP_MAX_HEIGHT_RATIO, OPPONENT_STRIP_MAX_HEIGHT_VH } from "./constants/components/opponentStrip.layout";
import { opponentStripStyles as s, PRESSABLE_HIT_SLOP, PRESSABLE_ANDROID_RIPPLE } from "./opponentStrip.styles";
import { usePreferencesStore } from "@/stores/preferences.store";
import type { CardFacePackId } from "@/assets/cards/packs";

export type OpponentStripProps = {
  opponents: Opponent[];
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
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

function OpponentCards({ opponent, packId }: { opponent: Opponent; packId: CardFacePackId }) {
  const { cards } = opponent;
  if (!cards || !cards.visible) {
    return <View style={s.cardPlaceholder} />;
  }
  const left = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.left
      ? <PlayingCard rank={cards.left.rank} suit={cards.left.suit} packId={packId} />
      : <PlayingCard faceDown />;
  const right = cards.faceDown
    ? <PlayingCard faceDown />
    : cards.right
      ? <PlayingCard rank={cards.right.rank} suit={cards.right.suit} packId={packId} />
      : <PlayingCard faceDown />;
  return (
    <View style={s.cardsRow}>
      <View style={s.cardSlot}>
        <View style={s.cardScaled}>{left}</View>
      </View>
      <View style={s.cardSlot}>
        <View style={s.cardScaled}>{right}</View>
      </View>
    </View>
  );
}

export function OpponentStrip({
  opponents,
  winnerName,
  onPlayerPress,
}: OpponentStripProps) {
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const { height: windowHeight } = useWindowDimensions();
  if (opponents.length === 0) return null;
  const maxHeightStyle =
    Platform.OS === "web"
      ? { maxHeight: `${OPPONENT_STRIP_MAX_HEIGHT_VH}vh` as unknown as number }
      : { maxHeight: Math.round(windowHeight * OPPONENT_STRIP_MAX_HEIGHT_RATIO) };
  return (
    <View
      collapsable={false}
      style={[s.strip, maxHeightStyle]}
    >
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={false}
        overScrollMode="never"
        scrollEventThrottle={16}
      >
          {opponents.map((o) => {
            const inactive = o.status === "folded" || o.status === "sittingOut" || o.status === "reconnecting";
            const actionText = o.actionLabel ?? getStatusLabel(o.status) ?? "---";
            const isWinner = winnerName === o.name;
            const tile = (
              <View
                collapsable={false}
                className={`w-full px-2 border-border-subtle ${o.isActive ? "bg-dark-green-500" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
                style={[s.rowShell, o.isActive && s.rowShellActive]}
                data-testid="opponent-tile"
                data-opponent-id={o.id}
                data-opponent-name={o.name}
                data-stack-cents={String(o.stackCents ?? 0)}
              >
                <View style={s.cardsCol} className="border-border-subtle">
                  <OpponentCards opponent={o} packId={cardFacePackId} />
                </View>
                <View style={s.infoCol}>
                  <View style={s.infoTopRow}>
                    <View style={s.nameWrap}>
                      <AvatarImage
                        avatarUrl={o.avatarUrl}
                        initial={o.name.slice(0, 1).toUpperCase()}
                        style={s.avatar}
                        imageStyle={s.avatarImage}
                        className="bg-panel-elevated border border-border"
                      />
                      <Text variant="label" className="text-xs font-semibold" numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
                        {o.name}{o.isBot ? " [BOT]" : ""}
                      </Text>
                    </View>
                    {o.isDealer ? <DealerButton size="small" /> : null}
                  </View>
                  <Text numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false} style={s.stackText}>
                    {formatCents(o.stackCents ?? 0)}
                  </Text>
                  <Text
                    variant="muted"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    className={o.status === "folded" ? "text-danger" : undefined}
                    allowFontScaling={false}
                    style={s.actionText}
                  >
                    {actionText}
                  </Text>
                </View>
              </View>
            );
            const content = (
              <>
                {isWinner ? <PotWinRing /> : null}
                {tile}
              </>
            );
            return onPlayerPress ? (
              <Pressable
                key={o.id}
                onPress={() => onPlayerPress(o)}
                hitSlop={PRESSABLE_HIT_SLOP}
                android_ripple={PRESSABLE_ANDROID_RIPPLE}
                className="ui-touch"
                style={s.rowPressable}
              >
                {content}
              </Pressable>
            ) : (
              <View key={o.id} style={s.rowPressable}>{content}</View>
            );
          })}
      </ScrollView>
    </View>
  );
}
