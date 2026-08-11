import { useCallback, useState } from "react";
import { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import {
  resolveWinFxTier,
  scaleWinFx,
  winFxHasPresentation,
  type WinFxScale,
  type WinFxTier,
} from "../engine/winFxTier";
import type { WinPresentation } from "../ui/slots/WinPresentationOverlay";

/** Celebration shared values, chrome styles, and win-scaled background FX. */
export function useSlotCelebration() {
  const pressScale = useSharedValue(1);
  const winPulse = useSharedValue(0);
  const jackpotPulse = useSharedValue(0);
  const buttonFlash = useSharedValue(0);
  const bannerFlash = useSharedValue(0);
  const screenShake = useSharedValue(0);
  const victoryTextOpacity = useSharedValue(0);
  const victoryTextScale = useSharedValue(0);
  const bgIntensity = useSharedValue(0);
  const coinIntensity = useSharedValue(0);

  const [fxTier, setFxTier] = useState<WinFxTier | null>(null);
  const [fxScale, setFxScale] = useState<WinFxScale | null>(null);
  const [fxBurstKey, setFxBurstKey] = useState(0);
  const [presentation, setPresentation] = useState<WinPresentation | null>(null);

  const clearPresentation = useCallback(() => {
    setPresentation(null);
  }, []);

  const playWinFx = useCallback(
    (isJackpot: boolean, winMultiplier: number, winCents: number, reducedMotion = false) => {
      const tier = resolveWinFxTier(isJackpot, winMultiplier);
      const scale = scaleWinFx(winMultiplier, isJackpot);
      setFxTier(tier);
      setFxScale(scale);
      setFxBurstKey((k) => k + 1);

      winPulse.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: Math.min(500, scale.holdMs * 0.25) }),
      );
      buttonFlash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 140 }),
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 280 }),
      );

      bgIntensity.value = withSequence(
        withTiming(scale.peak, { duration: 140, easing: Easing.out(Easing.quad) }),
        withTiming(scale.peak * 0.75, { duration: scale.holdMs }),
        withTiming(0, { duration: 360 }),
      );

      if (!reducedMotion) {
        coinIntensity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withTiming(1, { duration: scale.holdMs }),
          withTiming(0, { duration: 220 }),
        );
      } else {
        coinIntensity.value = 0;
      }

      if (winFxHasPresentation(tier)) {
        setPresentation({ tier: tier as Exclude<WinFxTier, "small">, winCents });
      } else {
        setPresentation(null);
      }

      // Clear active FX flag after hold so idle stays cheap
      setTimeout(() => {
        setFxTier(null);
        setFxScale(null);
      }, scale.holdMs + 500);

      if (tier === "jackpot") {
        jackpotPulse.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: scale.holdMs }));
        bannerFlash.value = withSequence(
          withTiming(1, { duration: 120 }),
          withTiming(0, { duration: 160 }),
          withTiming(1, { duration: 120 }),
          withTiming(0, { duration: 500 }),
        );
        if (!reducedMotion) {
          screenShake.value = withSequence(
            withTiming(1, { duration: 40 }),
            withTiming(-1, { duration: 40 }),
            withTiming(0.5, { duration: 30 }),
            withTiming(0, { duration: 40 }),
          );
        }
        victoryTextOpacity.value = withSequence(
          withTiming(1, { duration: 220 }),
          withTiming(1, { duration: Math.min(1400, scale.holdMs * 0.4) }),
          withTiming(0, { duration: 280 }),
        );
        victoryTextScale.value = withSequence(withTiming(1.15, { duration: 220 }), withTiming(1, { duration: 160 }));
        setTimeout(() => emitSoundEvent("slot.jackpot"), 80);
        setTimeout(() => emitSoundEvent("slot.jackpotFanfare"), 500);
      }

      try {
        if (tier === "small" && winMultiplier < 3) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        /* native only */
      }
    },
    [
      winPulse,
      buttonFlash,
      bgIntensity,
      coinIntensity,
      jackpotPulse,
      bannerFlash,
      screenShake,
      victoryTextOpacity,
      victoryTextScale,
    ],
  );

  const spinBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const winBannerStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + winPulse.value * 0.45,
    shadowColor: winPulse.value > 0.5 ? "#FFD700" : "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: winPulse.value * 0.8,
    shadowRadius: winPulse.value * 12,
    elevation: winPulse.value > 0.5 ? 8 : 0,
  }));
  const jackpotBannerStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + jackpotPulse.value * 0.25,
    shadowColor: jackpotPulse.value > 0.3 ? "#FF6B35" : "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: jackpotPulse.value * 0.85,
    shadowRadius: jackpotPulse.value * 16,
    elevation: jackpotPulse.value > 0.3 ? 12 : 0,
  }));
  const spinBtnFlashStyle = useAnimatedStyle(() => ({
    borderColor: buttonFlash.value > 0.5 ? "#fff4c2" : "#e6b422",
    shadowOpacity: 0.35 + buttonFlash.value * 0.5,
  }));
  const screenShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenShake.value * 2 }, { translateY: screenShake.value }],
  }));
  const victoryTextStyle = useAnimatedStyle(() => ({
    opacity: victoryTextOpacity.value,
    transform: [{ scale: Math.max(0.01, victoryTextScale.value || 1) }],
  }));
  const jackpotBannerFlashStyle = useAnimatedStyle(() => ({
    opacity: bannerFlash.value > 0.5 ? 1 : 0.85,
  }));

  return {
    values: { pressScale },
    playWinFx,
    fxTier,
    fxScale,
    fxBurstKey,
    presentation,
    clearPresentation,
    bgIntensity,
    coinIntensity,
    styles: {
      spinBtnStyle,
      winBannerStyle,
      jackpotBannerStyle,
      spinBtnFlashStyle,
      screenShakeStyle,
      victoryTextStyle,
      jackpotBannerFlashStyle,
    },
  };
}
