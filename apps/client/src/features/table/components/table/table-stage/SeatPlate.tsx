import { memo } from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
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
  cardPeek?: number;
  nameplateH?: number;
  turnProgress?: number | null;
  betDisplay?: string | null;
};

const PRESSABLE_RESET: ViewStyle = {
  backgroundColor: "transparent",
  borderWidth: 0,
  padding: 0,
  margin: 0,
  ...(Platform.OS === "web"
    ? ({
        boxShadow: "none",
        outlineStyle: "none",
        appearance: "none",
        WebkitAppearance: "none",
        cursor: "pointer",
      } as ViewStyle)
    : null),
};

const SeatTurnBar = memo(function SeatTurnBar({
  show,
  progress,
  width,
}: {
  show: boolean;
  progress: number | null | undefined;
  width: number;
}) {
  if (!show || progress == null) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 4,
        right: 4,
        bottom: 0,
        height: 3,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "hsla(0,0%,0%,0.45)",
        width: width - 8,
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
 * GG compact seat:
 * avatar + single black nameplate; hole cards overlay the avatar (short cluster).
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
  cardPeek = 28,
  nameplateH = 34,
  turnProgress = null,
  betDisplay = null,
}: SeatPlateProps) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const plateW = Math.min(width, Math.max(avatarSize + 28, 96));

  const body = (
    <View
      style={{
        width,
        height,
        opacity: inactive ? 0.55 : 1,
        alignItems: "center",
        backgroundColor: "transparent",
      }}
    >
      {/* Cards absolutely over avatar — do not grow the vertical stack */}
      {cards?.visible ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: cardPeek + avatarSize * 0.55,
            alignItems: "center",
            justifyContent: "flex-start",
            zIndex: 3,
          }}
        >
          <SeatHoleCards cards={cards} packId={cardFacePackId} scale={cardScale} />
        </View>
      ) : null}

      <View style={{ marginTop: cardPeek, alignItems: "center", zIndex: 2 }}>
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

        {/* Single compact nameplate (GG) — name + stack only */}
        <View
          style={{
            marginTop: -2,
            width: plateW,
            height: nameplateH,
            paddingHorizontal: 6,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 6,
            backgroundColor: "rgba(0,0,0,0.78)",
            overflow: "hidden",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: "#fff",
              fontWeight: "700",
              textAlign: "center",
              width: "100%",
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: statusLabel ? "#fca5a5" : "#7dd3fc",
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              textAlign: "center",
              width: "100%",
            }}
          >
            {statusLabel ?? stackDisplay}
          </Text>
          <SeatTurnBar show={Boolean(isActiveTurn)} progress={turnProgress} width={plateW} />
        </View>
      </View>

      {betDisplay ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: cardPeek + avatarSize * 0.15,
            right: -2,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.75)",
            borderWidth: 1,
            borderColor: "rgba(212,175,55,0.45)",
            zIndex: 4,
          }}
        >
          <Text style={{ fontSize: 9, color: "#fde68a", fontVariant: ["tabular-nums"] }}>
            {betDisplay}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={PRESSABLE_RESET}>
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
