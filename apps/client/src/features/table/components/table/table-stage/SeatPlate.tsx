import { memo } from "react";
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
  width?: number;
  height?: number;
  avatarSize?: number;
  cardScale?: number;
  /** 0..1 turn countdown when this seat is to act. */
  turnProgress?: number | null;
  /** Street bet display (already formatted). */
  betDisplay?: string | null;
};

const SeatTurnBar = memo(function SeatTurnBar({
  show,
  progress,
}: {
  show: boolean;
  progress: number | null | undefined;
}) {
  if (!show || progress == null) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 3,
        height: 3,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "hsla(0,0%,0%,0.4)",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          borderRadius: 2,
          backgroundColor: "hsla(43, 80%, 55%, 0.95)",
        }}
      />
    </View>
  );
});

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
      style={{ flexDirection: "row", transform: [{ scale }], marginBottom: -6 }}
    >
      <View style={{ marginRight: -10, transform: [{ rotate: "-12deg" }] }}>{left}</View>
      <View style={{ transform: [{ rotate: "12deg" }] }}>{right}</View>
    </View>
  );
}

/** Uniform seat chrome — fixed capsule height; status/bet as overlays. */
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
  turnProgress = null,
  betDisplay = null,
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
      {betDisplay ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: Math.max(0, height * 0.22),
            alignSelf: "center",
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: "rgba(12,16,22,0.75)",
            borderWidth: 1,
            borderColor: "rgba(212,175,55,0.35)",
          }}
        >
          <Text style={{ fontSize: 10, color: "#fde68a", fontVariant: ["tabular-nums"] }}>
            {betDisplay}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          width: "100%",
          height: SEAT_PLATE.CAPSULE_H,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 6,
          borderRadius: 999,
          borderWidth: isActiveTurn ? 1.5 : 1,
          borderColor: isActiveTurn ? "rgba(212,175,55,0.55)" : "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(12,16,22,0.9)",
          overflow: "hidden",
        }}
      >
        <View style={{ position: "relative" }}>
          <AvatarDisc
            seed={userId || name}
            initial={initial}
            avatarUrl={avatarUrl}
            size={avatarSize}
            isActiveTurn={isActiveTurn}
          />
          {isDealer ? (
            <View style={{ position: "absolute", top: -4, left: -4 }}>
              <DealerButton size="tiny" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
          <Text numberOfLines={1} style={{ fontSize: 11, color: "#fff", fontWeight: "600" }}>
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: "#7dd3fc", fontVariant: ["tabular-nums"] }}
          >
            {stackDisplay}
          </Text>
        </View>
        {statusLabel ? (
          <View
            style={{
              position: "absolute",
              top: 4,
              right: 8,
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderRadius: 999,
              backgroundColor: "rgba(127,29,29,0.85)",
            }}
          >
            <Text numberOfLines={1} style={{ fontSize: 9, color: "#fecaca", fontWeight: "700" }}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
        <SeatTurnBar show={Boolean(isActiveTurn)} progress={turnProgress} />
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
  opts?: {
    inactive?: boolean;
    statusLabel?: string | null;
    isWinner?: boolean;
    betDisplay?: string | null;
    turnProgress?: number | null;
  },
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
    betDisplay: opts?.betDisplay ?? null,
    turnProgress: opts?.turnProgress ?? null,
  };
}
