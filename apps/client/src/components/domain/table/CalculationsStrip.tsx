import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { Pill, type PillVariant } from "@/components/base/Pill";
import { Text } from "@/components/base/Text";
import { DURATION } from "@/theme/animation";

const CALC_STRIP_HEIGHT = 40;

function toVariant(favorable: boolean, poor: boolean): PillVariant {
  if (poor) return "danger";
  if (favorable) return "success";
  return "warn";
}

type CalcPill = { label: string; value: string; variant: PillVariant };

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
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const prev = useRef({ equity, potOdds, outs, vpipPct, pfrPct });

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
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

  useEffect(() => {
    if (!visible) opacity.setValue(0);
    else if (muted) opacity.setValue(0.6);
    else opacity.setValue(1);
  }, [visible, muted, opacity]);

  const eqVariant = typeof equity === "number" ? toVariant(equity > 50, equity < 30) : "neutral";
  const poVariant = typeof potOdds === "number" && typeof equity === "number"
    ? toVariant(potOdds < equity, potOdds > equity + 20)
    : "neutral";

  const pills: CalcPill[] = [
    { label: "Equity", value: typeof equity === "number" ? `${equity}%` : "--", variant: eqVariant },
    { label: "Pot Odds", value: typeof potOdds === "number" ? `${potOdds}%` : "--", variant: poVariant },
    { label: "Outs", value: typeof outs === "number" ? String(outs) : "--", variant: "neutral" },
    {
      label: "VPIP",
      value: typeof vpipPct === "number"
        ? (typeof statsHands === "number" ? `${vpipPct}% (${statsHands})` : `${vpipPct}%`)
        : "--",
      variant: "neutral",
    },
    {
      label: "PFR",
      value: typeof pfrPct === "number"
        ? (typeof statsHands === "number" ? `${pfrPct}% (${statsHands})` : `${pfrPct}%`)
        : "--",
      variant: "neutral",
    },
  ];

  const content = (
    <View style={{ flexDirection: "column" }} className="ui-stack-2">
      <View className="ui-row ui-inline-2 ui-p-stack-2" style={{ flexWrap: "nowrap" }}>
        {pills.map((p) => (
          <Pill key={p.label} label={p.label} value={p.value} variant={p.variant} />
        ))}
      </View>
    </View>
  );

  return (
    <View
      collapsable={false}
      style={{ height: CALC_STRIP_HEIGHT }}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Animated.View style={{ height: CALC_STRIP_HEIGHT, opacity }}>{content}</Animated.View>
    </View>
  );
}
