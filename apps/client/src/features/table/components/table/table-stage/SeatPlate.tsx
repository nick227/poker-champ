import { Platform, Pressable, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarDisc } from "../player-panel/AvatarDisc";
import type { Opponent } from "../table.adapter";
import type { CardFacePackId } from "@/assets/cards/packs";
import { SEAT_PLATE } from "./stageGeometry";
import { BASE_CARD_HEIGHT, PAIR_BASE_WIDTH } from "../tokens/card-dimensions.tokens";
import { SeatHoleCards } from "./SeatHoleCards";
import { SeatTurnAura } from "./SeatTurnAura";
import { isBannerStatus } from "./SeatStatusBanner";
import { WinningSeatPulse } from "@/features/table/animations/WinningSeatPulse";
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
  turnCountdownSeconds?: number | null;
  /** Rendered on the felt by TableStage — kept for API compat. */
  betDisplay?: string | null;
  /** This seat just won the pot — pulses WinningSeatPulse over the whole pod. */
  isWinner?: boolean;
  /** Opens the Gift/Side Bet sheet for this seat — opponents/bots only, never the hero.
   *  A sibling Pressable to the avatar body (not nested inside it), so tapping "+" never
   *  also triggers `onPress` (stats popup / bot removal). */
  onInteractPress?: () => void;
  /** Active gift to display on the seat plate, if any. */
  activeGift?: { emoji: string } | null;
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

/**
 * GG seat pod: cards cover the avatar only; nameplate is wider than the avatar
 * with stack-first type. Dealer + bets are felt markers (TableStage), not here.
 */
export function SeatPlate({
  name,
  stackDisplay,
  avatarUrl,
  userId,
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
  nameplateH = 48,
  turnProgress = null,
  turnCountdownSeconds = null,
  isWinner = false,
  onInteractPress,
  activeGift = null,
}: SeatPlateProps) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();
  const compact = width < 120;
  // Plate wider than avatar — GG stable base.
  const plateW = Math.min(
    width,
    Math.max(Math.round(avatarSize * (compact ? 1.32 : 1.42)), compact ? 96 : 172),
  );
  const allIn = isBannerStatus(statusLabel);
  const showTurnAura = Boolean(isActiveTurn);

  const avatarTop = cardPeek;
  const nameplateOverlap = compact ? 2 : 5;
  const nameplateTop = avatarTop + avatarSize - nameplateOverlap;
  const cardVisualHeight = Math.round(BASE_CARD_HEIGHT * cardScale);
  // Hard seam: card bottoms stop at the nameplate top — never cover name/stack.
  const cardsTop = Math.max(0, nameplateTop - cardVisualHeight + 6);
  // Nameplate is centered within `width`, wider than the avatar — this is its right edge.
  const plateRight = (width + plateW) / 2;
  const interactSize = compact ? 20 : 22;

  // Hole cards fan out centered in `width` — on narrow (mobile) plates the fanned pair can
  // span nearly the full plate, leaving no in-bounds gap for the gift badge. Derive the
  // badge's left offset from the actual card-pair bounds (falling back to the old fixed
  // inset when there's room) instead of a fixed pixel guess, so it never sits on top of cards.
  const cardPairLeft = (width - PAIR_BASE_WIDTH * cardScale) / 2;
  const giftBadgeSize = 28;
  const giftBadgeGap = 4;
  const giftBadgeLeft = Math.min(
    compact ? 6 : 10,
    cardPairLeft - giftBadgeSize - giftBadgeGap,
  );

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
      {isWinner ? (
        <View pointerEvents="none" style={{ position: "absolute", top: cardPeek, left: 0, right: 0, bottom: 0, zIndex: 20 }}>
          <WinningSeatPulse borderRadius={compact ? 8 : 10} />
        </View>
      ) : null}
      <View
        style={{
          marginTop: cardPeek,
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <View style={{ opacity: inactive ? 0.5 : 1 }}>
          <SeatTurnAura
            size={avatarSize}
            active={showTurnAura}
            progress={showTurnAura ? turnProgress : null}
            countdownSeconds={showTurnAura ? turnCountdownSeconds : null}
          >
            <AvatarDisc
              seed={userId || name}
              initial={initial}
              avatarUrl={avatarUrl}
              size={avatarSize}
              // Aura owns the turn ring — keep disc idle frame to avoid double chrome.
              isActiveTurn={false}
            />
          </SeatTurnAura>
        </View>

        <View
          style={{
            marginTop: -nameplateOverlap,
            width: plateW,
            minHeight: Math.max(nameplateH, compact ? 42 : 50),
            paddingHorizontal: compact ? 10 : 14,
            paddingVertical: compact ? 7 : 9,
            justifyContent: "center",
            alignItems: "center",
            gap: 1,
            borderRadius: compact ? 8 : 10,
            borderWidth: 1,
            borderColor: inactive
              ? "rgba(248,113,113,0.25)"
              : "rgba(255,255,255,0.12)",
            backgroundColor: inactive ? "rgba(8,10,12,0.92)" : "rgba(3,5,8,0.94)",
            overflow: "hidden",
            zIndex: 5,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: compact ? 11 : 12,
              color: inactive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.88)",
              fontWeight: "500",
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
              fontSize: compact ? 15 : 17,
              color: allIn ? "#f87171" : "#67d4ff",
              fontVariant: ["tabular-nums"],
              fontWeight: "800",
              textAlign: "center",
              width: "100%",
            }}
          >
            {allIn ? "All-In" : stackDisplay}
          </Text>
        </View>
      </View>

      {/* Cards above avatar, below nameplate in z — clipped to avatar seam by top math */}
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
            zIndex: 30,
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

      {/* Active gift badge — pinned above the card-peek line (mirrors the interact
          button's corner) so hole cards, which peek down over the avatar, never cover it. */}
      {activeGift ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: cardPeek,
            left: giftBadgeLeft,
            width: giftBadgeSize,
            height: giftBadgeSize,
            borderRadius: giftBadgeSize / 2,
            backgroundColor: "rgba(0,0,0,0.9)",
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.4)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 40,
          }}
        >
          <Text style={{ fontSize: 16, lineHeight: 18, color: "white", textAlign: "center" }}>
            {activeGift.emoji}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const pressableBody = onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={PRESSABLE_RESET}>
      {body}
    </Pressable>
  ) : (
    body
  );

  if (!onInteractPress) return pressableBody;

  // Sibling to pressableBody, not nested inside it — tapping "+" must never also fire
  // onPress (stats popup / bot removal).
  return (
    <View style={{ width, height, overflow: "visible" }}>
      {pressableBody}
      {/* Anchored to the nameplate's top-right corner (not the card-peek line) so it
          never overlaps the hole cards, which peek down over the avatar above it. */}
      <Pressable
        onPress={onInteractPress}
        accessibilityRole="button"
        accessibilityLabel={`Send gift or propose side bet to ${name}`}
        style={{
          position: "absolute",
          top: nameplateTop,
          left: plateRight - interactSize / 2,
          width: interactSize,
          height: interactSize,
          borderRadius: interactSize / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(3,5,8,0.94)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.2)",
          zIndex: 40,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "800", color: "rgba(255,255,255,0.9)", lineHeight: 16 }}>+</Text>
      </Pressable>
    </View>
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
    turnCountdownSeconds?: number | null;
    activeGift?: { emoji: string } | null;
  },
): SeatPlateProps {
  const statusLabel = (() => {
    if (opts?.statusLabel !== undefined) return opts.statusLabel;
    if (opponent.status === "allIn") return "All in";
    return null;
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
    isWinner: opts?.isWinner ?? false,
    turnProgress: opts?.turnProgress ?? null,
    turnCountdownSeconds: opts?.turnCountdownSeconds ?? null,
    activeGift: opts?.activeGift ?? null,
  };
}
