import { useEffect, useState } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { ChipButton } from "@/components/base/ChipButton";
import { Text } from "@/components/base/Text";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";
import { formatCountdownTo, formatTournamentStatus } from "@/lib/tournament.utils";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;

export function TournamentTableBanner({ tournament }: { tournament: TournamentOverlay }) {
  const { formatBlinds, formatAnte, mode, setMode } = useTableMoneyDisplay();
  const [countdown, setCountdown] = useState<string | null>(
    formatCountdownTo(tournament.nextLevelAtTs),
  );

  useEffect(() => {
    const tick = () => setCountdown(formatCountdownTo(tournament.nextLevelAtTs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tournament.nextLevelAtTs]);

  const blindsLine = formatBlinds(tournament.smallBlindCents, tournament.bigBlindCents);
  const anteSuffix = tournament.anteCents > 0 ? ` · Ante ${formatAnte(tournament.anteCents)}` : "";

  return (
    <View className="border-b border-brand/30 bg-brand/10 px-4 py-2 ui-stack-2">
      <View className="ui-row flex-wrap items-center justify-between gap-2">
        <Text variant="label" className="text-brand">
          Tournament · {formatTournamentStatus(tournament.status)}
        </Text>
        <View className="ui-row items-center gap-2">
          <ChipButton title="Chips" selected={mode === "chips"} onPress={() => setMode("chips")} />
          <ChipButton title="BB" selected={mode === "bb"} onPress={() => setMode("bb")} />
        </View>
      </View>
      <Text variant="label">
        Level {tournament.currentLevel} · Blinds {blindsLine}
        {anteSuffix}
      </Text>
      {countdown ? (
        <Text variant="body" className="text-muted">
          Next level in {countdown}
        </Text>
      ) : null}
    </View>
  );
}
