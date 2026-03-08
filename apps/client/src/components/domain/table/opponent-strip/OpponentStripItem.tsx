import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { DealerButton } from "../DealerButton";
import { PlayingCard } from "../PlayingCard";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { Opponent } from "../table.adapter";
import { assertNever } from "../table.adapter";
import { PotWinRing } from "../PotWinEffect";
import type { CardFacePackId } from "@/assets/cards/packs";
import { opponentStripStyles as s, PRESSABLE_ANDROID_RIPPLE, PRESSABLE_HIT_SLOP } from "./styles";
import { CARDS } from "./layout";
import { BASE_CARD_WIDTH, BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";

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

/** Scale so two BASE_CARD cards fit in the cell with correct aspect ratio (no crop). */
function scaleToFillCell(width: number, height: number): number {
  const slotW = width / 2;
  const scaleW = slotW / BASE_CARD_WIDTH;
  const scaleH = height / BASE_CARD_HEIGHT;
  return Math.min(1, scaleW, scaleH);
}

/** Initial scale from min cell so two cards fill before first layout. */
function initialScale(): number {
  return scaleToFillCell(CARDS.CELL_MIN_WIDTH, CARDS.CELL_MIN_HEIGHT);
}

function OpponentCards({ opponent, packId }: { opponent: Opponent; packId: CardFacePackId }) {
  const { cards } = opponent;
  const cardsVisible = Boolean(cards?.visible);
  const isRevealed = Boolean(cards?.visible && !cards?.faceDown);
  const revealProgress = useRef(new Animated.Value(isRevealed ? 1 : 0)).current;
  const [scale, setScale] = useState(() => initialScale());
  const [slotW, setSlotW] = useState<number>(() => (CARDS.CELL_MIN_WIDTH - CARDS.GAP) / 2);
  const [slotH, setSlotH] = useState<number>(() => CARDS.CELL_MIN_HEIGHT);

  const onViewportLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      const w = (width - CARDS.GAP) / 2;
      const h = height;
      setSlotW(w);
      setSlotH(h);
      setScale(scaleToFillCell(width, height));
    },
    [],
  );

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

  const clipW = Math.max(0, Math.round(slotW));
  const clipH = Math.max(0, Math.round(slotH));
  const scaledCenterX = BASE_CARD_WIDTH / 2;
  const scaledCenterY = BASE_CARD_HEIGHT / 2;
  const translateX = clipW / 2 - scaledCenterX;
  const translateY = clipH / 2 - scaledCenterY;

  if (!cardsVisible || !cards) {
    return (
      <View style={s.cardsViewport} onLayout={onViewportLayout}>
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
      style={[s.cardsViewport, isRevealed && s.cardsViewportRevealed, { transform: [{ translateY: liftY }] }]}
      onLayout={onViewportLayout}
    >
      <View style={s.cardsViewportContent}>
        <View style={s.cardsRow}>
          <View style={s.cardSlot}>
            <View style={[s.cardClip, { width: clipW, height: clipH }]}>
              <View
                style={[
                  s.cardScaledInner,
                  {
                    transform: [
                      { scale },
                      { translateX },
                      { translateY },
                    ],
                  },
                ]}
              >
                {left}
              </View>
            </View>
          </View>
          <View style={s.cardSlot}>
            <View style={[s.cardClip, { width: clipW, height: clipH }]}>
              <View
                style={[
                  s.cardScaledInner,
                  {
                    transform: [
                      { scale },
                      { translateX },
                      { translateY },
                    ],
                  },
                ]}
              >
                {right}
              </View>
            </View>
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
      className={`opponent-item-container w-full px-2 border-border-subtle ${opponent.isActive ? "bg-dark-green-500" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
      style={[s.rowShell, opponent.isActive && s.rowShellActive]}
      data-testid="opponent-tile"
      data-opponent-id={opponent.id}
      data-opponent-name={opponent.name}
      data-stack-cents={String(opponent.stackCents ?? 0)}
    >
      <View className="content-row" style={s.contentRow}>
        <View className="opponent-avatar" style={s.avatarCol}>
          <AvatarImage
            avatarUrl={opponent.avatarUrl}
            initial={opponent.name.slice(0, 1).toUpperCase()}
            style={s.avatar}
            imageStyle={s.avatarImage}
            className="bg-panel-elevated border border-border"
          />
        </View>
        <View className="opponent-meta" style={s.metaCol}>
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
            <View style={s.cardsDock}>
              <OpponentCards opponent={opponent} packId={cardFacePackId} />
            </View>
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
