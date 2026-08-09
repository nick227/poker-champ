import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { PlayingCard } from "../PlayingCard";
import { AvatarDisc } from "../player-panel/AvatarDisc";
import { DealerButton } from "../DealerButton";
import type { Opponent, UiCard } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { SEAT_PLATE } from "./stageGeometry";

export type SeatPlateCards = {
  left?: UiCard;
  right?: UiCard;
  faceDown: boolean;
  visible: boolean;
};

export type SeatPlateProps = {
  name: string;
  stackDisplay: string;
  avatarUrl?: string | null;
  userId?: string;
  seat?: number;
  isDealer?: boolean;
  isActiveTurn?: boolean;
  inactive?: boolean;
  statusLabel?: string | null;
  cards?: SeatPlateCards;
  cardFacePackId: CardFacePackId;
  onPress?: () => void;
  /** Projected plate size from stage layout. */
  width?: number;
  height?: number;
  avatarSize?: number;
  cardScale?: number;
};

function HolePair({
  cards,
  packId,
  scale,
}: {
  cards: SeatPlateCards;
  packId: CardFacePackId;
  scale: number;
}) {
  if (!cards.visible) return null;
  const left = cards.faceDown || !cards.left ? (
    <PlayingCard faceDown />
  ) : (
    <PlayingCard rank={cards.left.rank} suit={cards.left.suit} packId={packId} />
  );
  const right = cards.faceDown || !cards.right ? (
    <PlayingCard faceDown />
  ) : (
    <PlayingCard rank={cards.right.rank} suit={cards.right.suit} packId={packId} />
  );
  return (
    <View
      pointerEvents="none"
      style={{
        flexDirection: "row",
        transform: [{ scale }],
        marginBottom: -6,
      }}
    >
      <View style={{ marginRight: -10, transform: [{ rotate: "-12deg" }] }}>{left}</View>
      <View style={{ transform: [{ rotate: "12deg" }] }}>{right}</View>
    </View>
  );
}

/** Uniform seat chrome for hero and opponents — size from stage projection. */
export function SeatPlate({
  name,
  stackDisplay,
  avatarUrl,
  userId,
  isDealer = false,
  isActiveTurn = false,
  inactive = false,
  statusLabel,
  cards,
  cardFacePackId,
  onPress,
  width = SEAT_PLATE.WIDTH,
  height = SEAT_PLATE.HEIGHT,
  avatarSize = SEAT_PLATE.AVATAR,
  cardScale = SEAT_PLATE.CARD_SCALE,
}: SeatPlateProps) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const body = (
    <View
      style={{
        width,
        height,
        opacity: inactive ? 0.55 : 1,
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      {cards ? <HolePair cards={cards} packId={cardFacePackId} scale={cardScale} /> : null}
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 6,
          paddingVertical: 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(12,16,22,0.9)",
        }}
      >
        <AvatarDisc
          seed={userId || name}
          initial={initial}
          avatarUrl={avatarUrl}
          size={avatarSize}
          isActiveTurn={isActiveTurn}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 11, color: "#fff", fontWeight: "600" }}>
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: "#7dd3fc", fontVariant: ["tabular-nums"] }}
          >
            {stackDisplay}
          </Text>
          {statusLabel ? (
            <Text numberOfLines={1} style={{ fontSize: 9, color: "#f87171" }}>
              {statusLabel}
            </Text>
          ) : null}
        </View>
        {isDealer ? (
          <View style={{ position: "absolute", top: -6, right: -4 }}>
            <DealerButton size="tiny" />
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export function opponentToSeatPlateProps(
  opponent: Opponent,
  stackDisplay: string,
  cardFacePackId: CardFacePackId,
  opts?: { inactive?: boolean; statusLabel?: string | null; isWinner?: boolean },
): SeatPlateProps {
  return {
    name: opponent.name,
    stackDisplay,
    avatarUrl: opponent.avatarUrl,
    userId: opponent.id,
    seat: opponent.seat,
    isDealer: opponent.isDealer,
    isActiveTurn: Boolean(opponent.isActive),
    inactive:
      opts?.inactive ?? (opponent.status === "folded" || opponent.status === "sittingOut"),
    statusLabel: opts?.statusLabel ?? opponent.actionLabel ?? null,
    cards: opponent.cards,
    cardFacePackId,
  };
}
