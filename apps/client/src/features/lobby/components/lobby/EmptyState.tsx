import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";

type Action = {
  title: string;
  onPress: () => void;
  intent?: "accent" | "secondary" | "neutral";
};

type Props = {
  message: string;
  detail?: string;
  primary?: Action;
  secondary?: Action;
  /** Loading / neutral copy without danger styling. */
  tone?: "muted" | "danger";
  embedded?: boolean;
};

/** Felt-framed stage message with optional directed CTAs. */
export function EmptyState({
  message,
  detail,
  primary,
  secondary,
  tone = "muted",
  embedded = false,
}: Props) {
  return (
    <View
      className={`flex-1 min-h-[160px] ui-center px-4 py-10 gap-3 ${
        embedded ? "" : "lobby-stage rounded-2 border"
      }`}
    >
      <Text
        variant={tone === "danger" ? "danger" : "muted"}
        className="text-[14px] text-center font-semibold"
      >
        {message}
      </Text>
      {detail ? (
        <Text variant="muted" className="text-[12px] text-center max-w-[360px]">
          {detail}
        </Text>
      ) : null}
      {primary || secondary ? (
        <View className="ui-row items-center flex-wrap gap-2 mt-1">
          {primary ? (
            <Button
              title={primary.title}
              onPress={() => {
                primary.onPress();
              }}
              intent={primary.intent ?? "accent"}
              size="sm"
              shape="hud"
              minWidth={0}
            />
          ) : null}
          {secondary ? (
            <Button
              title={secondary.title}
              onPress={() => {
                secondary.onPress();
              }}
              intent={secondary.intent ?? "secondary"}
              size="sm"
              shape="hud"
              minWidth={0}
              className="border border-border"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
