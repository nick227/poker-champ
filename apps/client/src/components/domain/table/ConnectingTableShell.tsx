import { type ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";

type ConnectingTableShellProps = {
  message: string;
  action?: ReactNode;
};

export function ConnectingTableShell({ message, action }: ConnectingTableShellProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();

  return (
    <View
      style={vars({
        "--c-felt": feltColor,
        "--c-card-face": cardFaceColor,
        "--c-card-back": cardBackColor,
        "--c-gold": accentColor,
        "--c-bg": backgroundColor,
        "--r-table": tableRadius,
      })}
      className="flex-1 ui-surface-card overflow-hidden border border-border-subtle shadow-lg ui-center ui-stack-4"
    >
      <View className="ui-p-4 ui-stack-3 items-center max-w-[280px]">
        <Text className="text-center text-muted-foreground">{message}</Text>
        {action ?? null}
      </View>
    </View>
  );
}
