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

export const ActivityIndicator = (_props: unknown) => createElement("span", { "data-testid": "activity" }, "\u2026");

export const PanResponder = {
  create: (config: unknown) => ({ panHandlers: {} }),
};

export function useWindowDimensions() {
  return { width: 400, height: 600 };
}

export default { Platform, StyleSheet, View, Text, Pressable, ScrollView, ActivityIndicator, PanResponder, useWindowDimensions };
