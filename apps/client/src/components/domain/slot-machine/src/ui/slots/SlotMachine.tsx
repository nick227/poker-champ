import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useSlotAssetsReady } from "../../hooks/useSlotAssetsReady";

import { Chip } from "../components/Chip";
import { PrimaryButton } from "../components/PrimaryButton";
import { MachineCabinet } from "./MachineCabinet";
import { ReelStage } from "./ReelStage";
import { ReelWindow } from "./ReelWindow";
import { WinBanner } from "./WinBanner";
import { JackpotBanner } from "./JackpotBanner";
import { VictoryText } from "./VictoryText";
import { SlotScreenFx } from "./SlotScreenFx";
import { WinPresentationOverlay } from "./WinPresentationOverlay";
import { SLOT_FADE_IN_MS, SlotPreloader } from "./SlotPreloader";

const DEFAULT_SYMBOL_HEIGHT = 120;
const MIN_SYMBOL_HEIGHT = 48;
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

function clampSymbolHeight(reelHeight: number): number {
  return Math.max(MIN_SYMBOL_HEIGHT, Math.floor(reelHeight / 3));
}

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
  fadeInMs = SLOT_FADE_IN_MS,
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
  /** Crossfade duration once assets + reel layout are ready. */
  fadeInMs?: number;
}) {
  const [reducedMotionSystem, setReducedMotionSystem] = useState(false);
  const [symbolHeight, setSymbolHeight] = useState(DEFAULT_SYMBOL_HEIGHT);
  const [layoutReady, setLayoutReady] = useState(false);

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
  const assetsReady = useSlotAssetsReady(symbols);
  const motion = useSlotReelMotion(reelLens, symbolHeight);
  const celebration = useSlotCelebration();
  const bootReady = assetsReady && layoutReady;

  const onReelLayout = useCallback((height: number) => {
    if (height <= 0) return;
    const next = clampSymbolHeight(height);
    setSymbolHeight((prev) => (prev === next ? prev : next));
    setLayoutReady(true);
  }, []);

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
      <SlotPreloader ready={bootReady} reducedMotion={reducedMotion} fadeInMs={fadeInMs}>
        <SlotScreenFx
          intensity={celebration.bgIntensity}
          scale={celebration.fxScale}
          burstKey={celebration.fxBurstKey}
          reducedMotion={reducedMotion}
        />

        <Animated.View style={[styles.stage, fx.screenShakeStyle]}>
          <MachineCabinet spinning={lock.locked}>
            <JackpotBanner
              title="777 Jackpot"
              value={formatCents(jackpotValueCents)}
              animatedStyle={fx.jackpotBannerStyle}
              flashStyle={fx.jackpotBannerFlashStyle}
            />

            <ReelStage onReelLayout={onReelLayout}>
              <ReelWindow
                strip={game.reels[0]}
                symbols={symbols}
                symbolHeight={symbolHeight}
                animatedStyle={motion.reelStyle0}
                repeatCount={REEL_REPEAT_COUNT}
              />
              <ReelWindow
                strip={game.reels[1]}
                symbols={symbols}
                symbolHeight={symbolHeight}
                animatedStyle={motion.reelStyle1}
                repeatCount={REEL_REPEAT_COUNT}
              />
              <ReelWindow
                strip={game.reels[2]}
                symbols={symbols}
                symbolHeight={symbolHeight}
                animatedStyle={motion.reelStyle2}
                repeatCount={REEL_REPEAT_COUNT}
              />
            </ReelStage>

            <View style={styles.dock}>
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
            </View>
          </MachineCabinet>

          <VictoryText animatedStyle={fx.victoryTextStyle} />
          <WinPresentationOverlay
            presentation={celebration.presentation}
            reducedMotion={reducedMotion}
            onDone={celebration.clearPresentation}
          />
        </Animated.View>
      </SlotPreloader>
    </View>
  );
}

const styles = {
  root: {
    flex: 1,
    width: "100%" as const,
    height: "100%" as const,
    minHeight: 0,
    position: "relative" as const,
    overflow: "hidden" as const,
  },
  stage: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    position: "relative" as const,
    zIndex: 2,
  },
  dock: {
    width: "100%" as const,
    gap: 8,
    flexShrink: 0,
  },
  betRow: {
    flexDirection: "row" as const,
    gap: 8,
    width: "100%" as const,
  },
};
