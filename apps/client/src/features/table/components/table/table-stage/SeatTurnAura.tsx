import type { ReactNode } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { TURN_AURA } from "../tokens/turn.tokens";

type Props = {
  size: number;
  active: boolean;
  /** Remaining fraction 0..1 (from useTurnProgress). */
  progress?: number | null;
  /** Whole seconds left when in the warning window. */
  countdownSeconds?: number | null;
  children: ReactNode;
};

/**
 * GG turn theater: orange remaining-time ring around the avatar + countdown chip.
 */
export function SeatTurnAura({
  size,
  active,
  progress = null,
  countdownSeconds = null,
  children,
}: Props) {
  const pad = TURN_AURA.PAD;
  const outer = size + pad * 2;
  const remaining = progress == null ? 1 : Math.max(0, Math.min(1, progress));
  const low = remaining <= 0.25;
  const arc = low ? TURN_AURA.ARC_LOW : TURN_AURA.ARC;
  const pct = remaining * 100;

  const ringStyle: ViewStyle =
    Platform.OS === "web"
      ? ({
          backgroundImage: `conic-gradient(from -90deg, ${arc} 0% ${pct}%, ${TURN_AURA.TRACK} ${pct}% 100%)`,
          boxShadow: `0 0 14px ${TURN_AURA.GLOW}`,
        } as unknown as ViewStyle)
      : {
          borderWidth: TURN_AURA.RING_WIDTH,
          borderColor: active ? arc : "transparent",
        };

  return (
    <View
      testID="seat-turn-aura"
      style={{
        width: outer,
        height: outer,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {active ? (
        <View
          testID="seat-turn-aura-ring"
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              width: outer,
              height: outer,
              borderRadius: outer / 2,
            },
            ringStyle,
          ]}
        >
          {/* Punch center so only the ring reads (avatar sits above). */}
          {Platform.OS === "web" ? (
            <View
              style={{
                position: "absolute",
                top: TURN_AURA.RING_WIDTH,
                left: TURN_AURA.RING_WIDTH,
                right: TURN_AURA.RING_WIDTH,
                bottom: TURN_AURA.RING_WIDTH,
                borderRadius: size / 2,
                backgroundColor: "hsl(220, 22%, 6%)",
              }}
            />
          ) : null}
        </View>
      ) : null}

      <View style={{ width: size, height: size, zIndex: 1 }}>{children}</View>

      {active && countdownSeconds != null && countdownSeconds > 0 ? (
        <View
          testID="seat-turn-countdown"
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -2,
            right: -4,
            minWidth: 26,
            height: 26,
            paddingHorizontal: 6,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: TURN_AURA.BADGE_BG,
            borderWidth: 1.5,
            borderColor: TURN_AURA.BADGE_BORDER,
            zIndex: 3,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "900",
              color: TURN_AURA.BADGE_TEXT,
              fontVariant: ["tabular-nums"],
            }}
          >
            {countdownSeconds}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
