import { View } from "react-native";
import { ActiveTableView } from "@/components/domain/table/views/ActiveTableView";
import { ReplayControls } from "@/components/replay/ReplayControls";
import type { ReplaySurfaceProps } from "./replay.types";

/**
 * Single shared renderer for replay: same ActiveTableView as in-game + ReplayControls.
 * Container controls height; do not use flex:1 on root.
 */
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
  return (
    <View>
      <ActiveTableView
        snapshot={snapshot}
        sceneModel={sceneModel}
        onAction={onAction}
        opponents={opponents}
        balanceCents={balanceCents}
        tableStatus="REPLAY"
        connectionStatus="CONNECTED"
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

