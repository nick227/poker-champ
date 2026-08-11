/**
 * Chip-stack "travel" overlay: renders the pot → winner chip animation (the bet → pot leg was
 * removed as an unwanted, overly-busy cue firing on every single action — see git history).
 *
 * Separate from TableAnimationOverlay because chip travel needs two endpoints (from/to)
 * rather than a single anchor rect, and has its own simple request-queue lifecycle
 * (mirrors the "measure → build plan → animate → auto-remove" flow used elsewhere in
 * this FX system, e.g. TableAnimationOverlay's channel lifecycle).
 *
 * Non-responsibilities: deciding *when* a payout happened (host reports via ChipTravelPlan
 * built from measured AnchorBounds — see chipTravel.ts) and layout measurement (host reports
 * bounds, same as TableAnimationOverlay).
 */
import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { ChipToken } from "./layers/ChipToken";
import { getAnimationTheme } from "./animationTheme";
import { EASING_OPACITY_OUT, EASING_SCALE } from "./animationEasing";
import { CHIP_TRAVEL_STAGGER_MS, computeChipTravelTotalMs, type ChipTravelPlan } from "./chipTravel";

/** How far above the straight-line path a chip arcs at its midpoint (px). */
const ARC_HEIGHT_PX = 34;
/** Landing flourish (pop + fade) once a chip reaches its destination. */
const LANDING_MS = 140;
const LANDING_SCALE = 1.25;
const CHIP_SCALE_FROM = 0.55;

const OVERLAY_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 98,
  pointerEvents: "none" as const,
};

type ChipInstanceProps = {
  plan: ChipTravelPlan;
  onComplete: (id: string) => void;
};

function ChipTravelInstance({ plan, onComplete }: ChipInstanceProps) {
  const { from, to, chipCount, durationMs, id } = plan;
  const color = getAnimationTheme("POT_WIN").palette.ring;
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const originX = from.x + from.width / 2;
  const originY = from.y + from.height / 2;

  const chips = useRef(
    Array.from({ length: chipCount }, () => ({
      translateX: new Animated.Value(0),
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(CHIP_SCALE_FROM),
    }))
  ).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const arcMidY = dy / 2 - ARC_HEIGHT_PX;

    const runOne = (chip: (typeof chips)[number]) => {
      Animated.parallel([
        Animated.timing(chip.translateX, {
          toValue: dx,
          duration: durationMs,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
        Animated.sequence([
          Animated.timing(chip.translateY, {
            toValue: arcMidY,
            duration: durationMs * 0.5,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(chip.translateY, {
            toValue: dy,
            duration: durationMs * 0.5,
            useNativeDriver: true,
            easing: Easing.in(Easing.quad),
          }),
        ]),
        Animated.timing(chip.opacity, {
          toValue: 1,
          duration: Math.min(120, durationMs * 0.3),
          useNativeDriver: true,
        }),
        Animated.timing(chip.scale, {
          toValue: 1,
          duration: durationMs,
          useNativeDriver: true,
          easing: EASING_SCALE,
        }),
      ]).start(() => {
        Animated.parallel([
          Animated.timing(chip.scale, {
            toValue: LANDING_SCALE,
            duration: LANDING_MS,
            useNativeDriver: true,
            easing: EASING_SCALE,
          }),
          Animated.timing(chip.opacity, {
            toValue: 0,
            duration: LANDING_MS,
            useNativeDriver: true,
            easing: EASING_OPACITY_OUT,
          }),
        ]).start();
      });
    };

    chips.forEach((chip, i) => {
      const t = setTimeout(() => runOne(chip), i * CHIP_TRAVEL_STAGGER_MS);
      timeouts.push(t);
    });

    const totalMs = computeChipTravelTotalMs(plan) + LANDING_MS;
    const completeTimeout = setTimeout(() => onCompleteRef.current(id), totalMs);
    timeouts.push(completeTimeout);

    return () => timeouts.forEach((t) => clearTimeout(t));
    // Plan is treated as immutable per instance (keyed by id in parent); only mount-once deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {chips.map((chip, i) => (
        <Animated.View
          key={i}
          style={[
            styles.chipWrap,
            {
              left: originX - 9,
              top: originY - 9,
              opacity: chip.opacity,
              transform: [
                { translateX: chip.translateX },
                { translateY: chip.translateY },
                { scale: chip.scale },
              ],
            },
          ]}
        >
          <ChipToken color={color} />
        </Animated.View>
      ))}
    </View>
  );
}

export type ChipTravelOverlayProps = {
  /** Active chip-travel plans; each renders until its flight + landing flourish completes. */
  requests: ChipTravelPlan[];
  /** Called once per plan when its animation fully completes; host should remove it from `requests`. */
  onRequestComplete: (id: string) => void;
};

export function ChipTravelOverlay({ requests, onRequestComplete }: ChipTravelOverlayProps) {
  const items = useMemo(() => requests, [requests]);
  if (items.length === 0) return null;
  return (
    <View style={OVERLAY_STYLE}>
      {items.map((plan) => (
        <ChipTravelInstance key={plan.id} plan={plan} onComplete={onRequestComplete} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    position: "absolute",
  },
});
