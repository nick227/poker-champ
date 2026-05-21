import { useEffect, useRef } from "react";
import { Animated, Modal, Platform, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { TournamentConfettiBurst } from "./TournamentConfettiBurst";
import {
  formatFinishPlace,
  type TournamentResultTier,
} from "./tournament-result.utils";

type TournamentInTheMoneyRevealProps = {
  visible: boolean;
  tier: Exclude<TournamentResultTier, "none">;
  finishPlace: number;
  payoutCents: number;
  onDismiss: () => void;
  onViewStandings: () => void;
  onBackToLobby: () => void;
};

const TIER_STYLES = {
  champion: {
    ribbon: "CHAMPION",
    headline: "You own the table.",
    subline: "Every chip. Every pot. Every seat. Yours.",
    cardBorder: "border-amber-400/70",
    cardBg: "bg-amber-950",
    placeClass: "text-amber-300",
    payoutClass: "text-amber-200 text-4xl font-black tracking-tight",
    glow: "bg-amber-500/25",
  },
  podium: {
    ribbon: "IN THE MONEY",
    headline: "Cash finish locked in.",
    subline: "Your payout is on the way to your balance.",
    cardBorder: "border-emerald-500/50",
    cardBg: "bg-panel-elevated",
    placeClass: "text-emerald-300",
    payoutClass: "text-text text-3xl font-bold",
    glow: "bg-emerald-500/15",
  },
} as const;

function useEntrancePulse(active: boolean) {
  const scale = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    scale.setValue(0.88);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [active, opacity, scale]);

  return { scale, opacity };
}

function useChampionGlow(active: boolean) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.75],
  });

  return { ringScale, ringOpacity };
}

export function TournamentInTheMoneyReveal({
  visible,
  tier,
  finishPlace,
  payoutCents,
  onDismiss,
  onViewStandings,
  onBackToLobby,
}: TournamentInTheMoneyRevealProps) {
  const { height } = useWindowDimensions();
  const styles = TIER_STYLES[tier];
  const isChampion = tier === "champion";
  const { scale, opacity } = useEntrancePulse(visible);
  const glow = useChampionGlow(visible && isChampion);

  useEffect(() => {
    if (!visible) return;
    if (isChampion) {
      emitSoundEvent("slot.jackpotFanfare");
      const t = setTimeout(() => emitSoundEvent("slot.jackpot"), 520);
      return () => clearTimeout(t);
    }
    emitSoundEvent("slot.win");
  }, [visible, isChampion]);

  const placeLabel = formatFinishPlace(finishPlace);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        className="flex-1 items-center justify-center px-4"
        style={{ backgroundColor: "rgba(0,0,0,0.88)", minHeight: height }}
      >
        <TournamentConfettiBurst active={isChampion} />
        {isChampion ? (
          <Animated.View
            pointerEvents="none"
            className="absolute h-72 w-72 rounded-full"
            style={{
              backgroundColor: "rgba(212,168,75,0.2)",
              transform: [{ scale: glow.ringScale }],
              opacity: glow.ringOpacity,
            }}
          />
        ) : null}
        <Animated.View
          style={{ opacity, transform: [{ scale }] }}
          className={`w-full max-w-md overflow-hidden rounded-2xl border-2 px-6 py-8 ${styles.cardBorder} ${styles.cardBg}`}
        >
            <View className={`absolute inset-0 ${styles.glow}`} pointerEvents="none" />
            <Text variant="label" className="text-center text-brand">
              {styles.ribbon}
            </Text>
            {isChampion ? (
              <Text className="mt-2 text-center text-6xl" accessibilityLabel="Trophy">
                🏆
              </Text>
            ) : null}
            <Text
              variant="h1"
              className={`mt-3 text-center ${styles.placeClass} ${isChampion ? "text-5xl" : ""}`}
            >
              {placeLabel} place
            </Text>
            <Text variant="body" className="mt-2 text-center">
              {styles.headline}
            </Text>
            <Text className={`mt-4 text-center ${styles.payoutClass}`}>{formatCents(payoutCents)}</Text>
            <Text variant="muted" className="mt-2 text-center">
              {styles.subline}
            </Text>
            <View className="mt-6 gap-y-2">
              <Button title="View standings" intent="primary" onPress={onViewStandings} />
              <Button title="Back to lobby" intent="ghost" onPress={onBackToLobby} />
              <Button title="Keep watching" intent="ghost" size="sm" onPress={onDismiss} />
            </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
