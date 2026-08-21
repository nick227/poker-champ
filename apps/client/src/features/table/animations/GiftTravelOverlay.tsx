import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Text } from "@/components/base/Text";
import type { Rect } from "./animationTypes";

/** How far above the straight-line path a gift arcs at its midpoint (px). */
const ARC_HEIGHT_PX = 40;
/** Landing flourish (pop + fade) once a gift reaches its destination. */
const LANDING_MS = 200;
const LANDING_SCALE = 1.35;
const START_SCALE = 0.5;

const OVERLAY_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 98,
  pointerEvents: "none" as const,
};

export type GiftTravelPlan = {
  id: string;
  from: Rect;
  to: Rect;
  emoji: string;
  durationMs: number;
  recipientUserId: string;
  catalogKey: string;
};

type GiftInstanceProps = {
  plan: GiftTravelPlan;
  onComplete: (id: string) => void;
};

function GiftTravelInstance({ plan, onComplete }: GiftInstanceProps) {
  const { from, to, emoji, durationMs, id } = plan;
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const originX = from.x + from.width / 2;
  const originY = from.y + from.height / 2;

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(START_SCALE)).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const arcMidY = dy / 2 - ARC_HEIGHT_PX;

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: dx,
        duration: durationMs,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: arcMidY,
          duration: durationMs * 0.5,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(translateY, {
          toValue: dy,
          duration: durationMs * 0.5,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 1,
        duration: Math.min(120, durationMs * 0.3),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: durationMs,
        useNativeDriver: true,
        easing: Easing.out(Easing.quad),
      }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: LANDING_SCALE,
          duration: LANDING_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: LANDING_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onCompleteRef.current(id);
      });
    });
  }, [dx, dy, durationMs, id, translateX, translateY, opacity, scale]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.giftWrap,
          {
            left: originX - 16,
            top: originY - 16,
            opacity,
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
      >
        <Text style={styles.emojiText}>{emoji}</Text>
      </Animated.View>
    </View>
  );
}

export type GiftTravelOverlayProps = {
  requests: GiftTravelPlan[];
  onRequestComplete: (id: string) => void;
};

export function GiftTravelOverlay({ requests, onRequestComplete }: GiftTravelOverlayProps) {
  const items = useMemo(() => requests, [requests]);
  if (items.length === 0) return null;
  return (
    <View style={OVERLAY_STYLE}>
      {items.map((plan) => (
        <GiftTravelInstance key={plan.id} plan={plan} onComplete={onRequestComplete} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  giftWrap: {
    position: "absolute",
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: 28,
    lineHeight: 32,
  },
});
