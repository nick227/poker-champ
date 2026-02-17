import { Text as RNText } from "react-native";
import type { TextProps } from "react-native";

type Variant = "body" | "h1" | "h2" | "label" | "muted" | "danger";

const classesByVariant: Record<Variant, string> = {
  body: "text-text text-base",
  h1: "text-text text-3xl font-bold",
  h2: "text-text text-xl font-semibold",
  label: "text-muted text-xs uppercase tracking-wide mb-4",
  muted: "text-muted text-sm",
  danger: "text-danger text-sm",
};

type AppTextProps = TextProps & {
  variant?: Variant;
  className?: string;
};

export function Text({ style, className, variant = "body", ...props }: AppTextProps) {
  const mergedClassName = className ? `${classesByVariant[variant]} ${className}` : classesByVariant[variant];
  return <RNText {...props} className={mergedClassName} style={style} />;
}
