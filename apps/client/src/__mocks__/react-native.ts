/** Mock for vitest - react-native uses Flow import typeof which rollup cannot parse */
import { createElement, type ReactNode, type MouseEvent } from "react";

function normalizeStyle(style: unknown): Record<string, unknown> {
  if (style == null) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(normalizeStyle));
  return typeof style === "object" && style !== null ? (style as Record<string, unknown>) : {};
}

export const Platform = { OS: "web" as const };
export const StyleSheet = {
  create: <T extends Record<string, object>>(styles: T): T => styles,
};
export const View = ({
  children,
  testID,
  style,
  pointerEvents,
  ...rest
}: {
  children?: ReactNode;
  testID?: string;
  style?: unknown;
  pointerEvents?: string;
  [key: string]: unknown;
}) =>
  createElement(
    "div",
    {
      ...rest,
      "data-testid": testID,
      style: { ...normalizeStyle(style), pointerEvents },
    },
    children,
  );
export const Text = ({
  children,
  style,
  ...rest
}: { children?: ReactNode; style?: unknown; [key: string]: unknown }) =>
  createElement("span", { ...rest, style: normalizeStyle(style) }, children);

export const Pressable = ({
  children,
  onPress,
  style,
  ...rest
}: {
  children?: ReactNode;
  onPress?: () => void;
  style?: unknown;
  [key: string]: unknown;
}) =>
  createElement(
    "button",
    {
      ...rest,
      type: "button",
      style: typeof style === "function" ? undefined : normalizeStyle(style),
      onClick: (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onPress?.();
      },
    },
    children,
  );

export const ScrollView = ({ children, ...rest }: { children?: ReactNode; [key: string]: unknown }) =>
  createElement("div", { ...rest, role: "list" }, children);

export const TextInput = ({
  value,
  onChangeText,
  onChange,
  onBlur,
  onSubmitEditing,
  editable,
  style,
  ...rest
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  onChange?: (e: unknown) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  editable?: boolean;
  style?: unknown;
  [key: string]: unknown;
}) =>
  createElement("input", {
    ...rest,
    value,
    disabled: editable === false,
    style: normalizeStyle(style),
    onChange: (e: { target: { value: string } }) => {
      onChangeText?.(e.target.value);
      onChange?.(e);
    },
    onBlur: () => onBlur?.(),
    onKeyDown: (e: { key: string }) => {
      if (e.key === "Enter") onSubmitEditing?.();
    },
  });

export const ActivityIndicator = (_props: unknown) => createElement("span", { "data-testid": "activity" }, "\u2026");

export const PanResponder = {
  create: (config: unknown) => ({ panHandlers: {} }),
};

export function useWindowDimensions() {
  return { width: 400, height: 600 };
}

class AnimatedValue {
  constructor(public _value: number) {}
  setValue(v: number) {
    this._value = v;
  }
  interpolate() {
    return this._value;
  }
}

function animatedStub() {
  return {
    start: (cb?: (result?: { finished: boolean }) => void) => {
      cb?.({ finished: true });
      return { stop: () => {} };
    },
    stop: () => {},
  };
}

/** Curve math doesn't matter under test (no real frames render) — only that these are callable
 *  and compose, matching real react-native's Easing module shape closely enough that any table
 *  FX module importing Easing.* doesn't crash a component test that transitively pulls it in. */
const identityEasing = (t: number) => t;
export const Easing = {
  linear: identityEasing,
  ease: identityEasing,
  quad: identityEasing,
  cubic: identityEasing,
  poly: () => identityEasing,
  sin: identityEasing,
  circle: identityEasing,
  exp: identityEasing,
  elastic: () => identityEasing,
  back: () => identityEasing,
  bounce: identityEasing,
  bezier: () => identityEasing,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

export const Animated = {
  Value: AnimatedValue,
  View,
  timing: () => animatedStub(),
  spring: () => animatedStub(),
  delay: () => animatedStub(),
  sequence: (steps: unknown[]) => {
    const stub = animatedStub();
    return {
      start: (cb?: (result?: { finished: boolean }) => void) => {
        if (Array.isArray(steps)) {
          for (const step of steps) {
            if (step && typeof step === "object" && "start" in step) {
              (step as ReturnType<typeof animatedStub>).start();
            }
          }
        }
        cb?.({ finished: true });
        return stub;
      },
      stop: () => stub.stop(),
    };
  },
  parallel: (steps: unknown[]) => {
    const stub = animatedStub();
    return {
      start: (cb?: (result?: { finished: boolean }) => void) => {
        if (Array.isArray(steps)) {
          for (const step of steps) {
            if (step && typeof step === "object" && "start" in step) {
              (step as ReturnType<typeof animatedStub>).start();
            }
          }
        }
        cb?.({ finished: true });
        return stub;
      },
      stop: () => stub.stop(),
    };
  },
  loop: (step: unknown) => {
    const stub = animatedStub();
    const inner =
      step && typeof step === "object" && "start" in step
        ? (step as ReturnType<typeof animatedStub>)
        : null;
    return {
      start: (cb?: (result?: { finished: boolean }) => void) => {
        inner?.start();
        cb?.({ finished: true });
        return stub;
      },
      stop: () => {
        inner?.stop();
        stub.stop();
      },
    };
  },
};

export const Modal = ({
  visible,
  children,
  ...rest
}: {
  visible?: boolean;
  children?: ReactNode;
  [key: string]: unknown;
}) => (visible ? createElement("div", { ...rest, "data-testid": "modal" }, children) : null);

export default {
  Platform,
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
  Animated,
  Easing,
  Modal,
};
