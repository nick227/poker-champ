import { View, Pressable } from "react-native";
import { ActiveTableView } from "@/features/table";
import { ReplayControls } from "@/components/replay/ReplayControls";
import { Text } from "@/components/base/Text";
import type { ReplaySurfaceProps } from "./replay.types";
import { getReplayActionMessage, getReplayHandResultMessage } from "./replayMessages";

/**
 * Single shared renderer for replay: same ActiveTableView as in-game + ReplayControls.
 * Container controls height; do not use flex:1 on root.
 */

function goBack() {
  if (typeof window === "undefined") return;

  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
}

export function ReplaySurface({
  snapshot,
  sceneModel,
  onAction,
  opponents,
  balanceCents,
  controller,
}: ReplaySurfaceProps) {
  if (process.env.NODE_ENV !== "production" && sceneModel.canAct) {
    console.warn("ReplaySurface received interactive sceneModel; actions should be disabled in replay");
  }
  const actionMessage = getReplayActionMessage(snapshot);
  const handResultMessage = getReplayHandResultMessage(snapshot);
  return (
    <View>
      <View className="mx-4 mt-4 mb-2 self-start rounded-full border border-border bg-panel px-3 py-1">
        <Pressable
        onPress={goBack}
        >
          <Text variant="label" className="text-xs">
            Back ↩ 
          </Text>
        </Pressable>
      </View>
      <ActiveTableView
        snapshot={snapshot}
        sceneModel={sceneModel}
        onAction={onAction}
        opponents={opponents}
        balanceCents={balanceCents}
        tableStatus="REPLAY"
        connectionStatus="CONNECTED"
        tableMode="replay"
        actionMessage={actionMessage}
        handResultMessage={handResultMessage}
      />
      <ReplayControls
        currentStep={controller.currentStep}
        totalSteps={controller.totalSteps}
        onPrev={controller.prev}
        onNext={controller.next}
        onGoTo={controller.goTo}
        onPlay={() => (controller.isPlaying ? controller.pause() : controller.play())}
        isPlaying={controller.isPlaying}
      />
    </View>
  );
}


