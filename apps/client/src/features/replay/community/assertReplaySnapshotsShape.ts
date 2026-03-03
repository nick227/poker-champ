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

  const finalSnapshot = snapshots[snapshots.length - 1];
  if (finalSnapshot.reason !== "HAND_END") {
    throw new Error(`Community hand "${handId}" must end on HAND_END snapshot.`);
  }

  const result = finalSnapshot.lastHandResult;
  if (!result) {
    throw new Error(`Community hand "${handId}" final snapshot missing lastHandResult.`);
  }
  if (result.reason !== "SHOWDOWN") {
    throw new Error(`Community hand "${handId}" final snapshot must use SHOWDOWN result.`);
  }

  const hasWinner = Boolean(result.winnerId) || Object.keys(result.payoutsByUserId ?? {}).length > 0;
  if (!hasWinner) {
    throw new Error(`Community hand "${handId}" final snapshot missing winner/payout data.`);
  }

  const showdownByUser = result.showdownHoleCardsByUserId ?? {};
  if (Object.keys(showdownByUser).length < 2) {
    throw new Error(`Community hand "${handId}" must include showdown hole cards for both players.`);
  }

  return snapshots;
}
