import { memo } from "react";
import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarDisc } from "../player-panel/AvatarDisc";
import { DealerButton } from "../DealerButton";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { SEAT_PLATE } from "./stageGeometry";
import { BASE_CARD_HEIGHT } from "../tokens/card-dimensions.tokens";
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
        left: 6,
        right: 6,
        bottom: 0,
        height: 3,
        borderRadius: 2,
        overflow: "hidden",
        backgroundColor: "hsla(0,0%,0%,0.45)",
        width: width - 12,
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

/** Action prompts (to call / raises) stay off the nameplate — felt announce owns those. */
function plateBannerLabel(statusLabel: string | null | undefined): string | null {
  if (!isBannerStatus(statusLabel)) return null;
  return statusLabel ?? null;
}

/**
 * Seat pod: cards on the avatar face; nameplate is only name + stack;
 * dealer puck clear of cards; bet chip toward the felt.
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
  nameplateH = 44,
  turnProgress = null,
  betDisplay = null,
}: SeatPlateProps) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const compact = width < 120;
  const plateW = Math.min(
    width,
    Math.max(avatarSize + (compact ? 40 : 64), compact ? 88 : 156),
  );
  const banner = plateBannerLabel(statusLabel);

  // Drop cards onto the upper ~half of the avatar (not a shelf above it).
  const nameplateTop = cardPeek + avatarSize + (compact ? -2 : -6);
  const cardVisualHeight = Math.round(BASE_CARD_HEIGHT * cardScale);
  const maxCardsTop = Math.max(0, nameplateTop - cardVisualHeight - 4);
  const desiredCardsTop = cardPeek - Math.round(avatarSize * 0.42);
  const cardsTop = Math.max(0, Math.min(desiredCardsTop, maxCardsTop));

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
            height: cardVisualHeight,
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
            opacity: inactive ? 0.5 : 1,
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
                // Clear of the card fan (upper avatar) — park on the lower-left rim.
                top: Math.round(avatarSize * 0.62),
                left: -18,
                zIndex: 7,
              }}
            >
              <DealerButton size="small" />
            </View>
          ) : null}
        </View>

        {/* Nameplate — identity + bankroll only */}
        <View
          style={{
            marginTop: compact ? -2 : -5,
            width: plateW,
            minHeight: Math.max(nameplateH, compact ? 40 : 48),
            paddingHorizontal: compact ? 10 : 14,
            paddingTop: banner ? (compact ? 15 : 17) : compact ? 8 : 10,
            paddingBottom: compact ? 8 : 10,
            justifyContent: "center",
            alignItems: "center",
            gap: 2,
            borderRadius: compact ? 8 : 11,
            borderWidth: isActiveTurn ? 2 : 1,
            borderColor: isActiveTurn
              ? "rgba(250,204,21,0.9)"
              : inactive
                ? "rgba(248,113,113,0.25)"
                : "rgba(255,255,255,0.14)",
            backgroundColor: inactive ? "rgba(8,10,12,0.9)" : "rgba(3,5,8,0.94)",
            overflow: "hidden",
            zIndex: 3,
          }}
        >
          {banner ? <SeatStatusBanner label={banner} compact={compact} /> : null}
          <Text
            numberOfLines={1}
            style={{
              fontSize: compact ? 12 : 14,
              color: inactive ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.9)",
              fontWeight: "500",
              letterSpacing: 0.15,
              textAlign: "center",
              width: "100%",
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: compact ? 14 : 16,
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

        {betDisplay ? (
          <View
            pointerEvents="none"
            style={{
              marginTop: 6,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.84)",
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
  // Never put wager/action copy ("raises", "to call") on the seat — felt announce owns that.
  const statusLabel = (() => {
    if (opts?.statusLabel !== undefined) return opts.statusLabel;
    switch (opponent.status) {
      case "allIn":
        return "All in";
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
