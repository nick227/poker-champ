import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import type { TableDisplayEvents } from "@/features/table";

export type DisplayEventsPolicyInput = {
  translatedEvents: TableDisplayEvents;
  snapshot: TableSnapshotPayload | undefined;
  hasObservedActiveHand: boolean;
  previousOccupiedHumanCount: number | null;
  hiddenWinnerHandId: string | null;
};

export function getOccupiedHumanCount(
  snapshot: TableSnapshotPayload | undefined,
): number {
  return (snapshot?.seats ?? []).reduce(
    (count, seat) => (seat.occupied && !seat.isBot ? count + 1 : count),
    0,
  );
}

export function resolveDisplayEventsForRender({
  translatedEvents,
  snapshot,
  hasObservedActiveHand,
  previousOccupiedHumanCount,
  hiddenWinnerHandId,
}: DisplayEventsPolicyInput): TableDisplayEvents {
  const occupiedHumanCount = getOccupiedHumanCount(snapshot);
  const humansLeftAndNoHand =
    previousOccupiedHumanCount != null &&
    occupiedHumanCount < previousOccupiedHumanCount &&
    !snapshot?.hand;
  const staleTerminalOnOpen =
    !hasObservedActiveHand &&
    !snapshot?.hand &&
    translatedEvents.winnerBanner != null;
  const hiddenWinnerMatches =
    translatedEvents.winnerBanner != null &&
    hiddenWinnerHandId === translatedEvents.winnerBanner.handId;

  return {
    actionNotice: translatedEvents.actionNotice,
    winnerBanner:
      staleTerminalOnOpen || humansLeftAndNoHand || hiddenWinnerMatches
        ? null
        : translatedEvents.winnerBanner,
  };
}
