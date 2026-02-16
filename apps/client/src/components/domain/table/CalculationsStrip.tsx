import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { Pill, type PillVariant } from "@/components/base/Pill";
import { DURATION } from "@/theme/animation";

function toVariant(favorable: boolean, poor: boolean): PillVariant {
  if (poor) return "danger";
  if (favorable) return "success";
  return "warn";
}

export function CalculationsStrip({
  equity,
  potOdds,
  outs,
  visible = true,
  muted = false,
}: {
  equity: number;
  potOdds: number;
  outs: number;
  visible?: boolean;
  muted?: boolean;
}) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const prev = useRef({ equity, potOdds, outs });

  useEffect(() => {
    if (muted) {
      opacity.setValue(1);
      return;
    }
    const changed =
      prev.current.equity !== equity ||
      prev.current.potOdds !== potOdds ||
      prev.current.outs !== outs;
    prev.current = { equity, potOdds, outs };
    if (!changed) return;
    opacity.setValue(0.85);
    Animated.timing(opacity, {
      toValue: 1,
      duration: DURATION.fast,
      useNativeDriver: true,
    }).start();
  }, [equity, potOdds, outs, muted, opacity]);

  useEffect(() => {
    opacity.setValue(visible ? 1 : 0);
  }, [visible, opacity]);

  const eqVariant = toVariant(equity > 50, equity < 30);
  const poVariant = toVariant(potOdds < equity, potOdds > equity + 20);
  const content = (
    <View className="ui-row-wrap ui-inline-2 ui-p-stack-2">
      <Pill label="Equity" value={`${equity}%`} variant={eqVariant} />
      <Pill label="Pot Odds" value={`${potOdds}%`} variant={poVariant} />
      <Pill label="Outs" value={String(outs)} variant="neutral" />
    </View>
  );

  return (
    <View style={{ minHeight: 32 }} pointerEvents={visible ? "auto" : "none"}>
      <View style={{ opacity: !visible ? 0 : muted ? 0.6 : 1 }}>
        <Animated.View style={{ opacity }}>{content}</Animated.View>
      </View>
    </View>
  );
}
