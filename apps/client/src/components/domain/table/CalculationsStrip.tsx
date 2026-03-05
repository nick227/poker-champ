import { useEffect, useRef, useMemo } from "react";
import { Animated, View } from "react-native";
import { Pill, type PillVariant } from "@/components/base/Pill";
import { Text } from "@/components/base/Text";
import { DURATION } from "@/theme/animation";

const CALC_STRIP_HEIGHT = 40;

export function CalculationsStrip({
  equity,
  potOdds,
  outs,
  vpipPct,
  pfrPct,
  statsHands,
  visible = true,
  muted = false,
}: {
  equity?: number;
  potOdds?: number;
  outs?: number;
  vpipPct?: number;
  pfrPct?: number;
  statsHands?: number;
  visible?: boolean;
  muted?: boolean;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const prev = useRef({ equity, potOdds, outs, vpipPct, pfrPct });

  useEffect(() => {
    if (!visible) return; // nothing animates if not visible

    if (muted) {
      opacity.stopAnimation();
      opacity.setValue(0.6);
      return;
    }

    const changed =
      prev.current.equity !== equity ||
      prev.current.potOdds !== potOdds ||
      prev.current.outs !== outs ||
      prev.current.vpipPct !== vpipPct ||
      prev.current.pfrPct !== pfrPct;

    prev.current = { equity, potOdds, outs, vpipPct, pfrPct };

    if (!changed) return;

    opacity.setValue(0.85);
    Animated.timing(opacity, {
      toValue: 1,
      duration: DURATION.fast,
      useNativeDriver: true,
    }).start();
  }, [equity, potOdds, outs, vpipPct, pfrPct, muted, visible, opacity]);

  const pills = useMemo(() => {
    if (!visible) return [];

    return [
      {
        label: "Equity",
        value:
          typeof equity === "number" ? `${equity}%` : "--",
        variant: "neutral" as PillVariant,
      },
      {
        label: "VPIP",
        value:
          typeof vpipPct === "number"
            ? typeof statsHands === "number"
              ? `${vpipPct}% (${statsHands})`
              : `${vpipPct}%`
            : "--",
        variant: "neutral" as PillVariant,
      },
    ];
  }, [visible, equity, vpipPct, statsHands]);

  return (
    <View
      collapsable={false}
      style={{ height: CALC_STRIP_HEIGHT }}
    >
      <Animated.View
        style={{
          height: CALC_STRIP_HEIGHT,
          opacity: visible ? opacity : 1,
        }}
      >
        <View className="ui-row ui-inline-2 ui-p-stack-2 mx-2" style={{ flexWrap: "nowrap" }}>
          {pills.map((p) => (
            <Pill
              key={p.label}
              label={p.label}
              value={p.value}
              variant={p.variant}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
