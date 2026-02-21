import type { ReactNode } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";
import type { TableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";

export type TableSceneChromeSlots = {
  topBarLeft?: ReactNode;
  topBarRight?: ReactNode;
};

export type TableSceneContract = {
  snapshot: TableSnapshotPayload;
  sceneModel: TableSceneModel;
  onAction?: ActionBarOnAction;
  chrome?: TableSceneChromeSlots;
};

