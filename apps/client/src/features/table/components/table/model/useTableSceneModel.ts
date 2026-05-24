import { useMemo } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { ConnectionStatus } from "../table.types";
import { DUMMY_TABLE_SNAPSHOT } from "../dummyTableSnapshot";
import {
  deriveTableViewState,
  type DeriveTableViewStateOptions,
  type TableViewState,
} from "./deriveTableViewState";

export function buildTableSceneModel(
  snapshot: TableSnapshotPayload,
  connectionStatus?: ConnectionStatus,
  options?: DeriveTableViewStateOptions,
) {
  return deriveTableViewState(snapshot, connectionStatus, options);
}

export type TableSceneModel = TableViewState;

export function useTableSceneModel(
  snapshot: TableSnapshotPayload | null,
  connectionStatus?: ConnectionStatus,
  options?: DeriveTableViewStateOptions,
) {
  const effective = snapshot ?? DUMMY_TABLE_SNAPSHOT;
  return useMemo(
    () => deriveTableViewState(effective, connectionStatus, options),
    [effective, connectionStatus, options],
  );
}
