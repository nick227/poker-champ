import React, { useCallback, useMemo, useState } from "react";
import { View, ImageSourcePropType, Text } from "react-native";
import { Easing, runOnJS, withSequence, withTiming, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";
import { formatCents } from "../../engine/format";
import { DEFAULT_PAYOUT_TIERS, tierForProbability } from "../../engine/tuning";
import { normalizeReelPositions } from "../../engine/reelMath";
import { Classic3 } from "../../games/classic3";
import type { SlotGame, SlotOutcomeKind, SymbolKey } from "../../games/types";

import { useControlledBankroll } from "../../hooks/useControlledBankroll";
import { useBetTier } from "../../hooks/useBetTier";
import { useSlotEngine } from "../../hooks/useSlotEngine";
import { useSpinLock } from "../../hooks/useSpinLock";
import { useSlotSpin } from "../../hooks/useSlotSpin";

import { emitSoundEvent } from "@/sound/emitSoundEvent";
import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { MarqueeLights } from "./MarqueeLights";
import { ReelWindow } from "./ReelWindow";
import { WinBanner } from "./WinBanner";
import { JackpotBanner } from "./JackpotBanner";

const SYMBOL_HEIGHT = 110;
const PAD_ROWS = 2;
const REEL_REPEAT_COUNT = 7;
const BASE_COPY_INDEX = 2;
const EXTRA_LOOPS: readonly [number, number, number] = [1, 2, 2];
const SPIN_DURATIONS = [900, 1150, 1400] as const;

function getReelOffsetForPosition(stripLen: number, reelPosition: number): number {
  return -((PAD_ROWS + BASE_COPY_INDEX * stripLen + reelPosition - 1) * SYMBOL_HEIGHT);
}

function toOddsText(probability: number): string {
  if (probability <= 0) return "n/a";
  return `1 in ${Math.max(1, Math.round(1 / probability)).toLocaleString()}`;
}

function outcomeLabel(kind: SlotOutcomeKind, combo: string, matchedSymbol?: SymbolKey): string {
  if (kind === "TRIPLE") return combo;
  if (kind === "PAIR") return `Pair ${matchedSymbol ?? ""}`.trim();
  if (kind === "ANY_SEVEN") return "Any 7";
  return "No Match";
}

const ASSETS = {
  symbols: {
    A: require("../../../assets/symbols/A.png"),
    B: require("../../../assets/symbols/B.png"),
    C: require("../../../assets/symbols/C.png"),
    D: require("../../../assets/symbols/D.png"),
    E: require("../../../assets/symbols/E.png"),
    F: require("../../../assets/symbols/F.png"),
    "7": require("../../../assets/symbols/7.png"),
  } satisfies Record<SymbolKey, ImageSourcePropType>,
};

export function SlotMachine({
  onSpinComplete,
  game = Classic3,
  symbolMap,
  bankrollCents,
  onBankrollChange,
  baseBetCents = 100,
  initialBankrollCents = 25_00,
  jackpotBannerCents,
}: {
  onSpinComplete?: (winCents: number) => void;
  game?: SlotGame;
  symbolMap?: Partial<Record<SymbolKey, ImageSourcePropType>>;
  bankrollCents?: number;
  onBankrollChange?: (nextCents: number) => void;
  baseBetCents?: number;
  initialBankrollCents?: number;
  jackpotBannerCents?: number;
}) {
  const { theme } = useTheme();

  const s = useMemo(
    () =>
      makeStyles(theme, (t) => ({
        root: { flex: 1, backgroundColor: 'transparent' },
        safe: {
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-start",
          paddingHorizontal: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
        stack: { width: "100%", maxWidth: 760, gap: t.space.md },
        machine: {
          width: "100%",
          gap: t.space.md,
          backgroundColor: t.colors.bg1,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: t.space.md,
        },
        reelShell: {
          width: "100%",
          backgroundColor: t.colors.panel2,
          borderWidth: 1,
          borderColor: t.colors.border,
          overflow: "hidden",
          position: "relative",
          paddingHorizontal: 10,
        },
        reelsRow: {
          width: "100%",
          height: 330,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        },
        reelCol: {
          flex: 1,
          height: "100%",
          minWidth: 0,
        },
        betPanel: {
          width: "100%",
          backgroundColor: t.colors.panel,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: t.space.md,
          gap: t.space.sm,
        },
        sectionTitle: {
          fontSize: 11,
          letterSpacing: t.type.trackingWide,
          fontWeight: t.type.weightBold,
          color: t.colors.textMuted,
          textTransform: "uppercase",
        },
        betValue: {
          fontSize: 18,
          color: t.colors.text,
          fontWeight: t.type.weightHeavy,
          letterSpacing: 1,
        },
        betRow: { flexDirection: "row", gap: t.space.sm, width: "100%" },
        footerHint: { marginTop: 4, fontSize: 12, color: t.colors.textMuted, textAlign: "center", lineHeight: 16 },
      })),
    [theme],
  );

  const { bankrollCents: bank, setBankrollCents: setBank } = useControlledBankroll({
    bankrollCents,
    onBankrollChange,
    initialBankrollCents,
  });

  const lock = useSpinLock();
  const { tier, setTier, betCents } = useBetTier(baseBetCents);
  const engine = useSlotEngine(game);
  const payoutTiers = useMemo(() => game.payoutTiers ?? DEFAULT_PAYOUT_TIERS, [game]);
  const reelLens = useMemo(
    () => {
      const lens = [game.reels[0].length, game.reels[1].length, game.reels[2].length] as const;
      return Object.freeze(lens);
    },
    [game.reels[0].length, game.reels[1].length, game.reels[2].length],
  );

  const symbols = useMemo(() => ({ ...ASSETS.symbols, ...(symbolMap ?? {}) }), [symbolMap]);
  const y0 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);

  const pressScale = useSharedValue(1);
  const winPulse = useSharedValue(0);
  const jackpotPulse = useSharedValue(0);

  const reelPosRef = React.useRef<[number, number, number]>([0, 0, 0]);

  React.useEffect(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    y0.value = getReelOffsetForPosition(reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(reelLens[2], nextPos[2]);
  }, [reelLens, y0, y1, y2]);

  const reelStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: y0.value }] }));
  const reelStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }] }));
  const reelStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }] }));

  const spinBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const winBannerStyle = useAnimatedStyle(() => ({ opacity: 0.55 + winPulse.value * 0.45, transform: [{ scale: 1 + winPulse.value * 0.02 }] }));
  const jackpotBannerStyle = useAnimatedStyle(() => ({ opacity: 0.75 + jackpotPulse.value * 0.25, transform: [{ scale: 1 + jackpotPulse.value * 0.01 }] }));

  const normalizeReelPositionsCallback = useCallback(() => {
    const nextPos = normalizeReelPositions(reelPosRef.current, reelLens);
    reelPosRef.current = nextPos;
    y0.value = getReelOffsetForPosition(reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(reelLens[2], nextPos[2]);
  }, [reelLens, y0, y1, y2]);

  const spinTo = useCallback(
    async (stops: readonly [number, number, number]) => {
      const startPos = [...reelPosRef.current] as [number, number, number];
      const deltas = [
        (stops[0] - (startPos[0] % reelLens[0]) + reelLens[0]) % reelLens[0],
        (stops[1] - (startPos[1] % reelLens[1]) + reelLens[1]) % reelLens[1],
        (stops[2] - (startPos[2] % reelLens[2]) + reelLens[2]) % reelLens[2],
      ] as const;
      const steps = [
        deltas[0] + EXTRA_LOOPS[0] * reelLens[0],
        deltas[1] + EXTRA_LOOPS[1] * reelLens[1],
        deltas[2] + EXTRA_LOOPS[2] * reelLens[2],
      ] as const;
      const targets = [
        getReelOffsetForPosition(reelLens[0], startPos[0] + steps[0]),
        getReelOffsetForPosition(reelLens[1], startPos[1] + steps[1]),
        getReelOffsetForPosition(reelLens[2], startPos[2] + steps[2]),
      ] as const;

      // MVP Rule: Add timeout safety to prevent soft-locks
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Animation timeout")), 2000);
      });

      const animationPromise = new Promise<void>((resolve) => {
        let completed = 0;
        const onFinish = (reel: 0 | 1 | 2) => {
          reelPosRef.current[reel] = (startPos[reel] + steps[reel]) % reelLens[reel];
          completed += 1;
          if (completed === 3) resolve();
        };

        y0.value = withTiming(targets[0], { duration: SPIN_DURATIONS[0], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(0);
        });
        y1.value = withTiming(targets[1], { duration: SPIN_DURATIONS[1], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(1);
        });
        y2.value = withTiming(targets[2], { duration: SPIN_DURATIONS[2], easing: Easing.out(Easing.cubic) }, (f) => {
          if (f) runOnJS(onFinish)(2);
        });
      });

      try {
        await Promise.race([animationPromise, timeoutPromise]);
      } catch (error) {
        console.warn("[slot] Animation timeout or error", error);
        // Continue with spin even if animation fails
      }
    },
    [reelLens, y0, y1, y2],
  );

  const { machineOutput, handleSpin } = useSlotSpin({
    bank,
    betCents,
    engine,
    lock,
    onSpinComplete,
    payoutTiers,
    setBank,
    spinTo,
    normalizeReelPositions: normalizeReelPositionsCallback,
    pressScale,
    winPulse,
    jackpotPulse,
  });

  const canSpin = useMemo(() => !lock.locked && bank >= betCents, [lock.locked, bank, betCents]);

  const jackpotValueCents = useMemo(() => {
    if (jackpotBannerCents !== undefined) return jackpotBannerCents;
    
    const jackpotKey = game.jackpotKey;
    const paytable = game.paytable;
    
    if (!jackpotKey || !paytable || !(jackpotKey in paytable)) {
      console.warn(`[slot] Jackpot key "${jackpotKey}" not found in paytable`);
      return 0;
    }
    
    // MVP Rule: paytable[jackpotKey] is a multiplier (e.g., 100x bet)
    const jackpotMultiplier = paytable[jackpotKey];
    return jackpotMultiplier * betCents;
  }, [betCents, game.jackpotKey, game.paytable, jackpotBannerCents]);

  return (
    <View style={s.root}>
      <View style={s.safe}>
        <View style={s.stack}>
          <View style={s.machine}>
            <JackpotBanner title="777 Jackpot" value={formatCents(jackpotValueCents)} animatedStyle={jackpotBannerStyle} />

            <MarqueeLights active={lock.locked} />

            <View style={s.reelShell}>
              <View style={s.reelsRow}>
                <View style={s.reelCol}>
                  <ReelWindow strip={game.reels[0]} symbols={symbols} symbolHeight={SYMBOL_HEIGHT} animatedStyle={reelStyle0} repeatCount={REEL_REPEAT_COUNT} />
                </View>
                <View style={s.reelCol}>
                  <ReelWindow strip={game.reels[1]} symbols={symbols} symbolHeight={SYMBOL_HEIGHT} animatedStyle={reelStyle1} repeatCount={REEL_REPEAT_COUNT} />
                </View>
                <View style={s.reelCol}>
                  <ReelWindow strip={game.reels[2]} symbols={symbols} symbolHeight={SYMBOL_HEIGHT} animatedStyle={reelStyle2} repeatCount={REEL_REPEAT_COUNT} />
                </View>
              </View>

            </View>

            <MarqueeLights active={lock.locked} />

            <WinBanner text={machineOutput} animatedStyle={winBannerStyle} />

            <View style={s.betPanel}>
              <Text style={s.sectionTitle}>Bet</Text>
              <Text style={s.betValue}>{formatCents(betCents)}</Text>
              <View style={s.betRow}>
                <Chip label="1/2" active={tier === "HALF"} onPress={() => setTier("HALF")} disabled={lock.locked} />
                <Chip label="1x" active={tier === "FULL"} onPress={() => setTier("FULL")} disabled={lock.locked} />
                <Chip label="2x" active={tier === "DOUBLE"} onPress={() => setTier("DOUBLE")} disabled={lock.locked} />
              </View>
            </View>

            <PrimaryButton title="SPIN" subtitle={canSpin ? "PUSH" : "WAIT"} disabled={!canSpin} onPress={handleSpin} animatedStyle={spinBtnStyle} />

          </View>
        </View>
      </View>
    </View>
  );
}
