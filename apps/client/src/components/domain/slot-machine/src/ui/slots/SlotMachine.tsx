import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, View, ImageSourcePropType } from "react-native";
import Animated from "react-native-reanimated";

import { formatCents } from "../../engine/format";
import { litReelsForOutcome } from "../../engine/display";
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

import { MachineCabinet } from "./MachineCabinet";
import { ReelStage } from "./ReelStage";
import { ReelWindow } from "./ReelWindow";
import { ResultMeter } from "./ResultMeter";
import { JackpotBanner } from "./JackpotBanner";
import { ControlDeck } from "./ControlDeck";
import { VictoryText } from "./VictoryText";
import { SlotScreenFx } from "./SlotScreenFx";
import { WinPresentationOverlay } from "./WinPresentationOverlay";
import { SLOT_FADE_IN_MS, SlotPreloader } from "./SlotPreloader";
import { clampSymbolHeight, DEFAULT_SYMBOL_HEIGHT, moodFor, REEL_REPEAT_COUNT, SLOT_SYMBOL_ASSETS } from "./slotMachineConfig";

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
  fadeInMs?: number;
}) {
  const [reducedMotionSystem, setReducedMotionSystem] = useState(false);
  const [symbolHeight, setSymbolHeight] = useState(DEFAULT_SYMBOL_HEIGHT);
  const [layoutReady, setLayoutReady] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

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

  const symbols = useMemo(() => ({ ...SLOT_SYMBOL_ASSETS, ...(symbolMap ?? {}) }), [symbolMap]);
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

  const { readout, busy, nearWin, handleSpin } = useSlotSpin({
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

  const canSpin = !busy && bank >= betCents;
  const lit = litReelsForOutcome(readout.result, readout.kind, readout.matchedSymbol);
  const mood = moodFor(busy, nearWin, canSpin, readout.isJackpot, readout.phase === "win");

  useEffect(() => {
    if (!autoPlay || busy) return;
    if (bank < betCents) {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => {
      void handleSpin();
    }, 480);
    return () => clearTimeout(t);
  }, [autoPlay, busy, bank, betCents, handleSpin]);

  const jackpotValueCents = useMemo(() => {
    if (jackpotBannerCents !== undefined) return jackpotBannerCents;
    const jackpotKey = game.jackpotKey;
    const paytable = game.paytable;
    if (!jackpotKey || !paytable || !(jackpotKey in paytable)) return 0;
    return paytable[jackpotKey] * betCents;
  }, [betCents, game.jackpotKey, game.paytable, jackpotBannerCents]);

  const { styles: fx } = celebration;
  const reelProps = { symbols, symbolHeight, repeatCount: REEL_REPEAT_COUNT, litStyle: fx.cellLitStyle };

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
          <MachineCabinet mood={mood} reducedMotion={reducedMotion}>
            <JackpotBanner
              title="777 Jackpot"
              value={formatCents(jackpotValueCents)}
              reducedMotion={reducedMotion}
              animatedStyle={fx.jackpotBannerStyle}
              flashStyle={fx.jackpotBannerFlashStyle}
            />

            <ReelStage onReelLayout={onReelLayout}>
              <ReelWindow strip={game.reels[0]} animatedStyle={motion.reelStyle0} lit={lit[0]} {...reelProps} />
              <ReelWindow strip={game.reels[1]} animatedStyle={motion.reelStyle1} lit={lit[1]} {...reelProps} />
              <ReelWindow strip={game.reels[2]} animatedStyle={motion.reelStyle2} lit={lit[2]} {...reelProps} />
            </ReelStage>

            <ResultMeter readout={readout} animatedStyle={fx.winBannerStyle} />
            <ControlDeck
              tier={tier}
              betCents={betCents}
              busy={busy}
              autoPlay={autoPlay}
              canSpin={canSpin}
              reducedMotion={reducedMotion}
              onSpin={handleSpin}
              onToggleAuto={() => setAutoPlay((v) => !v)}
              onTier={setTier}
              onMax={() => setTier("DOUBLE")}
              spinStyle={fx.spinBtnStyle}
              spinFlashStyle={fx.spinBtnFlashStyle}
            />
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
    backgroundColor: "#070707",
  },
  stage: {
    flex: 1,
    width: "100%" as const,
    minHeight: 0,
    position: "relative" as const,
    zIndex: 2,
  },
};
