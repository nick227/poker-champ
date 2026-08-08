import { useEffect, useRef } from "react";
import { Animated, Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { getAvatarImageUri } from "@/lib/avatar";
import { getAvatarColors } from "./avatarColor";
import { AVATAR_RING, AVATAR_BADGE } from "../tokens/avatar.tokens";

/**
 * Procedural avatar: color-coded gradient-look disc (derived from `seed`),
 * initials or photo, an idle/active ring, a pulsing glow halo when it's this
 * seat's turn, and an optional overlapping status badge.
 *
 * Uses React Native's core `Animated` (not react-native-reanimated) for the
 * pulse — react-native-reanimated is a project dependency and is used
 * elsewhere (slot-machine UI), but importing it under this app's vitest
 * harness throws (`Cannot read properties of undefined (reading 'get')` from
 * NativeReanimatedModule — no native TurboModule shim is registered for
 * tests). Core Animated gives the same subtle pulse, is mockable the same
 * way the existing `src/__mocks__/react-native.ts` already stubs it, and
 * needs no changes to shared test config.
 */
export type AvatarDiscProps = {
  /** Stable identity seed (userId, falling back to display name) for deterministic coloring. */
  seed: string;
  initial: string;
  avatarUrl?: string | null;
  size: number;
  /** True while it's this seat's turn to act — drives the ring color + glow pulse. */
  isActiveTurn?: boolean;
  onPress?: () => void;
  /** Placeholder status/tier slot (e.g. seat number) — see PlayerPanel for why this isn't real rank data yet. */
  badgeLabel?: string | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function AvatarDisc({
  seed,
  initial,
  avatarUrl,
  size,
  isActiveTurn = false,
  onPress,
  badgeLabel,
  style,
  testID,
}: AvatarDiscProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isActiveTurn) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isActiveTurn, pulse]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  const colors = getAvatarColors(seed);
  const ringWidth = isActiveTurn ? AVATAR_RING.ACTIVE_WIDTH : AVATAR_RING.IDLE_WIDTH;
  const discSize = Math.max(0, size - (ringWidth + AVATAR_RING.PADDING) * 2);
  const uri = getAvatarImageUri(avatarUrl ?? undefined);
  const glowSize = size + AVATAR_RING.GLOW_SPREAD;

  const inner = (
    <View
      data-testid={testID}
      data-active-turn={isActiveTurn ? "true" : "false"}
      data-avatar-hue={String(colors.hue)}
      style={[{ width: size, height: size, justifyContent: "center", alignItems: "center" }, style]}
    >
      {isActiveTurn ? (
        <Animated.View
          pointerEvents="none"
          data-testid={testID ? `${testID}-glow` : undefined}
          style={{
            position: "absolute",
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 0,
                blurRadius: 14,
                color: AVATAR_RING.ACTIVE_GLOW_COLOR,
              },
            ],
          }}
        />
      ) : null}

      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor: isActiveTurn ? AVATAR_RING.ACTIVE_COLOR : colors.ring,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: discSize,
            height: discSize,
            borderRadius: discSize / 2,
            backgroundColor: colors.base,
            overflow: "hidden",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* Sheen + shade overlays fake a gradient (real gradients need expo-linear-gradient / react-native-svg,
              neither of which is an installed dependency in this repo — see report). */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: discSize * 0.95,
              height: discSize * 0.95,
              borderRadius: (discSize * 0.95) / 2,
              top: -discSize * 0.3,
              left: -discSize * 0.08,
              backgroundColor: colors.light,
              opacity: 0.55,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: discSize * 1.1,
              height: discSize * 1.1,
              borderRadius: (discSize * 1.1) / 2,
              bottom: -discSize * 0.4,
              right: -discSize * 0.2,
              backgroundColor: colors.dark,
              opacity: 0.4,
            }}
          />
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width: discSize, height: discSize, borderRadius: discSize / 2 }}
              resizeMode="cover"
            />
          ) : (
            <Text
              variant="label"
              className="font-bold"
              allowFontScaling={false}
              style={{
                fontSize: Math.max(11, Math.round(discSize * 0.34)),
                color: "hsla(0, 0%, 100%, 0.95)",
              }}
            >
              {initial}
            </Text>
          )}
        </View>
      </View>

      {badgeLabel != null && badgeLabel !== "" ? (
        <View
          data-testid={testID ? `${testID}-badge` : undefined}
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: AVATAR_BADGE.SIZE,
            height: AVATAR_BADGE.SIZE,
            borderRadius: AVATAR_BADGE.SIZE / 2,
            borderWidth: AVATAR_BADGE.BORDER_WIDTH,
            borderColor: AVATAR_BADGE.BORDER_COLOR,
            backgroundColor: AVATAR_BADGE.BG_COLOR,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            allowFontScaling={false}
            style={{ fontSize: AVATAR_BADGE.FONT_SIZE, fontWeight: "800", color: AVATAR_BADGE.TEXT_COLOR }}
          >
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>;
  }
  return inner;
}
