import type { ReactNode } from "react";
import { View } from "react-native";
import { LobbyDesktopTopBar } from "./LobbyDesktopTopBar";

type Props = {
  username: string;
  amountCents: number;
  onlineLabel: string;
  onPressOnline?: () => void;
  avatarUrl?: string | null;
  authenticated: boolean;
  primary: ReactNode;
};

/** Desktop lobby: top bar + single primary column (no right rail). */
export function LobbyDesktopLayout({
  username,
  amountCents,
  onlineLabel,
  onPressOnline,
  avatarUrl,
  authenticated,
  primary,
}: Props) {
  return (
    <View className="flex-1 min-h-0">
      <LobbyDesktopTopBar
        username={username}
        amountCents={amountCents}
        onlineLabel={onlineLabel}
        onPressOnline={onPressOnline}
        avatarUrl={avatarUrl}
        authenticated={authenticated}
      />
      <View className="flex-1 min-h-0 min-w-0">{primary}</View>
    </View>
  );
}
