import { useEffect, useState } from "react";
import { View } from "react-native";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { Text } from "@/components/base/Text";
import { formatCents } from "@/lib/format";
import { formatCountdownTo, formatTournamentStatus } from "@/lib/tournament.utils";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;

export function TournamentTableBanner({ tournament }: { tournament: TournamentOverlay }) {
  const [countdown, setCountdown] = useState<string | null>(
    formatCountdownTo(tournament.nextLevelAtTs),
  );

  useEffect(() => {
    const tick = () => setCountdown(formatCountdownTo(tournament.nextLevelAtTs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tournament.nextLevelAtTs]);

  return (
    <View className="border-b border-brand/30 bg-brand/10 px-4 py-2">
      <View className="ui-row flex-wrap items-center justify-between gap-2">
        <Text variant="label" className="text-brand">
          Tournament · {formatTournamentStatus(tournament.status)}
        </Text>
        <Text variant="label">
          Level {tournament.currentLevel} · {formatCents(tournament.smallBlindCents)} /{" "}
          {formatCents(tournament.bigBlindCents)}
          {tournament.anteCents > 0 ? ` · Ante ${formatCents(tournament.anteCents)}` : ""}
        </Text>
      </View>
      {countdown ? (
        <Text variant="body" className="text-muted">
          Next level in {countdown}
        </Text>
      ) : null}
    </View>
  );
}
