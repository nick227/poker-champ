import type { Opponent } from "../table.adapter";
import { getStatusLabel } from "./utils";

export function useOpponentStripItem(
  opponent: Opponent,
  winnerName: string | undefined,
  activeTurnProgress: number | null | undefined,
) {
  const inactive =
    opponent.status === "folded" || opponent.status === "sittingOut" || opponent.status === "reconnecting";
  const actionText = opponent.actionLabel ?? getStatusLabel(opponent.status) ?? "---";
  const isWinner = winnerName === opponent.name;
  const showTurnBar = Boolean(opponent.isActive && activeTurnProgress != null);
  return { inactive, actionText, isWinner, showTurnBar };
}
