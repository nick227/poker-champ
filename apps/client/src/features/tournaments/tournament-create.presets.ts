import type { TournamentBlindStructureId } from "@/lib/tournament-blind-structures";

export type TournamentPacePreset = "fast" | "regular" | "long";

export type TournamentPlayFormatChoice = "FREEZEOUT" | "REBUY";

export const TOURNAMENT_ENTRY_FEE_OPTIONS = [
  { label: "1¢", cents: 1 },
  { label: "11¢", cents: 11 },
  { label: "25¢", cents: 25 },
  { label: "$1", cents: 100 },
  { label: "$5", cents: 500 },
] as const;

export const TOURNAMENT_STARTING_STACK_OPTIONS = [
  { label: "1.5K", chips: 1500 },
  { label: "3K", chips: 3000 },
  { label: "5K", chips: 5000 },
  { label: "10K", chips: 10_000 },
  { label: "15K", chips: 15_000 },
] as const;

export const TOURNAMENT_PACE_OPTIONS: ReadonlyArray<{
  id: TournamentPacePreset;
  label: string;
  description: string;
  blindStructureId: TournamentBlindStructureId;
}> = [
  {
    id: "fast",
    label: "Fast",
    description: "4 min levels · 14 levels",
    blindStructureId: "fast_4min",
  },
  {
    id: "regular",
    label: "Regular",
    description: "8 min levels · 10 levels",
    blindStructureId: "standard_8min",
  },
  {
    id: "long",
    label: "Long",
    description: "12 min levels · 12 levels",
    blindStructureId: "long_12min",
  },
];

// 2-9 fit at a single table (MAX_SEATS_PER_TABLE on the server). Larger sizes span multiple
// tables (see docs/proposals/MULTI_TABLE_TOURNAMENT_PROPOSAL.md) and are offered in table-sized
// steps of 9 so the field always divides evenly into full tables.
export const TOURNAMENT_MAX_PLAYERS_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 18, 27, 45, 90, 180] as const;

export const MAX_SINGLE_TABLE_PLAYERS = 9;

export const TOURNAMENT_MAX_REBUYS_OPTIONS = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "Unlimited", value: 10 },
] as const;

export function blindStructureIdForPace(pace: TournamentPacePreset): TournamentBlindStructureId {
  const row = TOURNAMENT_PACE_OPTIONS.find((opt) => opt.id === pace);
  return row?.blindStructureId ?? "standard_8min";
}

export function defaultPacePreset(): TournamentPacePreset {
  return "regular";
}

export function defaultEntryFeeCents(): number {
  return TOURNAMENT_ENTRY_FEE_OPTIONS[3].cents;
}

export function defaultStartingStackChips(): number {
  return TOURNAMENT_STARTING_STACK_OPTIONS[3].chips;
}
