import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { LoadingIndicatorMinimal } from "./LoadingIndicatorMinimal";
import { getTipRotation } from "./loadingTips";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";

export type TableLoadingMode = "auth_loading" | "auth_required" | "connecting";

export type TableLoadingLandingProps = {
  mode: TableLoadingMode;
  statusMessage: string;
  tableId?: string;
  onReturnToLobby: () => void;
  onGoToLogin?: () => void;
  reducedMotion?: boolean;
};

const BRAND_MARK = require("../../../../../assets/images/spades.png");
const LANDING_MAX_WIDTH = 680;
const TIP_BLOCK_MIN_HEIGHT = 124;
const TIP_ROTATE_MS = 3800;
const REVEAL_DELAY_MS = 90;
/** Match slot machine longest reel spin (SlotMachine SPIN_DURATIONS max 1400ms). */
const ONE_SPIN_MS = 1500;
const SLOT_LANDING_MIN_HEIGHT = 380;

function revealStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  };
}

export function TableLoadingLanding({
  mode,
  statusMessage,
  tableId,
  onReturnToLobby,
  onGoToLogin,
  reducedMotion,
}: TableLoadingLandingProps) {
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const tips = useMemo(() => getTipRotation(tableId ?? "session", 4), [tableId]);
  const safeTips = tips.length > 0 ? tips : getTipRotation("session", 1);
  const [tipIndex, setTipIndex] = useState(0);
  const tipOpacity = useRef(new Animated.Value(1)).current;
  const pulseValue = useRef(new Animated.Value(0.8)).current;
  const brandReveal = useRef(new Animated.Value(0)).current;
  const tipReveal = useRef(new Animated.Value(0)).current;
  const slotReveal = useRef(new Animated.Value(0)).current;
  const actionReveal = useRef(new Animated.Value(0)).current;

  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);
  const [loadingUiVisible, setLoadingUiVisible] = useState(false);

  useEffect(() => {
    setLoadingUiVisible(false);
    const t = setTimeout(() => setLoadingUiVisible(true), ONE_SPIN_MS);
    return () => clearTimeout(t);
  }, [tableId]);

  useEffect(() => {
    setTipIndex(0);
    tipOpacity.setValue(1);
  }, [tableId, tipOpacity]);

  useEffect(() => {
    if (safeTips.length <= 1) return;
    const timer = setInterval(() => {
      if (reducedMotion) {
        setTipIndex((value) => (value + 1) % safeTips.length);
        return;
      }
      Animated.timing(tipOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        setTipIndex((value) => (value + 1) % safeTips.length);
        Animated.timing(tipOpacity, {
          toValue: 1,
          duration: 280,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    }, TIP_ROTATE_MS);

    return () => clearInterval(timer);
  }, [reducedMotion, safeTips.length, tipOpacity]);

  useEffect(() => {
    const revealValues = [brandReveal, tipReveal, slotReveal, actionReveal];
    if (reducedMotion) {
      revealValues.forEach((value) => value.setValue(1));
      return;
    }
    revealValues.forEach((value) => value.setValue(0));
    const sequence = Animated.sequence([
      Animated.delay(REVEAL_DELAY_MS),
      Animated.timing(brandReveal, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(tipReveal, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slotReveal, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(actionReveal, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    sequence.start();
    return () => sequence.stop();
  }, [actionReveal, brandReveal, mode, reducedMotion, slotReveal, tableId, tipReveal]);

  useEffect(() => {
    if (reducedMotion) {
      pulseValue.setValue(0.85);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.05,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 0.8,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseValue, reducedMotion]);

  const currentBankroll = slotBankroll ?? bankroll;
  const minBetCents = 100;
  const effectiveBankroll =
    currentBankroll != null && currentBankroll >= minBetCents ? currentBankroll : undefined;

  return (
    <View
      className="flex-1"
      style={{
        paddingHorizontal: compact ? 12 : 16,
        paddingVertical: compact ? 12 : 20,
        justifyContent: "flex-start",
      }}
    >
      <View
        className="mx-auto w-full loading-inner-container px-5 py-5"
        style={{ maxWidth: LANDING_MAX_WIDTH, paddingHorizontal: compact ? 14 : 20, paddingVertical: compact ? 14 : 20 }}
      >
        <View
          className="absolute h-28 w-28 rounded-full bg-brand/10"
          style={{ left: -28, top: -30 }}
        />
        <View
          className="absolute h-24 w-24 rounded-full bg-felt/25"
          style={{ bottom: -36, right: -24 }}
        />

        <Animated.View
          className="mb-4 flex-row items-center justify-center gap-2"
          accessibilityRole="header"
          style={revealStyle(brandReveal)}
        >
          <Animated.View
            className="h-9 w-9 items-center justify-center rounded-full bg-brand/10"
            style={{ transform: [{ scale: pulseValue }] }}
          >
            <View className="h-7 w-7 overflow-hidden rounded-full border border-brand/30 bg-panel-elevated">
              <Image
                source={BRAND_MARK}
                resizeMode="cover"
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          </Animated.View>
          <Text variant="label" className="normal-case text-xl tracking-normal text-text-subtle">
            Loading...
          </Text>
        </Animated.View>

        <Animated.View
          className="mt-2"
          style={[revealStyle(tipReveal), { minHeight: compact ? 108 : TIP_BLOCK_MIN_HEIGHT }]}
        >
        </Animated.View>

        <Animated.View
          className="mt-4 overflow-hidden rounded-2xl border border-border-subtle bg-panel-elevated"
          style={[revealStyle(slotReveal), { minHeight: SLOT_LANDING_MIN_HEIGHT }]}
        >
          <ThemeProvider initialThemeId="poker-champ-dark">
            <SlotMachine bankrollCents={effectiveBankroll} onBankrollChange={setSlotBankroll} />
          </ThemeProvider>
        </Animated.View>

        {loadingUiVisible ? (
          <Animated.View className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-border-subtle bg-panel-elevated px-4 py-3">
            <LoadingIndicatorMinimal reducedMotion={reducedMotion} />
            <Text variant="muted" className="text-text-subtle my-4">
              {statusMessage}
            </Text>
          </Animated.View>
        ) : null}
    </View>
    </View>
  );
}
