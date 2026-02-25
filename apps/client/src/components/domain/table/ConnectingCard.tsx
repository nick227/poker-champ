import type { ReactNode } from "react";
import { View } from "react-native";
import { vars } from "nativewind";
import { Text } from "@/components/base/Text";
import { usePreferencesStore } from "@/stores/preferences.store";
import { COMMUNITY_BOARD_HEIGHT } from "./constants/components/communityBoard.layout";

export type ConnectingCardProps = {
  message: string;
  action?: ReactNode;
};

/** Fills the board/felt slot when connecting or in error; same chrome, just waiting. */
export function ConnectingCard({ message, action }: ConnectingCardProps) {
  const { feltColor, cardFaceColor, cardBackColor, accentColor, backgroundColor, tableRadius } =
    usePreferencesStore();

  return (
    <View
      style={[
        vars({
          "--c-felt": feltColor,
          "--c-card-face": cardFaceColor,
          "--c-card-back": cardBackColor,
          "--c-gold": accentColor,
          "--c-bg": backgroundColor,
          "--r-table": tableRadius,
        }),
        { height: COMMUNITY_BOARD_HEIGHT, minHeight: COMMUNITY_BOARD_HEIGHT },
      ]}
      className="justify-center bg-felt"
      collapsable={false}
    >
      <View
        collapsable={false}
        className="ui-surface-card mx-6 overflow-hidden rounded-lg border border-border-subtle shadow-lg ui-center ui-stack-4 ui-p-4"
      >
        <Text className="text-center text-muted-foreground" variant="body">
          {message}
        </Text>
        {action ?? null}
      </View>
    </View>
  );
}
