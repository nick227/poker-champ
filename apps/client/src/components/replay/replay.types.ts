import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TableSceneModel } from "@/components/domain/table/hooks/useTableSceneModel";
import type { ReplayController } from "@/types/replayController";
import type { Opponent } from "@/components/domain/table/TableLayout";
import type { ActionBarOnAction } from "@/components/domain/table/ActionBar";

export type ReplaySource =
  | { type: "handId"; handId: string }
  | {
      type: "snapshots";
      snapshots: readonly TableSnapshotPayload[];
      handId?: string;
    };

export type ReplayContentProps = {
  source: ReplaySource;
  compact?: boolean;
  onClose?: () => void;
};

export type ReplaySurfaceProps = {
  snapshot: TableSnapshotPayload;
  sceneModel: TableSceneModel;
  onAction: ActionBarOnAction;
  opponents: Opponent[];
  balanceCents: number;
  controller: ReplayController;
  compact?: boolean;
};
