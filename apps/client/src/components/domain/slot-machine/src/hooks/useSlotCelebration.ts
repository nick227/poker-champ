import { useCallback, useState } from "react";
import { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { resolveWinFxTier, winFxHasPresentation, type WinFxTier } from "../engine/winFxTier";
import type { WinPresentation } from "../ui/slots/WinPresentationOverlay";

/** Celebration shared values, chrome styles, and tiered win presentation trigger. */
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
  const [presentation, setPresentation] = useState<WinPresentation | null>(null);

  const clearPresentation = useCallback(() => {
    setPresentation(null);
    setTimeout(() => setFxTier(null), 350);
  }, []);

  const playWinFx = useCallback(
    (isJackpot: boolean, winMultiplier: number, winCents: number, reducedMotion = false) => {
      const tier = resolveWinFxTier(isJackpot, winMultiplier);
      setFxTier(tier);

      winPulse.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 280 }),
      );
      buttonFlash.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 140 }),
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 280 }),
      );

      const bgPeak = tier === "small" ? 0.55 : 1;
      const bgHold = tier === "jackpot" ? 2000 : tier === "mega" ? 1400 : tier === "big" ? 1000 : 450;
      bgIntensity.value = withSequence(
        withTiming(bgPeak, { duration: 160, easing: Easing.out(Easing.quad) }),
        withTiming(bgPeak * 0.7, { duration: bgHold }),
        withTiming(0, { duration: 320 }),
      );

      if (winFxHasPresentation(tier)) {
        setPresentation({ tier: tier as Exclude<WinFxTier, "small">, winCents });
        if (!reducedMotion) {
          coinIntensity.value = withSequence(
            withTiming(1, { duration: 120 }),
            withTiming(1, { duration: bgHold }),
            withTiming(0, { duration: 200 }),
          );
        }
      } else {
        setPresentation(null);
        coinIntensity.value = 0;
      }

      if (tier === "jackpot") {
        jackpotPulse.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 1800 }));
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
          withTiming(1, { duration: 900 }),
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
