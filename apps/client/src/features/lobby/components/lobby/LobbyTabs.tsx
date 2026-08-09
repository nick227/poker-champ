import { View } from "react-native";
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
  /** Optional count (e.g. joined/live tournaments) shown appended to the Tournaments tab label. */
  tournamentsBadgeCount?: number;
  /** Desktop workspace: no extra horizontal padding (grid owns edges). */
  dense?: boolean;
}) {
  return (
    <View className={`ui-row ui-inline-2 pb-3 ${dense ? "" : "px-4"}`}>
      {TAB_ORDER.map((tab) => {
        const showBadge = tab.key === "tournaments" && Boolean(tournamentsBadgeCount);
        const label = showBadge ? `${tab.label} (${tournamentsBadgeCount})` : tab.label;
        return (
          <ChipButton
            key={tab.key}
            title={label}
            selected={active === tab.key}
            onPress={() => onChange(tab.key)}
            selectedAccent="gold"
            className="min-w-[112px]"
          />
        );
      })}
    </View>
  );
}
