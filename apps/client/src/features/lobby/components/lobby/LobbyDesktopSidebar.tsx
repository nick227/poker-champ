import { Pressable, TextInput, View } from "react-native";
import { Text } from "@/components/base/Text";
import { Button } from "@/components/base/Button";
import { formatCents } from "@/lib/format";
import { LobbyContinuePlaying } from "./LobbyContinuePlaying";
import type { LobbyTableFilters } from "../../lobbyTableFilters";

const STAKE_CAPS: Array<{ label: string; maxBb: number | null }> = [
  { label: "Any", maxBb: null },
  { label: "≤ $1", maxBb: 100 },
  { label: "≤ $5", maxBb: 500 },
  { label: "≤ $25", maxBb: 2500 },
];

type Props = {
  bankrollCents: number;
  filters: LobbyTableFilters;
  onFiltersChange: (next: LobbyTableFilters) => void;
  onCreateTable: () => void;
  onCreateTournament: () => void;
  createTableLabel: string;
};

export function LobbyDesktopSidebar({
  bankrollCents,
  filters,
  onFiltersChange,
  onCreateTable,
  onCreateTournament,
  createTableLabel,
}: Props) {
  return (
    <View className="w-[300px] shrink-0 border-l border-border pl-4 ui-stack-4">
      <View className="ui-stack-1">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase">
          Bankroll
        </Text>
        <Text className="text-3xl font-bold text-text tracking-tight">
          {formatCents(bankrollCents)}
        </Text>
      </View>

      <LobbyContinuePlaying />

      <View className="ui-stack-2">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase">
          Filters
        </Text>
        <TextInput
          value={filters.query}
          onChangeText={(query) => onFiltersChange({ ...filters, query })}
          placeholder="Search tables (/)"
          placeholderTextColor="hsl(0 0% 58%)"
          className="rounded-md border border-border bg-panel px-3 py-2 text-text"
          // @ts-expect-error web data attribute for / focus
          dataSet={{ lobbySearch: true }}
        />
        <Pressable
          onPress={() => onFiltersChange({ ...filters, hideFull: !filters.hideFull })}
          className={`rounded-md border px-3 py-2 ${
            filters.hideFull ? "border-primary bg-brand-soft" : "border-border bg-panel"
          }`}
        >
          <Text variant="body">Hide full tables</Text>
        </Pressable>
        <View className="ui-row flex-wrap gap-2">
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

      <View className="ui-stack-2">
        <Text variant="muted" className="text-[11px] tracking-widest uppercase">
          Create
        </Text>
        <Button intent="accent" title={createTableLabel} onPress={onCreateTable} />
        <Button intent="ghost" title="Create tournament" onPress={onCreateTournament} />
      </View>
    </View>
  );
}
