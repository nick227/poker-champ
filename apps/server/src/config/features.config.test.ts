import { afterEach, describe, expect, it } from "vitest";
import { isTableSnapshotLogPersistenceEnabled } from "./features.js";

describe("feature config", () => {
  const prevSnapshotLogFlag = process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE;

  afterEach(() => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = prevSnapshotLogFlag;
  });

  it("enables snapshot log persistence by default when env is unset", () => {
    delete process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE;
    expect(isTableSnapshotLogPersistenceEnabled()).toBe(true);
  });

  it("allows explicit opt-out for snapshot log persistence", () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "false";
    expect(isTableSnapshotLogPersistenceEnabled()).toBe(false);
  });

  it("keeps enabled when explicitly set true", () => {
    process.env.FEATURE_TABLE_SNAPSHOT_LOG_PERSISTENCE = "true";
    expect(isTableSnapshotLogPersistenceEnabled()).toBe(true);
  });
});
