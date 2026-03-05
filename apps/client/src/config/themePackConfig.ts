import type { FeltImageId } from "@/components/domain/table/feltImages";

export type ThemePackId = "default" | "monokai" | "zen" | "dark" | "back-alley" | "cyber";

export type FeltMode = "solid" | "gradient";

export type ThemePackConfig = {
  id: ThemePackId;
  name: string;
  colors: readonly [string, string];
  feltMode?: FeltMode;
  radialPreview?: readonly [string, string, string];
  /** When set, theme uses this felt image id for the table background. Must be a valid FeltImageId. */
  feltImageId?: FeltImageId;
};

export const THEME_PACK_CONFIG: ReadonlyArray<ThemePackConfig> = [
  { id: "monokai", name: "Monokai", colors: ["70 8% 15%", "340 92% 56%"] },
  {
    id: "zen",
    name: "Zen Mode",
    colors: ["0 0% 12%", "0 0% 80%"],
    feltMode: "gradient",
    radialPreview: ["0 0% 14%", "0 0% 12%", "0 0% 10%"],
  },
  { id: "dark", name: "Dark", colors: ["0 0% 0%", "0 0% 15%"] },
  {
    id: "default",
    name: "Royal Casino",
    colors: ["158 30% 14%", "42 82% 50%"],
    feltMode: "gradient",
    feltImageId: "green",
  },
  { id: "back-alley", name: "Back Alley", colors: ["0 0% 5%", "0 80% 50%"], feltImageId: "texture" },
  { id: "cyber", name: "Cyberpunk", colors: ["280 40% 10%", "300 100% 50%"], feltImageId: "cyber" },
];

export function getThemePackFeltImageId(packId: ThemePackId): string | null {
  const cfg = THEME_PACK_CONFIG.find((c) => c.id === packId);
  return cfg?.feltImageId ?? null;
}
