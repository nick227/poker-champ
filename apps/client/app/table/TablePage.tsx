import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { useTablePageController } from "./useTablePageController";
import { TableSceneRouter } from "./TableSceneRouter";
import { TablePageOverlays } from "./TablePageOverlays";

export function TablePage() {
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{ id: string; buyInCents?: string }>();
  const controller = useTablePageController({
    id: id ? String(id) : undefined,
    buyInCentsParam,
  });

  const { scene, renderModel, uiState, actions } = controller;

  return (
    <Screen>
      <TableSceneRouter scene={scene} renderModel={renderModel} actions={actions} />
      <TablePageOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
      <BottomBar active="table" />
    </Screen>
  );
}

export default TablePage;

