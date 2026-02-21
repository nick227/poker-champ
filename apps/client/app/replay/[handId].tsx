import { View } from "react-native";
import { useMemo } from "react";
import { Screen } from "@/components/containers/Screen";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { BottomBar } from "@/components/containers/BottomBar";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { useHandReplayTableProvider } from "@/hooks/useHandReplayTableProvider";
import { useLocalSearchParams } from "expo-router";
import { useBankroll } from "@/hooks/useBankroll";
import { mapSeatsToOpponents } from "@/components/domain/table/table.adapter";
import { Text as BaseText } from "@/components/base/Text";

export default function ReplayScreen() {
  const { handId } = useLocalSearchParams<{ handId: string }>();
  const handIdStr = Array.isArray(handId) ? handId[0] : handId ?? "";
  const { provider, loading, error } = useHandReplayTableProvider(handIdStr);
  const { cents: balanceCents } = useBankroll();
  const snapshot = provider?.snapshot;
  const opponents = useMemo(
    () => (snapshot ? mapSeatsToOpponents(snapshot) : []),
    [snapshot]
  );

  const wrapWithShell = (content: React.ReactNode) => (
    <Screen>
      <Masthead />
      <View className="flex-1 ui-stack-3">
        {content}
      </View>
      <BottomBar active="history" />
    </Screen>
  );

  if (!handIdStr) {
    return wrapWithShell(
      <View className="flex-1 justify-center items-center px-4">
        <BaseText variant="muted" className="text-center">Error: No hand ID provided</BaseText>
      </View>
    );
  }

  if (error) {
    return wrapWithShell(
      <View className="flex-1 justify-center items-center px-4">
        <BaseText variant="muted" className="text-center">{error}</BaseText>
      </View>
    );
  }

  if (loading || !provider) {
    return wrapWithShell(
      <View className="flex-1 justify-center items-center">
        <BaseText variant="muted">Loading replay...</BaseText>
      </View>
    );
  }

  const { onAction, replay } = provider;

  return wrapWithShell(
    <View className="flex-1">
      <TableLayout
        snapshot={provider.snapshot}
        onAction={onAction}
        sceneModel={{
          ...provider.sceneModel,
          canAct: false,
          actionContext: {
            ...provider.sceneModel.actionContext,
            showActions: false,
            allowedActions: {
              FOLD: false,
              CHECK: false,
              CALL: false,
              ALL_IN: false,
              WAGER: false,
            },
          },
        }}
        opponents={opponents}
        balanceCents={balanceCents}
        tableStatus="REPLAY"
        connectionStatus="CONNECTED"
      />
      <ReplayControls
        currentStep={replay.currentStep}
        totalSteps={replay.totalSteps}
        onPrev={replay.prev}
        onNext={replay.next}
        onPlay={replay.play}
        isPlaying={replay.isPlaying}
      />
    </View>
  );
}
