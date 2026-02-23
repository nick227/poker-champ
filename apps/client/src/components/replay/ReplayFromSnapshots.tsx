import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { useReplayTableProviderFromSnapshots } from "@/hooks/useReplayTableProviderFromSnapshots";
import { useBankroll } from "@/hooks/useBankroll";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import { ReplaySurface } from "./ReplaySurface";

interface ReplayFromSnapshotsProps {
  snapshots: readonly TableSnapshotPayload[];
  handId?: string;
  compact?: boolean;
  onClose?: () => void;
}

export function ReplayFromSnapshots({
  snapshots,
  compact,
  onClose,
}: ReplayFromSnapshotsProps) {
  const { provider, error } = useReplayTableProviderFromSnapshots(snapshots);
  const { cents: balanceCents } = useBankroll();

  const surfaceProps = useMemo(() => {
    if (!provider) return null;
    return {
      snapshot: provider.snapshot,
      sceneModel: provider.sceneModel,
      onAction: provider.onAction,
      opponents: mapSeatsToOpponents(provider.snapshot),
      balanceCents,
      controller: provider.replay,
      compact,
    };
  }, [provider, balanceCents, compact]);

  if (error || !provider) {
    return (
      <View className="items-center justify-center p-6">
        <Text variant="muted" className="text-center">
          {error ?? "No replay data."}
        </Text>
      </View>
    );
  }

  if (!surfaceProps) return null;

  return <ReplaySurface {...surfaceProps} />;
}
