import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
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
  useTableAwardsToast(isAtTable);

  return (
    <Screen>
      <View className="flex-1 min-h-0">
        <Surface styleId="surface.sim.table" className="flex-1 min-w-0">
          <TableSceneRouter scene={scene} renderModel={renderModel} actions={actions} />
        </Surface>
      </View>
      <TablePageOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
    </Screen>
  );
}
