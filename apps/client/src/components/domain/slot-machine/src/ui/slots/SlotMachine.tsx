import React, { useCallback, useMemo, useState } from "react";
import { View, ImageSourcePropType, Text } from "react-native";
import { Easing, runOnJS, withSequence, withTiming, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "../../theme/ThemeProvider";
import { makeStyles } from "../../theme/styleEngine";
import { formatCents } from "../../engine/format";
import { DEFAULT_PAYOUT_TIERS, tierForProbability } from "../../engine/tuning";
import { Classic3 } from "../../games/classic3";
import type { SlotGame, SlotOutcomeKind, SymbolKey } from "../../games/types";

import { useControlledBankroll } from "../../hooks/useControlledBankroll";
import { useBetTier } from "../../hooks/useBetTier";
import { useSlotEngine } from "../../hooks/useSlotEngine";
import { useSpinLock } from "../../hooks/useSpinLock";

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
        root: { flex: 1, backgroundColor: t.colors.bg0 },
        safe: {
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-start",
          paddingHorizontal: t.space.lg,
          paddingTop: t.space.md,
          paddingBottom: t.space.lg,
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
    () => [game.reels[0].length, game.reels[1].length, game.reels[2].length] as const,
    [game],
  );

  const symbols = useMemo(() => ({ ...ASSETS.symbols, ...(symbolMap ?? {}) }), [symbolMap]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [machineOutput, setMachineOutput] = useState("No Match");
  const y0 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const y2 = useSharedValue(0);

  const pressScale = useSharedValue(1);
  const winPulse = useSharedValue(0);
  const jackpotPulse = useSharedValue(0);

  const reelPosRef = React.useRef<[number, number, number]>([0, 0, 0]);
  const prevReelLensRef = React.useRef<[number, number, number] | null>(null);

  React.useEffect(() => {
    const prev = prevReelLensRef.current;
    const sameLens =
      prev != null &&
      prev[0] === reelLens[0] &&
      prev[1] === reelLens[1] &&
      prev[2] === reelLens[2];
    if (sameLens) return;

    prevReelLensRef.current = [reelLens[0], reelLens[1], reelLens[2]];
    const nextPos: [number, number, number] = [
      reelPosRef.current[0] % reelLens[0],
      reelPosRef.current[1] % reelLens[1],
      reelPosRef.current[2] % reelLens[2],
    ];
    reelPosRef.current = nextPos;
    y0.value = getReelOffsetForPosition(reelLens[0], nextPos[0]);
    y1.value = getReelOffsetForPosition(reelLens[1], nextPos[1]);
    y2.value = getReelOffsetForPosition(reelLens[2], nextPos[2]);
  }, [reelLens[0], reelLens[1], reelLens[2]]);

  const reelStyle0 = useAnimatedStyle(() => ({ transform: [{ translateY: y0.value }] }));
  const reelStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: y1.value }] }));
  const reelStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: y2.value }] }));

  const spinBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const winBannerStyle = useAnimatedStyle(() => ({ opacity: 0.55 + winPulse.value * 0.45, transform: [{ scale: 1 + winPulse.value * 0.02 }] }));
  const jackpotBannerStyle = useAnimatedStyle(() => ({ opacity: 0.75 + jackpotPulse.value * 0.25, transform: [{ scale: 1 + jackpotPulse.value * 0.01 }] }));

  const canSpin = useMemo(() => !isSpinning && !lock.locked && bank >= betCents, [isSpinning, lock.locked, bank, betCents]);

  const normalizeReelPositions = useCallback(() => {
    const nextPos: [number, number, number] = [
      reelPosRef.current[0] % reelLens[0],
      reelPosRef.current[1] % reelLens[1],
      reelPosRef.current[2] % reelLens[2],
    ];
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

      await new Promise<void>((resolve) => {
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
    },
    [reelLens, y0, y1, y2],
  );

  const cueSmallWin = useCallback(() => {
    winPulse.value = 0;
    winPulse.value = withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 220 }));
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [winPulse]);

  const cueJackpot = useCallback(() => {
    jackpotPulse.value = 0;
    winPulse.value = 0;
    jackpotPulse.value = withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }));
    winPulse.value = withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 480 }));
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, [jackpotPulse, winPulse]);

  const handleSpin = useCallback(async () => {
    if (isSpinning || lock.locked || bank < betCents) return;

    setIsSpinning(true);
    lock.lock();
    setMachineOutput("Spinning...");
    normalizeReelPositions();

    emitSoundEvent("slot.pull");
    emitSoundEvent("slot.reelSpin");

    try {
      void Haptics.selectionAsync();
    } catch {}
    pressScale.value = withSequence(withTiming(0.97, { duration: 50, easing: Easing.out(Easing.quad) }), withTiming(1.0, { duration: 90, easing: Easing.out(Easing.quad) }));

    try {
      const { stops, result, winUnits, isJackpot, outcomeKind, matchedSymbol, probability } = engine.spin();
      await spinTo(stops);
      emitSoundEvent("slot.reelStop");

      const win = winUnits * betCents;
      setBank((b) => Math.max(0, b - betCents + win));
      const combo = result.join("-");
      if (win > 0) {
        emitSoundEvent("slot.win");
        const tierLabel = tierForProbability(probability, isJackpot, payoutTiers).label;
        const odds = toOddsText(probability);
        const outcome = outcomeLabel(outcomeKind, combo, matchedSymbol);
        setMachineOutput(`${tierLabel}: ${outcome} pays ${formatCents(win)} (${odds})`);
        isJackpot ? cueJackpot() : cueSmallWin();
      } else {
        setMachineOutput(`No Match`);
      }

      if (onSpinComplete) onSpinComplete(win);
    } catch (error) {
      console.warn("[slot] spin aborted", error);
      setMachineOutput("Spin Failed");
    } finally {
      setIsSpinning(false);
      lock.unlock();
    }
  }, [bank, betCents, cueJackpot, cueSmallWin, engine, isSpinning, lock, normalizeReelPositions, onSpinComplete, payoutTiers, pressScale, setBank, spinTo]);

  const jackpotValueCents = useMemo(
    () => jackpotBannerCents ?? (game.paytable[game.jackpotKey] ?? 0) * betCents,
    [betCents, game.jackpotKey, game.paytable, jackpotBannerCents],
  );

  return (
    <View style={s.root}>
      <View style={s.safe}>
        <View style={s.stack}>
          <View style={s.machine}>
            <JackpotBanner title="777 Jackpot" value={formatCents(jackpotValueCents)} animatedStyle={jackpotBannerStyle} />

            <MarqueeLights active={isSpinning} />

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

            <MarqueeLights active={isSpinning} />

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
