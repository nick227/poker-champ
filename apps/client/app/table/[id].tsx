import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { MultiTableTabs } from "@/components/domain/table/MultiTableTabs";
import { useTableScreenController } from "./useTableScreenController";
import { TableScreenScene } from "./TableScreenScene";
import { TableScreenOverlays } from "./TableScreenOverlays";

export default function TableScreen() {
  const { id, buyInCents: buyInCentsParam } = useLocalSearchParams<{ id: string; buyInCents?: string }>();
  const controller = useTableScreenController({
    id: id ? String(id) : undefined,
    buyInCentsParam,
  });

  const { scene, renderModel, uiState, actions } = controller;

  return (
    <Screen>
      {(renderModel.openTableIds?.length ?? 0) > 1 && (
        <View className="ui-p-stack-2">
          <MultiTableTabs
            openTableIds={renderModel.openTableIds}
            activeTableId={renderModel.activeTableId}
            onSelectTable={actions.selectTableTab}
            onOpenMoreTables={actions.openMoreTables}
          />
        </View>
      )}
      <TableScreenScene scene={scene} renderModel={renderModel} actions={actions} />
      <TableScreenOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
      <BottomBar active="table" />
    </Screen>
  );
}
