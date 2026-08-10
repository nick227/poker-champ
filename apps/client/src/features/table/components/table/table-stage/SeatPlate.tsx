import { memo } from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarDisc } from "../player-panel/AvatarDisc";
import { DealerButton } from "../DealerButton";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { SEAT_PLATE } from "./stageGeometry";
import { SeatHoleCards } from "./SeatHoleCards";
import { isBannerStatus, SeatStatusBanner } from "./SeatStatusBanner";
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
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "hsla(0,0%,0%,0.5)",
        width: width - 8,
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          backgroundColor: "hsl(45, 96%, 58%)",
        }}
      />
    </View>
  );
});

/**
 * GG seat pod: hole cards cover the avatar; nameplate always shows stack;
 * action status is a separate chip/banner — never replaces bankroll.
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
  const compact = width < 120;
  const plateW = Math.min(
    width,
    Math.max(avatarSize + (compact ? 36 : 56), compact ? 84 : 148),
  );
  const showBanner = isBannerStatus(statusLabel);
  const showStatusChip = Boolean(statusLabel) && !showBanner;
  /** Cards drop into the avatar face (not a floating shelf above it). */
  const cardsTop = Math.max(0, cardPeek - Math.round(avatarSize * 0.22));

  const body = (
    <View
      style={{
        width,
        height,
        alignItems: "center",
        backgroundColor: "transparent",
        overflow: "visible",
      }}
    >
      {cards?.visible ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: cardsTop,
            left: 0,
            right: 0,
            height: Math.round(avatarSize * 0.95),
            alignItems: "center",
            justifyContent: "flex-start",
            zIndex: 4,
          }}
        >
          <SeatHoleCards
            cards={cards}
            packId={cardFacePackId}
            scale={cardScale}
            inactive={inactive}
          />
        </View>
      ) : null}

      <View
        style={{
          marginTop: cardPeek,
          alignItems: "center",
          zIndex: 2,
          overflow: "visible",
        }}
      >
        <View
          style={{
            position: "relative",
            opacity: inactive ? 0.52 : 1,
            width: avatarSize,
            height: avatarSize,
          }}
        >
          <AvatarDisc
            seed={userId || name}
            initial={initial}
            avatarUrl={avatarUrl}
            size={avatarSize}
            isActiveTurn={isActiveTurn}
          />
          {isDealer ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: Math.round(avatarSize * 0.42),
                left: -14,
                zIndex: 6,
              }}
            >
              <DealerButton size="tiny" />
            </View>
          ) : null}
        </View>

        {showStatusChip ? (
          <View
            pointerEvents="none"
            style={{
              marginTop: 4,
              marginBottom: 2,
              paddingHorizontal: compact ? 8 : 10,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: "hsla(0, 0%, 0%, 0.78)",
              borderWidth: 1,
              borderColor: "hsla(43, 70%, 55%, 0.45)",
              maxWidth: plateW,
              zIndex: 5,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: compact ? 10 : 11,
                fontWeight: "700",
                color: "#fde68a",
                letterSpacing: 0.3,
                textAlign: "center",
              }}
            >
              {statusLabel}
            </Text>
          </View>
        ) : null}

        {/* Nameplate — name + stack always visible */}
        <View
          style={{
            marginTop: showStatusChip ? 0 : compact ? -2 : -6,
            width: plateW,
            minHeight: nameplateH,
            paddingHorizontal: compact ? 8 : 12,
            paddingTop: showBanner ? (compact ? 14 : 16) : compact ? 5 : 7,
            paddingBottom: compact ? 5 : 7,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: compact ? 7 : 10,
            borderWidth: isActiveTurn ? 2 : 1,
            borderColor: isActiveTurn
              ? "rgba(250,204,21,0.9)"
              : inactive
                ? "rgba(248,113,113,0.28)"
                : "rgba(255,255,255,0.12)",
            backgroundColor: inactive ? "rgba(8,10,12,0.9)" : "rgba(4,6,9,0.94)",
            overflow: "hidden",
            zIndex: 3,
          }}
        >
          {showBanner ? <SeatStatusBanner label={statusLabel!} compact={compact} /> : null}
          <Text
            numberOfLines={1}
            style={{
              fontSize: compact ? 11 : 13,
              color: inactive ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.92)",
              fontWeight: "600",
              letterSpacing: 0.2,
              textAlign: "center",
              width: "100%",
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 1,
              fontSize: compact ? 13 : 15,
              color: "#7dd3fc",
              fontVariant: ["tabular-nums"],
              fontWeight: "700",
              textAlign: "center",
              width: "100%",
            }}
          >
            {stackDisplay}
          </Text>
          <SeatTurnBar show={Boolean(isActiveTurn)} progress={turnProgress} width={plateW} />
        </View>

        {/* Bet sits under the plate toward the felt — not floating beside the avatar. */}
        {betDisplay ? (
          <View
            pointerEvents="none"
            style={{
              marginTop: 5,
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.82)",
              borderWidth: 1,
              borderColor: "rgba(212,175,55,0.55)",
              zIndex: 5,
            }}
          >
            <Text
              style={{
                fontSize: compact ? 11 : 12,
                color: "#fde68a",
                fontVariant: ["tabular-nums"],
                fontWeight: "700",
              }}
            >
              {betDisplay}
            </Text>
          </View>
        ) : null}
      </View>
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
  const statusLabel = (() => {
    if (opts?.statusLabel !== undefined) return opts.statusLabel;
    if (opponent.actionLabel) return opponent.actionLabel;
    switch (opponent.status) {
      case "folded":
        return "Folded";
      case "allIn":
        return "All in";
      case "sittingOut":
        return "Sitting out";
      case "reconnecting":
        return "Reconnecting";
      default:
        return null;
    }
  })();

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
    statusLabel,
    cards: opponent.cards,
    cardFacePackId,
    betDisplay: opts?.betDisplay ?? null,
    turnProgress: opts?.turnProgress ?? null,
  };
}
