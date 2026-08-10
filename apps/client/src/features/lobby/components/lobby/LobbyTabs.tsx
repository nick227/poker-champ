import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";

export type LobbyTabKey = "cash" | "tournaments";

const TAB_ORDER: readonly { key: LobbyTabKey; label: string }[] = [
  { key: "cash", label: "Cash Games" },
  { key: "tournaments", label: "Tournaments" },
];

/** Single connected segmented HUD control. */
export function LobbyTabs({
  active,
  onChange,
  tournamentsBadgeCount,
  dense = false,
  stretch = false,
}: {
  active: LobbyTabKey;
  onChange: (key: LobbyTabKey) => void;
  tournamentsBadgeCount?: number;
  dense?: boolean;
  /** Equal-width segments filling the parent (desktop mode row). */
  stretch?: boolean;
}) {
  return (
    <View
      className={`ui-row items-stretch h-9 lobby-hud overflow-hidden border border-border bg-bg ${
        dense ? "" : "mx-4"
      } ${stretch ? "w-full" : ""}`}
      style={stretch ? { alignSelf: "stretch" } : undefined}
    >
      {TAB_ORDER.map((tab, index) => {
        const selected = active === tab.key;
        const showCount = tab.key === "tournaments" && Boolean(tournamentsBadgeCount);
        const label = showCount ? `${tab.label} (${tournamentsBadgeCount})` : tab.label;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className={`btn h-9 px-4 items-center justify-center rounded-none ${
              stretch ? "" : "shrink"
            } ${index > 0 ? "border-l border-border/60" : ""} ${
              selected ? "bg-panel-elevated border-b-2 border-b-gold" : "bg-transparent"
            }`}
            style={{
              borderRadius: 0,
              backgroundColor: selected ? undefined : "transparent",
              ...(stretch ? { flex: 1 } : null),
            }}
          >
            <Text
              className={`text-[13px] font-semibold ${selected ? "text-gold" : "text-muted"}`}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
