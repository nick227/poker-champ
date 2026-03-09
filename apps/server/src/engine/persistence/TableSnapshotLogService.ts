import { getPrisma } from "../../db/prisma.js";
import { logger } from "../../lib/logger.js";

export type SnapshotLogReason =
  | "HAND_START"
  | "ACTION_ACCEPTED"
  | "STREET_TRANSITION"
  | "POT_UPDATED"
  | "SHOWDOWN"
  | "HAND_END"
  | "PLAYER_JOIN"
  | "PLAYER_LEAVE";

export class TableSnapshotLogService {
  private static readonly DEFAULT_PAYLOAD_BYTES_CAP = 256 * 1024;
  private static readonly DEFAULT_SAMPLE_RATE = 1.0;

  private static getPayloadBytesCap(): number {
    const raw = process.env.SNAPSHOT_LOG_MAX_BYTES;
    if (!raw) return TableSnapshotLogService.DEFAULT_PAYLOAD_BYTES_CAP;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return TableSnapshotLogService.DEFAULT_PAYLOAD_BYTES_CAP;
    return parsed;
  }

  private static getSampleRate(): number {
    const raw = process.env.SNAPSHOT_LOG_SAMPLE_RATE;
    if (!raw) return TableSnapshotLogService.DEFAULT_SAMPLE_RATE;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return TableSnapshotLogService.DEFAULT_SAMPLE_RATE;
    if (parsed <= 0) return 0;
    if (parsed >= 1) return 1;
    return parsed;
  }

  static async writeSnapshot(params: {
    tableId: string;
    handId?: string;
    snapshotId: string;
    reason: SnapshotLogReason;
    street: string;
    payloadJson: unknown;
    stateHash: string;
    schemaVersion: number;
  }): Promise<void> {
    const sampleRate = TableSnapshotLogService.getSampleRate();
    if (sampleRate <= 0 || Math.random() > sampleRate) return;

    let payloadBytes = 0;
    try {
      payloadBytes = Buffer.byteLength(JSON.stringify(params.payloadJson), "utf8");
    } catch (err) {
      logger.warn(
        { err, tableId: params.tableId, snapshotId: params.snapshotId },
        "SNAPSHOT_LOG_SERIALIZE_FAILED",
      );
      return;
    }

    const cap = TableSnapshotLogService.getPayloadBytesCap();
    if (payloadBytes > cap) {
      logger.warn(
        {
          tableId: params.tableId,
          snapshotId: params.snapshotId,
          payloadBytes,
          payloadBytesCap: cap,
        },
        "SNAPSHOT_LOG_SKIPPED_PAYLOAD_TOO_LARGE",
      );
      return;
    }

    const prisma = getPrisma() as any;
    const baseData = {
      tableId: params.tableId,
      snapshotId: params.snapshotId,
      reason: params.reason,
      street: params.street,
      payloadJson: params.payloadJson as any,
      payloadBytes,
      stateHash: params.stateHash,
      schemaVersion: params.schemaVersion,
    };

    try {
      await prisma.tableSnapshotLog.create({
        data: {
          ...baseData,
          handId: params.handId ?? null,
        },
      });
      return;
    } catch (err: any) {
      // Duplicate snapshotId is idempotent/no-op.
      if (err?.code === "P2002") return;
      if (err?.code !== "P2003") throw err;
      const fieldName = String(err?.meta?.field_name ?? "");
      // Table not in DB (e.g. ephemeral/test table) – skip logging.
      if (fieldName.includes("tableId")) {
        logger.warn(
          { tableId: params.tableId, snapshotId: params.snapshotId },
          "SNAPSHOT_LOG_TABLE_NOT_PERSISTED_SKIP",
        );
        return;
      }
      // handId not persisted – retry without handId.
      if (params.handId && fieldName.includes("handId")) {
        logger.warn(
          { tableId: params.tableId, handId: params.handId, snapshotId: params.snapshotId },
          "SNAPSHOT_LOG_HAND_ID_NOT_PERSISTED_FALLBACK",
        );
        await prisma.tableSnapshotLog.create({
          data: { ...baseData, handId: null },
        });
      } else {
        throw err;
      }
    }
  }
}
