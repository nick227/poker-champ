import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, View, ImageSourcePropType } from "react-native";
import Animated from "react-native-reanimated";

import { formatCents } from "../../engine/format";
import { Classic3 } from "../../games/classic3";
import type { SlotGame, SymbolKey } from "../../games/types";

import { useControlledBankroll } from "../../hooks/useControlledBankroll";
import { useBetTier } from "../../hooks/useBetTier";
import { useSlotEngine } from "../../hooks/useSlotEngine";
import { useSpinLock } from "../../hooks/useSpinLock";
import { useSlotSpin } from "../../hooks/useSlotSpin";
import { useSlotReelMotion } from "../../hooks/useSlotReelMotion";
import { useSlotCelebration } from "../../hooks/useSlotCelebration";

import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { MachineCabinet } from "./MachineCabinet";
import { ReelStage } from "./ReelStage";
import { ReelWindow } from "./ReelWindow";
import { WinBanner } from "./WinBanner";
import { JackpotBanner } from "./JackpotBanner";
import { VictoryText } from "./VictoryText";
import { WinBackgroundFX } from "./WinBackgroundFX";
import { CoinRain } from "./CoinRain";
import { WinPresentationOverlay } from "./WinPresentationOverlay";

const SYMBOL_HEIGHT = 120;
const REEL_REPEAT_COUNT = 7;

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
  onSpinStart,
  game = Classic3,
  symbolMap,
  bankrollCents,
  onBankrollChange,
  baseBetCents = 100,
  initialBankrollCents = 25_00,
  jackpotBannerCents,
  reducedMotion: reducedMotionProp,
}: {
  onSpinComplete?: (winCents: number) => void;
  onSpinStart?: () => void;
  game?: SlotGame;
  symbolMap?: Partial<Record<SymbolKey, ImageSourcePropType>>;
  bankrollCents?: number;
  onBankrollChange?: (nextCents: number) => void;
  baseBetCents?: number;
  initialBankrollCents?: number;
  jackpotBannerCents?: number;
  reducedMotion?: boolean;
}) {
  const [reducedMotionSystem, setReducedMotionSystem] = useState(false);
  useEffect(() => {
    if (reducedMotionProp != null) return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReducedMotionSystem(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotionSystem);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [reducedMotionProp]);
  const reducedMotion = reducedMotionProp ?? reducedMotionSystem;

  const { bankrollCents: bank, setBankrollCents: setBank } = useControlledBankroll({
    bankrollCents,
    onBankrollChange,
    initialBankrollCents,
  });

  const lock = useSpinLock();
  const { tier, setTier, betCents } = useBetTier(baseBetCents);
  const engine = useSlotEngine(game);
  const reelLens = useMemo(() => {
    const lens = [game.reels[0].length, game.reels[1].length, game.reels[2].length] as const;
    return Object.freeze(lens);
  }, [game.reels]);

  const symbols = useMemo(() => ({ ...ASSETS.symbols, ...(symbolMap ?? {}) }), [symbolMap]);
  const motion = useSlotReelMotion(reelLens);
  const celebration = useSlotCelebration();

  const { machineOutput, handleSpin } = useSlotSpin({
    bank,
    betCents,
    engine,
    lock,
    onSpinComplete,
    onSpinStart,
    setBank,
    spinTo: motion.spinTo,
    normalizeReelPositions: motion.normalize,
    pressScale: celebration.values.pressScale,
    playWinFx: celebration.playWinFx,
    reducedMotion,
  });

  const canSpin = !lock.locked && bank >= betCents;

  const jackpotValueCents = useMemo(() => {
    if (jackpotBannerCents !== undefined) return jackpotBannerCents;
    const jackpotKey = game.jackpotKey;
    const paytable = game.paytable;
    if (!jackpotKey || !paytable || !(jackpotKey in paytable)) return 0;
    return paytable[jackpotKey] * betCents;
  }, [betCents, game.jackpotKey, game.paytable, jackpotBannerCents]);

  const { styles: fx } = celebration;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.stage, fx.screenShakeStyle]}>
        <WinBackgroundFX intensity={celebration.bgIntensity} tier={celebration.fxTier} reducedMotion={reducedMotion} />

        <MachineCabinet spinning={lock.locked}>
          <JackpotBanner
            title="777 Jackpot"
            value={formatCents(jackpotValueCents)}
            animatedStyle={fx.jackpotBannerStyle}
            flashStyle={fx.jackpotBannerFlashStyle}
          />

          <ReelStage>
            <ReelWindow
              strip={game.reels[0]}
              symbols={symbols}
              symbolHeight={SYMBOL_HEIGHT}
              animatedStyle={motion.reelStyle0}
              repeatCount={REEL_REPEAT_COUNT}
            />
            <ReelWindow
              strip={game.reels[1]}
              symbols={symbols}
              symbolHeight={SYMBOL_HEIGHT}
              animatedStyle={motion.reelStyle1}
              repeatCount={REEL_REPEAT_COUNT}
            />
            <ReelWindow
              strip={game.reels[2]}
              symbols={symbols}
              symbolHeight={SYMBOL_HEIGHT}
              animatedStyle={motion.reelStyle2}
              repeatCount={REEL_REPEAT_COUNT}
            />
          </ReelStage>

          <WinBanner text={machineOutput} animatedStyle={fx.winBannerStyle} />

          <PrimaryButton
            betCents={betCents}
            title="SPIN"
            subtitle={canSpin ? "PUSH" : "WAIT"}
            disabled={!canSpin}
            onPress={handleSpin}
            animatedStyle={fx.spinBtnStyle}
            flashStyle={fx.spinBtnFlashStyle}
          />

          <View style={styles.betRow}>
            <Chip label="1/2" active={tier === "HALF"} onPress={() => setTier("HALF")} disabled={lock.locked} />
            <Chip label="1x" active={tier === "FULL"} onPress={() => setTier("FULL")} disabled={lock.locked} />
            <Chip label="2x" active={tier === "DOUBLE"} onPress={() => setTier("DOUBLE")} disabled={lock.locked} />
          </View>
        </MachineCabinet>

        <CoinRain intensity={celebration.coinIntensity} tier={celebration.fxTier} reducedMotion={reducedMotion} />
        <VictoryText animatedStyle={fx.victoryTextStyle} />
        <WinPresentationOverlay
          presentation={celebration.presentation}
          reducedMotion={reducedMotion}
          onDone={celebration.clearPresentation}
        />
      </Animated.View>
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    width: "100%" as const,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stage: {
    width: "100%" as const,
    maxWidth: 720,
    position: "relative" as const,
  },
  betRow: {
    flexDirection: "row" as const,
    gap: 8,
    width: "100%" as const,
  },
};
