export const TOURNAMENT_BLIND_STRUCTURE_IDS = [
  "fast_4min",
  "standard_8min",
  "long_12min",
] as const;

export type TournamentBlindStructureId = (typeof TOURNAMENT_BLIND_STRUCTURE_IDS)[number];

export function isTournamentBlindStructureId(value: string): value is TournamentBlindStructureId {
  return (TOURNAMENT_BLIND_STRUCTURE_IDS as readonly string[]).includes(value);
}
