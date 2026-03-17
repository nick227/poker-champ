import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ConnectionStatus } from "../table.types";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import { deriveTableViewState, type TableViewState } from "./deriveTableViewState";

export function buildTableSceneModel(
  snapshot: TableSnapshotPayload,
  connectionStatus?: ConnectionStatus,
) {
  return deriveTableViewState(snapshot, connectionStatus);
}

export type TableSceneModel = TableViewState;

export function useTableSceneModel(
  snapshot: TableSnapshotPayload | null,
  connectionStatus?: ConnectionStatus,
) {
  const effective = snapshot ?? DUMMY_TABLE_SNAPSHOT;
  return useMemo(
    () => deriveTableViewState(effective, connectionStatus),
    [effective, connectionStatus],
  );
}
