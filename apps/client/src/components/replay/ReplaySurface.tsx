import { View } from "react-native";
import { TableLayout } from "@/components/domain/table/TableLayout";
import { ReplayControls } from "@/components/replay/ReplayControls";
import type { ReplaySurfaceProps } from "./replay.types";

/**
 * Single shared renderer for replay: same TableLayout as in-game + ReplayControls.
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
  if (__DEV__ && sceneModel.canAct) {
    console.warn("ReplaySurface received interactive sceneModel; actions should be disabled in replay");
  }
  return (
    <View>
      <TableLayout
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
