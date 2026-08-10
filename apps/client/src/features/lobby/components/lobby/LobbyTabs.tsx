import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";

export type LobbyTabKey = "cash" | "tournaments";

const TAB_ORDER: readonly { key: LobbyTabKey; label: string }[] = [
  { key: "cash", label: "Cash Games" },
  { key: "tournaments", label: "Tournaments" },
];

/**
 * Top-level section switcher for the lobby (GGPoker-style category tab row).
 * Pure view state - which section is visible - owned by the caller; does not touch data fetching.
 */
export function LobbyTabs({
  active,
  onChange,
  tournamentsBadgeCount,
  dense = false,
}: {
  active: LobbyTabKey;
  onChange: (key: LobbyTabKey) => void;
  /** Optional count (e.g. joined/live tournaments) shown as a visual badge on the Tournaments tab. */
  tournamentsBadgeCount?: number;
  /** Desktop workspace: no extra horizontal padding (grid owns edges). */
  dense?: boolean;
}) {
  return (
    <View className={`ui-row ui-inline-2 pb-3 ${dense ? "" : "px-4"}`}>
      {TAB_ORDER.map((tab) => {
        const showBadge = tab.key === "tournaments" && Boolean(tournamentsBadgeCount);
        return (
          <View key={tab.key} className="relative">
            <ChipButton
              title={tab.label}
              selected={active === tab.key}
              onPress={() => onChange(tab.key)}
              selectedAccent="gold"
              className="min-w-[112px]"
            />
            {showBadge ? (
              <View className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-primary items-center justify-center px-1">
                <Text
                  className="text-white font-bold"
                  style={{ fontSize: 10 }}
                  allowFontScaling={false}
                >
                  {tournamentsBadgeCount! > 9 ? "9+" : String(tournamentsBadgeCount)}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

