import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/containers/Screen";
import { AwardToaster } from "@/components/domain/awards/AwardToaster";
import { useTablePageController } from "./useTablePageController";
import { TableSceneRouter } from "./TableSceneRouter";
import { TablePageOverlays } from "./TablePageOverlays";
import { TableSideDock } from "./TableSideDock";
import { useTableAwardsToast } from "@/hooks/useTableAwardsToast";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { useProfile } from "@/hooks/useProfile";
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
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const profile = useProfile();
  const currentUserId = profile.userId ?? "";

  const { scene, renderModel, uiState, actions } = controller;
  const isAtTable = scene.mode === "active" || scene.mode === "idle";
  const { newAwards, dismissAwards } = useTableAwardsToast(isAtTable);

  return (
    <Screen>
      <View className={`flex-1 min-h-0 ${isDesktopWorkspace ? "flex-row" : ""}`}>
        <Surface styleId="surface.sim.table" className="flex-1 min-w-0">
          <TableSceneRouter scene={scene} renderModel={renderModel} actions={actions} />
        </Surface>
        {isDesktopWorkspace ? (
          <TableSideDock
            collapsed={dockCollapsed}
            onToggle={() => setDockCollapsed((v) => !v)}
            currentUserId={currentUserId}
          />
        ) : null}
      </View>
      {newAwards.length > 0 ? (
        <AwardToaster awards={newAwards} onDismiss={dismissAwards} />
      ) : null}
      <TablePageOverlays renderModel={renderModel} uiState={uiState} actions={actions} />
    </Screen>
  );
}
