export function isPersistentSeatsEnabled(): boolean {
  return process.env.FEATURE_PERSISTENT_SEATS === "true";
}

export function isTableSnapshotLogPersistenceEnabled(): boolean {
  return process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE === "true";
}

export function isLeaderboardEnabled(): boolean {
  const value = process.env.ENABLE_LEADERBOARD;
  if (value == null) return true;
  return value === "true";
}
