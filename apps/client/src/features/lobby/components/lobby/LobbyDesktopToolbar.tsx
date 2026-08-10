import { TextInput, View } from "react-native";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import type { LobbyTableFilters } from "../../lobbyTableFilters";
import type { LobbyContentMode } from "../../lobbyContentMode";

export type { LobbyContentMode, LobbyTabKey } from "../../lobbyContentMode";

const MODE_CHIPS: Array<{ key: LobbyContentMode; label: string }> = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash" },
  { key: "tournaments", label: "Tournaments" },
];

const STAKE_CAPS: Array<{ label: string; maxBb: number | null }> = [
  { label: "Any", maxBb: null },
  { label: "≤ $1", maxBb: 100 },
  { label: "≤ $5", maxBb: 500 },
  { label: "≤ $25", maxBb: 2500 },
];

type Props = {
  mode: LobbyContentMode;
  onModeChange: (mode: LobbyContentMode) => void;
  tournamentsBadgeCount?: number;
  filters: LobbyTableFilters;
  onFiltersChange: (next: LobbyTableFilters) => void;
  resultLabel?: string;
  padded?: boolean;
};

/** Quiet filter line: content mode chips + search + list filters. */
export function LobbyDesktopToolbar({
  mode,
  onModeChange,
  tournamentsBadgeCount,
  filters,
  onFiltersChange,
  resultLabel,
  padded = false,
}: Props) {
  return (
    <View className={`ui-row items-center flex-wrap gap-2 w-full pb-4 ${padded ? "px-4" : ""}`}>
      <View className="ui-row items-center gap-1.5 shrink-0">
        {MODE_CHIPS.map((chip) => {
          const label =
            chip.key === "tournaments" && tournamentsBadgeCount
              ? `${chip.label} (${tournamentsBadgeCount})`
              : chip.label;
          return (
            <ChipButton
              key={chip.key}
              title={label}
              selected={mode === chip.key}
              selectedAccent="gold"
              onPress={() => onModeChange(chip.key)}
              className="h-7 min-h-[28px]"
            />
          );
        })}
      </View>
      <TextInput
        value={filters.query}
        onChangeText={(query) => onFiltersChange({ ...filters, query })}
        placeholder="Search"
        placeholderTextColor="hsl(0 0% 58%)"
        className="h-7 rounded-2 border border-border bg-panel px-3 text-text text-[12px]"
        style={{
          height: 28,
          paddingVertical: 0,
          borderRadius: 8,
          flex: 1,
          minWidth: 120,
        }}
        // @ts-expect-error web data attribute for / focus
        dataSet={{ lobbySearch: true }}
      />
      <View className="ui-row items-center flex-wrap gap-1.5 shrink-0">
        <ChipButton
          title="Hide full"
          selected={filters.hideFull}
          onPress={() => onFiltersChange({ ...filters, hideFull: !filters.hideFull })}
          selectedAccent="gold"
          className="h-7 min-h-[28px]"
        />
        {STAKE_CAPS.map((cap) => {
          const active = filters.maxBigBlindCents === cap.maxBb;
          return (
            <ChipButton
              key={cap.label}
              title={cap.label}
              selected={active}
              selectedAccent="gold"
              onPress={() => onFiltersChange({ ...filters, maxBigBlindCents: cap.maxBb })}
              className="h-7 min-h-[28px]"
            />
          );
        })}
      </View>
      {resultLabel ? (
        <Text variant="muted" className="text-[11px] shrink-0 tabular-nums">
          {resultLabel}
        </Text>
      ) : null}
    </View>
  );
}
