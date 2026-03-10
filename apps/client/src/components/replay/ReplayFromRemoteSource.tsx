import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { useHandReplayTableProvider } from "@/hooks/useHandReplayTableProvider";
import { useBankroll } from "@/hooks/useBankroll";
import { mapSeatsToOpponents } from "@/features/table";
import { ReplaySurface } from "./ReplaySurface";

interface ReplayFromRemoteSourceProps {
  handId: string;
  compact?: boolean;
  onClose?: () => void;
}

export function ReplayFromRemoteSource({
  handId,
  compact,
  onClose,
}: ReplayFromRemoteSourceProps) {
  const { provider, loading, error } = useHandReplayTableProvider(handId);
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

  if (loading) {
    return (
      <View className="items-center justify-center p-6">
        <Text variant="muted">Loading replay...</Text>
      </View>
    );
  }

  if (error || !provider) {
    return (
      <View className="items-center justify-center p-6">
        <Text variant="muted" className="text-center">
          {error ?? "No replay data for this hand."}
        </Text>
      </View>
    );
  }

  if (!surfaceProps) return null;

  return <ReplaySurface {...surfaceProps} />;
}

