import { useCallback, useRef } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Input } from "@/components/base/Input";
import { formatInputFromCents, parseInputToCents } from "./actionBar.logic";
import { actionBarStyles } from "./styles";

const ONE_DOLLAR_CENTS = 100;
const HOLD_INITIAL_MS = 400;
const HOLD_REPEAT_MS = 500;

type WagerInputProps = {
  visible: boolean;
  display: string;
  placeholder: string;
  editable: boolean;
  onChangeText: (text: string) => void;
  onBlur: () => number;
  onSubmitEditing: () => number;
};

function useStepRepeat(onStepRef: React.MutableRefObject<(delta: number) => void>) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (delta: number) => {
      clear();
      onStepRef.current(delta);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        intervalRef.current = setInterval(() => onStepRef.current(delta), HOLD_REPEAT_MS);
      }, HOLD_INITIAL_MS);
    },
    [clear, onStepRef],
  );

  return { start, clear };
}

export function WagerInput({
  visible,
  display,
  placeholder,
  editable,
  onChangeText,
  onBlur,
  onSubmitEditing,
}: WagerInputProps) {
  const step = useCallback(
    (delta: number) => {
      const cents = parseInputToCents(display);
      const next = Math.max(0, cents + delta);
      onChangeText(formatInputFromCents(next));
    },
    [display, onChangeText],
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  const { start: startRepeat, clear } = useStepRepeat(stepRef);

  const onMinusPressIn = useCallback(() => {
    if (!editable) return;
    startRepeat(-ONE_DOLLAR_CENTS);
  }, [editable, startRepeat]);
  const onPlusPressIn = useCallback(() => {
    if (!editable) return;
    startRepeat(ONE_DOLLAR_CENTS);
  }, [editable, startRepeat]);

  return (
    <View
      collapsable={false}
      pointerEvents={visible ? "auto" : "none"}
      style={[
        actionBarStyles.betInputPlaceholder,
        {
          opacity: visible ? 1 : 0,
        },
      ]}
    >
      <View style={actionBarStyles.wagerRow}>
        <View style={actionBarStyles.wagerInputWrap}>
          <Input
            bare
            iconLeft="$"
            value={display}
            onChangeText={onChangeText}
            onBlur={onBlur}
            onSubmitEditing={onSubmitEditing}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder={placeholder}
            selectTextOnFocus
            editable={editable}
            allowFontScaling={false}
            maxLength={10}
            style={{ color: "#F9FAFB", fontWeight: "700" }}
            accessibilityLabel="Bet amount input"
            accessibilityState={{ disabled: !editable }}
          />
        </View>
        <Pressable
          onPressIn={onMinusPressIn}
          onPressOut={clear}
          disabled={!editable}
          style={actionBarStyles.stepperBtn}
          onPointerDown={(e) => (e as { preventDefault?: () => void }).preventDefault?.()}
          accessibilityLabel="Decrease bet by one dollar"
          accessibilityState={{ disabled: !editable }}
        >
          <Text allowFontScaling={false} style={{ color: "#F9FAFB", fontSize: 18, fontWeight: "700" }}>
            −
          </Text>
        </Pressable>
        <Pressable
          onPressIn={onPlusPressIn}
          onPressOut={clear}
          disabled={!editable}
          style={actionBarStyles.stepperBtn}
          onPointerDown={(e) => (e as { preventDefault?: () => void }).preventDefault?.()}
          accessibilityLabel="Increase bet by one dollar"
          accessibilityState={{ disabled: !editable }}
        >
          <Text allowFontScaling={false} style={{ color: "#F9FAFB", fontSize: 18, fontWeight: "700" }}>
            +
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
