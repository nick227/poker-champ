import { Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
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
  onCreateTable: () => void;
  onCreateTournament: () => void;
  createTableLabel: string;
};

/**
 * Cash-games toolbar: list filters on the left, create actions on the right.
 * Replaces the old right-rail that mixed “Filters” with create + orphaned More links.
 */
export function LobbyDesktopToolbar({
  filters,
  onFiltersChange,
  onCreateTable,
  onCreateTournament,
  createTableLabel,
}: Props) {
  return (
    <View className="ui-row items-center flex-wrap gap-3 border-b border-border pb-3 mb-3">
      <View className="ui-row items-center flex-wrap gap-2 flex-1 min-w-[240px]">
        <TextInput
          value={filters.query}
          onChangeText={(query) => onFiltersChange({ ...filters, query })}
          placeholder="Search tables"
          placeholderTextColor="hsl(0 0% 58%)"
          className="min-w-[160px] flex-1 max-w-[220px] rounded-md border border-border bg-panel px-3 py-2 text-text"
          // @ts-expect-error web data attribute for / focus
          dataSet={{ lobbySearch: true }}
        />
        <Pressable
          onPress={() => onFiltersChange({ ...filters, hideFull: !filters.hideFull })}
          className={`rounded-md border px-3 py-2 ${
            filters.hideFull ? "border-primary bg-brand-soft" : "border-border bg-panel"
          }`}
        >
          <Text variant="body" className="text-[13px]">
            Hide full
          </Text>
        </Pressable>
        <View className="ui-row flex-wrap gap-1.5">
          {STAKE_CAPS.map((cap) => {
            const active = filters.maxBigBlindCents === cap.maxBb;
            return (
              <Pressable
                key={cap.label}
                onPress={() =>
                  onFiltersChange({ ...filters, maxBigBlindCents: cap.maxBb })
                }
                className={`rounded-md border px-2.5 py-1.5 ${
                  active ? "border-primary bg-brand-soft" : "border-border bg-panel"
                }`}
              >
                <Text variant={active ? "body" : "muted"} className="text-[12px]">
                  {cap.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="ui-row items-center gap-2 shrink-0">
        <Button
          intent="accent"
          title={createTableLabel}
          onPress={onCreateTable}
          size="sm"
          minWidth={0}
          className="min-h-[36px] px-3"
        />
        <Button
          intent="ghost"
          title="Create tournament"
          onPress={onCreateTournament}
          size="sm"
          minWidth={0}
          className="min-h-[36px] px-3"
        />
      </View>
    </View>
  );
}
