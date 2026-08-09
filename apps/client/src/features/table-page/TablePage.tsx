import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { useTablePageController } from "./useTablePageController";
import { TableSceneRouter } from "./TableSceneRouter";
import { TablePageOverlays } from "./TablePageOverlays";
import { useTableAwardsToast } from "@/hooks/useTableAwardsToast";
import { Surface } from "@/components/containers/Surface";

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
      <Surface styleId="surface.sim.table" className="flex-1">
        <TableSceneRouter scene={scene} renderModel={renderModel} actions={actions} />
      </Surface>
      {newAwards.length > 0 ? (
        <AwardToaster awards={newAwards} onDismiss={dismissAwards} />
      ) : null}
      <TablePageOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
    </Screen>
  );
}
