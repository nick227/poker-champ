import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { DealerButton } from "./DealerButton";
import { PlayingCard } from "./PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { Opponent } from "./table.adapter";
import { assertNever } from "./table.adapter";
import { PotWinRing } from "./PotWinEffect";
import type { CardFacePackId } from "@/assets/cards/packs";
import { opponentStripStyles as s, PRESSABLE_ANDROID_RIPPLE, PRESSABLE_HIT_SLOP } from "./opponentStrip.styles";
import { OPPONENT_CARDS_FULL_HEIGHT } from "./constants/tableLayout.constants";

type OpponentStripItemProps = {
  opponent: Opponent;
  winnerName?: string;
  onPlayerPress?: (opponent: Opponent) => void;
  /** 0-1 when an opponent is to act (for countdown bar); null otherwise */
  activeTurnProgress?: number | null;
  cardFacePackId: CardFacePackId;
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
  const cardsVisible = Boolean(cards?.visible);
  const isRevealed = Boolean(cards?.visible && !cards?.faceDown);
  const revealProgress = useRef(new Animated.Value(isRevealed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(revealProgress, {
      toValue: isRevealed ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isRevealed, revealProgress]);

  const liftY = revealProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  if (!cardsVisible || !cards) {
    return (
      <View style={s.cardsViewport}>
        <View style={s.cardPlaceholder} />
      </View>
    );
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
    <Animated.View
      style={[
        s.cardsViewport,
        isRevealed && s.cardsViewportRevealed,
        { height: OPPONENT_CARDS_FULL_HEIGHT, transform: [{ translateY: liftY }] },
      ]}
    >
      <View style={s.cardsViewportContent}>
        <View style={s.cardsRow}>
          <View style={s.cardSlot}>
            <View style={s.cardScaled}>{left}</View>
          </View>
          <View style={s.cardSlot}>
            <View style={s.cardScaled}>{right}</View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export function OpponentStripItem({
  opponent,
  winnerName,
  onPlayerPress,
  activeTurnProgress,
  cardFacePackId,
}: OpponentStripItemProps) {
  const inactive =
    opponent.status === "folded" || opponent.status === "sittingOut" || opponent.status === "reconnecting";
  const actionText = opponent.actionLabel ?? getStatusLabel(opponent.status) ?? "---";
  const isWinner = winnerName === opponent.name;
  const showTurnBar = opponent.isActive && activeTurnProgress != null;

  const tile = (
    <View
      collapsable={false}
      className={`w-full px-2 border-border-subtle ${opponent.isActive ? "bg-dark-green-500" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
      style={[s.rowShell, opponent.isActive && s.rowShellActive]}
      data-testid="opponent-tile"
      data-opponent-id={opponent.id}
      data-opponent-name={opponent.name}
      data-stack-cents={String(opponent.stackCents ?? 0)}
    >
      <View style={s.contentRow}>
        <View style={s.avatarCol}>
          <AvatarImage
            avatarUrl={opponent.avatarUrl}
            initial={opponent.name.slice(0, 1).toUpperCase()}
            style={s.avatar}
            imageStyle={s.avatarImage}
            className="bg-panel-elevated border border-border"
          />
        </View>
        <View style={s.metaCol}>
          <View className="ui-row justify-between" style={s.nameRow}>
            <Text
              variant="label"
              className="font-semibold"
              numberOfLines={1}
              ellipsizeMode="tail"
              allowFontScaling={false}
              style={s.nameText}
            >
              {opponent.name}{opponent.isBot ? " [BOT]" : ""}
            </Text>
            {opponent.isDealer ? <DealerButton size="small" /> : null}
          </View>
          <View style={s.stackRow}>
            <Text numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false} style={s.stackText}>
              {formatCents(opponent.stackCents ?? 0)}
            </Text>
          </View>
          <View style={s.footerRow}>
            <View style={s.actionDock}>
              <Text
                variant="muted"
                numberOfLines={1}
                ellipsizeMode="tail"
                className={opponent.status === "folded" ? "text-danger" : undefined}
                allowFontScaling={false}
                style={s.actionText}
              >
                {actionText}
              </Text>
            </View>
            <View style={s.cardsDock}>
              <OpponentCards opponent={opponent} packId={cardFacePackId} />
            </View>
          </View>
        </View>
      </View>
      {showTurnBar ? (
        <View style={s.turnBarTrack}>
          <View style={[s.turnBarFill, { width: `${activeTurnProgress * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );

  const content = (
    <>
      {isWinner ? <PotWinRing /> : null}
      {tile}
    </>
  );

  if (onPlayerPress) {
    return (
      <Pressable
        onPress={() => onPlayerPress(opponent)}
        hitSlop={PRESSABLE_HIT_SLOP}
        android_ripple={PRESSABLE_ANDROID_RIPPLE}
        className="ui-touch"
        style={s.rowPressable}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={s.rowPressable}>{content}</View>;
}
