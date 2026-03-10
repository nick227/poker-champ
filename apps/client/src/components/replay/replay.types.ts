import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TableSceneModel } from "@/features/table";
import type { ReplayController } from "@/types/replayController";
import type { Opponent } from "@/features/table";
import type { ActionBarOnAction } from "@/features/table";

export type ReplayMessage = {
  id: string;
  step: number;
  body: string;
  title?: string;
};

export type ReplaySource =
  | { type: "handId"; handId: string; messages?: readonly ReplayMessage[] }
  | {
      type: "snapshots";
      snapshots: readonly TableSnapshotPayload[];
      handId?: string;
      messages?: readonly ReplayMessage[];
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


