import type { components } from "@poker-champ/sdk";

export type TournamentSummary = components["schemas"]["TournamentSummary"];

export type TournamentStandingRow = {
  userId: string;
  displayName: string;
  finishPlace: number | null;
  eliminatedAt: string | null;
  payoutCents: number;
  isBot: boolean;
};

export type TournamentCtaAction = "register" | "unregister" | "join" | "standings" | "none";

export type TournamentCta = {
  label: string;
  action: TournamentCtaAction;
  disabled: boolean;
};
