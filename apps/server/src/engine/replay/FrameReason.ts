import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";

export type FrameReason =
  | "HAND_START"
  | "ACTION_ACCEPTED"
  | "RUNOUT_STAGE"
  | "HAND_SHOWDOWN"
  | "HAND_END";

const FRAME_REASON_SET: ReadonlySet<FrameReason> = new Set<FrameReason>([
  "HAND_START",
  "ACTION_ACCEPTED",
  "RUNOUT_STAGE",
  "HAND_SHOWDOWN",
  "HAND_END",
]);

export function isFrameReason(value: string): value is FrameReason {
  return FRAME_REASON_SET.has(value as FrameReason);
}

export function toFrameReason(reason: TableSnapshotPayload["reason"]): FrameReason | null {
  if (reason === "BOT_ACTION") return "ACTION_ACCEPTED";
  return isFrameReason(reason) ? reason : null;
}

