export type TournamentPlayFormat = "FREEZEOUT" | "REBUY";

export type TournamentTableOverlay = {
  tournamentId: string;
  status: string;
  currentLevel: number;
  smallBlindCents: number;
  bigBlindCents: number;
  anteCents: number;
  nextLevelAtTs: number | null;
  playFormat?: TournamentPlayFormat;
};
