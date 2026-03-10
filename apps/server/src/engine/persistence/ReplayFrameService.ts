import { TableSnapshotPayloadSchema, type TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { getPrisma } from "@poker-champ/db";
import { toFrameReason } from "../replay/FrameReason.js";

export class ReplayFrameService {
  static async getFramesForHand(handId: string): Promise<TableSnapshotPayload[]> {
    const prisma = getPrisma() as any;
    const rows = await prisma.tableSnapshotLog.findMany({
      where: {
        handId,
        payloadJson: {
          path: "$.hero.userId",
          equals: "SYSTEM",
        },
      },
      select: {
        payloadJson: true,
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const bySeq = new Map<number, TableSnapshotPayload>();
    for (const row of rows as Array<{ payloadJson: unknown }>) {
      const parsed = TableSnapshotPayloadSchema.safeParse(row.payloadJson);
      if (!parsed.success) continue;
      if (toFrameReason(parsed.data.reason) == null) continue;
      if (!bySeq.has(parsed.data.snapshotSeq)) {
        bySeq.set(parsed.data.snapshotSeq, parsed.data);
      }
    }

    return [...bySeq.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, payload]) => payload);
  }
}


