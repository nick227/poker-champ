import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarDisc } from "../player-panel/AvatarDisc";
import { DealerButton } from "../DealerButton";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { SEAT_PLATE } from "./stageGeometry";
import { SeatHoleCards } from "./SeatHoleCards";
import type { SeatPlateCards } from "./seatPlate.types";

export type { SeatPlateCards };

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
  turnProgress?: number | null;
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
        width: "78%",
        height: 3,
        marginTop: 3,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "hsla(0,0%,0%,0.45)",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          backgroundColor: "hsla(43, 80%, 55%, 0.95)",
        }}
      />
    </View>
  );
});

/**
 * GG-style seat: large hole cards dominate; avatar on rail; compact name/stack under avatar.
 * No wide gray dashboard capsule.
 */
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
        justifyContent: "flex-start",
      }}
    >
      {/* Cards first in paint order underlay; elevated z so they read as the hero of the cluster */}
      <View style={{ zIndex: 3, marginBottom: -avatarSize * 0.42 }}>
        {cards ? (
          <SeatHoleCards cards={cards} packId={cardFacePackId} scale={cardScale} />
        ) : (
          <View style={{ height: avatarSize * 0.35 }} />
        )}
      </View>

      <View style={{ zIndex: 2, alignItems: "center" }}>
        <View style={{ position: "relative" }}>
          <AvatarDisc
            seed={userId || name}
            initial={initial}
            avatarUrl={avatarUrl}
            size={avatarSize}
            isActiveTurn={isActiveTurn}
          />
          {isDealer ? (
            <View style={{ position: "absolute", top: -2, left: -6 }}>
              <DealerButton size="tiny" />
            </View>
          ) : null}
        </View>

        {/* Name + stack under avatar — text on dark void, no gray tile */}
        <View
          style={{
            marginTop: 4,
            maxWidth: Math.min(width * 0.95, avatarSize * 2.6),
            alignItems: "center",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: "#fff",
              fontWeight: "700",
              textAlign: "center",
              textShadowColor: "rgba(0,0,0,0.95)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
              maxWidth: width - 4,
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: "#7dd3fc",
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              textAlign: "center",
              textShadowColor: "rgba(0,0,0,0.95)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}
          >
            {stackDisplay}
          </Text>
          {statusLabel ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10,
                color: "#fca5a5",
                fontWeight: "800",
                marginTop: 1,
                textShadowColor: "rgba(0,0,0,0.9)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2,
              }}
            >
              {statusLabel}
            </Text>
          ) : null}
        </View>

        <SeatTurnBar show={Boolean(isActiveTurn)} progress={turnProgress} />
      </View>

      {betDisplay ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 2,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.65)",
            borderWidth: 1,
            borderColor: "rgba(212,175,55,0.4)",
            zIndex: 4,
          }}
        >
          <Text style={{ fontSize: 10, color: "#fde68a", fontVariant: ["tabular-nums"] }}>
            {betDisplay}
          </Text>
        </View>
      ) : null}
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
