import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export function assertReplaySnapshotsShape(
  snapshots: readonly TableSnapshotPayload[],
  handId: string,
): readonly TableSnapshotPayload[] {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error(`Community hand "${handId}" has no snapshots.`);
  }

  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i];
    if (snapshot == null || typeof snapshot !== "object") {
      throw new Error(`Community hand "${handId}" has invalid snapshot at index ${i}.`);
    }
    if (snapshot.version !== 1) {
      throw new Error(
        `Community hand "${handId}" uses unsupported snapshot version "${String(snapshot.version)}".`,
      );
    }
    if (!snapshot.table?.tableId) {
      throw new Error(`Community hand "${handId}" snapshot ${i} missing table.tableId.`);
    }
    if (!snapshot.hero?.userId) {
      throw new Error(`Community hand "${handId}" snapshot ${i} missing hero.userId.`);
    }
    if (!Array.isArray(snapshot.seats) || snapshot.seats.length === 0) {
      throw new Error(`Community hand "${handId}" snapshot ${i} has no seats.`);
    }
  }

  return snapshots;
}
