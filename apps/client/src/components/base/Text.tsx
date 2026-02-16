import { Text as RNText } from "react-native";
import type { TextProps } from "react-native";

type Variant = "body" | "h1" | "h2" | "label" | "muted" | "danger";

const classesByVariant: Record<Variant, string> = {
  body: "text-text text-base",
  h1: "text-text text-3xl font-bold",
  h2: "text-text text-xl font-semibold",
  label: "text-muted text-xs uppercase tracking-wide",
  muted: "text-muted text-sm",
  danger: "text-danger text-sm",
};

export function Text({ style, ...props }: TextProps & { variant?: Variant }) {
  const variant = props.variant ?? "body";
  return <RNText {...props} className={classesByVariant[variant]} style={style} />;
}
