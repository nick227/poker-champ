import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "../DealerButton";

type Point = { x: number; y: number };

const BET_MARKER_HALF_WIDTH = 28;
const BET_MARKER_HALF_HEIGHT = 14;
const BET_MARKER_SEAT_GAP = 8;

/**
 * Put the bet just beyond the edge of the complete seat pod in the direction
 * of the felt. This matters most on portrait layouts: the south seat's cards
 * extend toward the felt, while the north seat's nameplate extends toward it.
 */
export function resolveBetMarkerCenter({
  seat,
  feltCenter,
  plateWidth,
  plateHeight,
  avatarSize,
  cardPeek,
}: {
  seat: Point;
  feltCenter: Point;
  plateWidth: number;
  plateHeight: number;
  avatarSize: number;
  cardPeek: number;
}): Point {
  const dx = feltCenter.x - seat.x;
  const dy = feltCenter.y - seat.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const avatarCenterFromTop = cardPeek + avatarSize / 2;

  // Expand the pod bounds by the marker radius and a visible felt gap, then
  // find where the inward ray first exits that rectangle.
  const horizontalClearance = plateWidth / 2 + BET_MARKER_HALF_WIDTH + BET_MARKER_SEAT_GAP;
  const topClearance = avatarCenterFromTop + BET_MARKER_HALF_HEIGHT + BET_MARKER_SEAT_GAP;
  const bottomClearance =
    plateHeight - avatarCenterFromTop + BET_MARKER_HALF_HEIGHT + BET_MARKER_SEAT_GAP;
  const xDistance =
    ux > 0.001
      ? horizontalClearance / ux
      : ux < -0.001
        ? horizontalClearance / -ux
        : Number.POSITIVE_INFINITY;
  const yDistance =
    uy > 0.001
      ? bottomClearance / uy
      : uy < -0.001
        ? topClearance / -uy
        : Number.POSITIVE_INFINITY;
  const distance = Math.min(xDistance, yDistance);

  return {
    x: seat.x + ux * distance,
    y: seat.y + uy * distance,
  };
}

/**
 * Dealer puck + bet amount parked on the felt toward the board —
 * not clipped to the avatar disc (GG anchoring).
 */
export function SeatFeltMarkers({
  seat,
  feltCenter,
  avatarSize,
  plateWidth,
  plateHeight,
  cardPeek,
  isDealer,
  betDisplay,
}: {
  seat: Point;
  feltCenter: Point;
  avatarSize: number;
  plateWidth: number;
  plateHeight: number;
  cardPeek: number;
  isDealer?: boolean;
  betDisplay?: string | null;
}) {
  if (!isDealer && !betDisplay) return null;

  const dx = feltCenter.x - seat.x;
  const dy = feltCenter.y - seat.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular nudge so the D sits beside the inward ray, clear of hole cards/bets.
  const px = -uy;
  const py = ux;

  // Extra side clearance keeps the puck out from under hole cards (seat plate is zIndex 20).
  const dealerClearancePx = 30;
  const dealerDist = avatarSize * 0.52;
  const dealerSide = avatarSize * 0.38 + dealerClearancePx;
  const betCenter = resolveBetMarkerCenter({
    seat,
    feltCenter,
    plateWidth,
    plateHeight,
    avatarSize,
    cardPeek,
  });

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 10 }}>
      {isDealer ? (
        <View
          testID="seat-felt-dealer"
          style={{
            position: "absolute",
            left: seat.x + ux * dealerDist + px * dealerSide - 12,
            top: seat.y + uy * dealerDist + py * dealerSide - 12,
          }}
        >
          <DealerButton size="small" />
        </View>
      ) : null}
      {betDisplay ? (
        <View
          testID="seat-felt-bet"
          style={{
            position: "absolute",
            left: betCenter.x - BET_MARKER_HALF_WIDTH,
            top: betCenter.y - BET_MARKER_HALF_HEIGHT,
            minWidth: 56,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.78)",
            borderWidth: 1,
            borderColor: "hsla(43, 70%, 50%, 0.55)",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "800",
              color: "#fde68a",
              fontVariant: ["tabular-nums"],
            }}
          >
            {betDisplay}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
