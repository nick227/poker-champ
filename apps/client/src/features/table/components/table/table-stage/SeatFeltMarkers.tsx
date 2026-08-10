import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "../DealerButton";

type Point = { x: number; y: number };

/**
 * Dealer puck + bet amount parked on the felt toward the board —
 * not clipped to the avatar disc (GG anchoring).
 */
export function SeatFeltMarkers({
  seat,
  feltCenter,
  avatarSize,
  isDealer,
  betDisplay,
}: {
  seat: Point;
  feltCenter: Point;
  avatarSize: number;
  isDealer?: boolean;
  betDisplay?: string | null;
}) {
  if (!isDealer && !betDisplay) return null;

  const dx = feltCenter.x - seat.x;
  const dy = feltCenter.y - seat.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular nudge so the D sits beside the inward ray, clear of hole cards.
  const px = -uy;
  const py = ux;

  const dealerDist = avatarSize * 0.52;
  const dealerSide = avatarSize * 0.38;
  const betDist = avatarSize * 0.95;

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 4 }}>
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
            left: seat.x + ux * betDist - 28,
            top: seat.y + uy * betDist - 12,
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
