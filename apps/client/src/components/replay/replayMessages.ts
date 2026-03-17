import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import {
  buildActionMessage,
  buildWinnerBannerFromSnapshot,
  type HandResultMessage,
} from "@/features/table";

export function getReplayActionMessage(snapshot: TableSnapshotPayload): string | undefined {
  const lastAction = snapshot.lastAction;
  if (!lastAction) return undefined;
  const actorName =
    snapshot.seats.find((seat) => seat.userId === lastAction.actorUserId)?.name ??
    (lastAction.actorKind === "BOT" ? "Bot" : "Player");
  return buildActionMessage(lastAction, actorName, { shortenActorName: false, includeOriginSuffix: true });
}

export function getReplayHandResultMessage(
  snapshot: TableSnapshotPayload,
): HandResultMessage | undefined {
  return buildWinnerBannerFromSnapshot(snapshot) ?? undefined;
}

