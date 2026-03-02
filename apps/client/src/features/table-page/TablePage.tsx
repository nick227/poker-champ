import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { useTablePageController } from "./useTablePageController";
import { TableSceneRouter } from "./TableSceneRouter";
import { TablePageOverlays } from "./TablePageOverlays";
import { useTableAwardsToast } from "@/hooks/useTableAwardsToast";

export function TablePage() {
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{
    id: string;
    buyInCents?: string;
  }>();
  const controller = useTablePageController({
    id: id ? String(id) : undefined,
    buyInCentsParam,
  });

  const { scene, renderModel, uiState, actions } = controller;
  const isAtTable = scene.mode === "active" || scene.mode === "idle";
  const { newAwards, dismissAwards } = useTableAwardsToast(isAtTable);

  return (
    <Screen>
      <TableSceneRouter scene={scene} renderModel={renderModel} actions={actions} />
      {newAwards.length > 0 ? (
        <AwardToaster awards={newAwards} onDismiss={dismissAwards} />
      ) : null}
      <TablePageOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
      <BottomBar active="table" />
    </Screen>
  );
}
