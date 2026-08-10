import { TextInput, View } from "react-native";
import { Text } from "@/components/base/Text";
import { ChipButton } from "@/components/base/ChipButton";
import type { LobbyTableFilters } from "../../lobbyTableFilters";

const STAKE_CAPS: Array<{ label: string; maxBb: number | null }> = [
  { label: "Any", maxBb: null },
  { label: "≤ $1", maxBb: 100 },
  { label: "≤ $5", maxBb: 500 },
  { label: "≤ $25", maxBb: 2500 },
];

type Props = {
  filters: LobbyTableFilters;
  onFiltersChange: (next: LobbyTableFilters) => void;
  tableCount?: number;
  padded?: boolean;
};

/**
 * Full-width list controls: expanding search, packed filters, trailing count.
 * Create CTAs live on LobbyModeRow.
 */
export function LobbyDesktopToolbar({
  filters,
  onFiltersChange,
  tableCount,
  padded = false,
}: Props) {
  return (
    <View className={`ui-row items-center gap-2 pb-2 w-full ${padded ? "px-4" : ""}`}>
      <TextInput
        value={filters.query}
        onChangeText={(query) => onFiltersChange({ ...filters, query })}
        placeholder="Search tables"
        placeholderTextColor="hsl(0 0% 58%)"
        className="h-8 rounded-2 border border-border bg-panel px-3 text-text text-[12px]"
        style={{
          height: 32,
          paddingVertical: 0,
          borderRadius: 8,
          flex: 1,
          minWidth: 140,
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
          className="h-8 min-h-[32px]"
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
              className="h-8 min-h-[32px]"
            />
          );
        })}
      </View>
      {typeof tableCount === "number" ? (
        <Text variant="muted" className="text-[11px] shrink-0 tabular-nums min-w-[64px] text-right">
          {tableCount} {tableCount === 1 ? "table" : "tables"}
        </Text>
      ) : null}
    </View>
  );
}
