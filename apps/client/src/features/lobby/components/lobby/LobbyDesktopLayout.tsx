import type { ReactNode } from "react";
import { View } from "react-native";
import { LobbyDesktopTopBar } from "./LobbyDesktopTopBar";

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
  primary: ReactNode;
  rail: ReactNode;
};

/**
 * Desktop lobby workspace grid:
 * TopBar spans both columns; primary flex-1 + fixed rail share one horizontal band.
 */
export function LobbyDesktopLayout({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
  primary,
  rail,
}: Props) {
  return (
    <View className="flex-1 min-h-0">
      <LobbyDesktopTopBar
        username={username}
        amountCents={amountCents}
        onlineLabel={onlineLabel}
        onPressOnline={onPressOnline}
        avatarUrl={avatarUrl}
      />
      <View className="flex-1 flex-row min-h-0">
        <View className="flex-1 min-w-0 min-h-0 pr-4">{primary}</View>
        <View className="w-[300px] shrink-0 min-h-0 border-l border-border pl-4">
          {rail}
        </View>
      </View>
    </View>
  );
}
