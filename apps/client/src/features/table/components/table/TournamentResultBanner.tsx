import { useEffect, useRef, useState } from "react";
import type { TableSnapshotPayload } from "@poker-champ/realtime-contract";
import { emitHapticEvent } from "@/haptics/emitHapticEvent";
import { TournamentInTheMoneyReveal } from "./TournamentInTheMoneyReveal";
import {
  buildTournamentResultRevealKey,
  getTournamentResultTier,
  shouldShowTournamentResultOverlay,
} from "./tournament-result.utils";

type TournamentOverlay = NonNullable<TableSnapshotPayload["table"]["tournament"]>;
type TournamentViewer = NonNullable<TableSnapshotPayload["hero"]["tournamentViewer"]>;

type TournamentResultBannerProps = {
  tournament: TournamentOverlay;
  tournamentViewer?: TournamentViewer;
  onViewStandings: () => void;
  onBackToLobby: () => void;
};

export function TournamentResultBanner({
  tournament,
  tournamentViewer,
  onViewStandings,
  onBackToLobby,
}: TournamentResultBannerProps) {
  const eliminated = tournamentViewer?.isEliminated === true;
  const showOverlay = shouldShowTournamentResultOverlay(tournamentViewer, tournament.status);

  const place = tournamentViewer?.finishPlace;
  const payoutCents = tournamentViewer?.payoutCents ?? 0;
  const tier = getTournamentResultTier(place, payoutCents);
  const revealKey = buildTournamentResultRevealKey(
    tournament.tournamentId,
    place,
    payoutCents,
  );

  const [revealDismissed, setRevealDismissed] = useState(false);
  useEffect(() => {
    setRevealDismissed(false);
  }, [revealKey]);

  // Bust-out-without-cashing is the one clear "hand loss" moment in the
  // tournament flow; ITM finishes (tier !== "none") already get the win
  // haptic from TournamentInTheMoneyReveal, so this only covers the rest.
  const eliminatedHapticKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!eliminated || tier !== "none") return;
    if (eliminatedHapticKeyRef.current === revealKey) return;
    eliminatedHapticKeyRef.current = revealKey;
    emitHapticEvent("tournament.eliminated");
  }, [eliminated, tier, revealKey]);

  if (!showOverlay) return null;

  const showInTheMoneyReveal = tier !== "none" && !revealDismissed && place != null;

  if (!showInTheMoneyReveal) return null;

  return (
    <TournamentInTheMoneyReveal
      visible
      tier={tier}
      finishPlace={place}
      payoutCents={payoutCents}
      onDismiss={() => setRevealDismissed(true)}
      onViewStandings={onViewStandings}
      onBackToLobby={onBackToLobby}
    />
  );
}
