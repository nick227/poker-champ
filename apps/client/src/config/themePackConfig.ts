export type ThemePackId = "default" | "monokai" | "zen" | "mono" | "back-alley" | "cyber";

export type FeltMode = "solid" | "gradient";

export type ThemePackConfig = {
  id: ThemePackId;
  name: string;
  colors: readonly [string, string];
  feltMode?: FeltMode;
  radialPreview?: readonly [string, string, string];
  /** When set, theme uses this felt image id for the table background. */
  feltImageId?: string;
};

export const THEME_PACK_CONFIG: ReadonlyArray<ThemePackConfig> = [
  {
    id: "default",
    name: "Royal Casino",
    colors: ["158 30% 14%", "42 82% 50%"],
    feltMode: "gradient",
    radialPreview: ["158 28% 16%", "158 30% 14%", "158 32% 12%"],
  },
  { id: "monokai", name: "Monokai", colors: ["70 8% 15%", "340 70% 56%"] },
  {
    id: "zen",
    name: "Zen Mode",
    colors: ["0 0% 12%", "0 0% 80%"],
    feltMode: "gradient",
    radialPreview: ["0 0% 14%", "0 0% 12%", "0 0% 10%"],
  },
  { id: "mono", name: "Mono Mode", colors: ["0 0% 100%", "0 0% 0%"] },
  { id: "back-alley", name: "Back Alley", colors: ["0 0% 5%", "0 80% 50%"], feltImageId: "texture" },
  { id: "cyber", name: "Cyberpunk", colors: ["280 40% 10%", "300 100% 50%"] },
];

export function getThemePackFeltImageId(packId: ThemePackId): string | null {
  const cfg = THEME_PACK_CONFIG.find((c) => c.id === packId);
  return cfg?.feltImageId ?? null;
}
