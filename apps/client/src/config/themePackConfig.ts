import type { FeltImageId } from "@/components/domain/table/feltImages";
import type { FeltGradient } from "@/theme/backgrounds";
import type { SurfaceBackground } from "@/theme/backgrounds";

export type ThemePackId = "default" | "monokai" | "zen" | "dark" | "back-alley" | "cyber";

export type FeltMode = "solid" | "gradient";

function surface(
  color: string | null,
  imageId: SurfaceBackground["imageId"],
  gradient: FeltGradient | null
): SurfaceBackground {
  return Object.freeze({
    color,
    imageId,
    gradient: gradient ? Object.freeze(gradient) : null,
  });
}

const DEFAULT_APP: SurfaceBackground = surface("0 0% 5%", null, null);
const DEFAULT_FELT: SurfaceBackground = surface("158 30% 14%", null, null);

export type ThemePackConfig = {
  id: ThemePackId;
  name: string;
  colors: readonly [string, string];
  feltMode?: FeltMode;
  radialPreview?: readonly [string, string, string];
  feltImageId?: FeltImageId; // legacy for preview; prefer felt
  /** App (body/root) background. When omitted, pack uses default. */
  background?: SurfaceBackground;
  /** Table felt background. When omitted, pack uses default. */
  felt?: SurfaceBackground;
};

export const THEME_PACK_CONFIG: ReadonlyArray<ThemePackConfig> = [
  {
    id: "monokai",
    name: "Monokai",
    colors: ["70 8% 15%", "340 92% 56%"],
    background: surface("70 8% 15%", null, null),
    felt: surface("70 8% 15%", null, null),
  },
  {
    id: "zen",
    name: "Zen Mode",
    colors: ["0 0% 12%", "0 0% 80%"],
    feltMode: "gradient",
    radialPreview: ["0 0% 14%", "0 0% 12%", "0 0% 10%"],
    background: surface("0 0% 8%", null, null),
    felt: surface("0 0% 12%", null, {
      kind: "radial",
      colors: ["0 0% 14%", "0 0% 12%", "0 0% 10%"],
    }),
  },
  {
    id: "dark",
    name: "Dark",
    colors: ["0 0% 0%", "0 0% 15%"],
    background: surface(null, null, null),
    felt: surface("0 0% 0%", null, null),
  },
  {
    id: "default",
    name: "Royal Casino",
    colors: ["158 30% 14%", "42 82% 50%"],
    feltMode: "gradient",
    feltImageId: "green",
    background: surface("0 0% 5%", null, null),
    felt: surface("158 30% 14%", "green", {
      kind: "radial",
      colors: ["158 28% 16%", "158 30% 14%", "158 32% 12%"],
    }),
  },
  {
    id: "back-alley",
    name: "Back Alley",
    colors: ["0 0% 5%", "0 80% 50%"],
    feltImageId: "texture",
    background: surface("0 0% 2%", null, null),
    felt: surface("0 0% 5%", "texture", null),
  },
  {
    id: "cyber",
    name: "Cyberpunk",
    colors: ["280 40% 10%", "300 100% 50%"],
    feltImageId: "cyber",
    background: surface("249 50% 5%", null, null),
    felt: surface("249 100% 58%", "cyber", null),
  },
];

export function getThemePackSurfaces(packId: ThemePackId): {
  background: SurfaceBackground;
  felt: SurfaceBackground;
} {
  const cfg = THEME_PACK_CONFIG.find((c) => c.id === packId);
  return {
    background: cfg?.background ?? DEFAULT_APP,
    felt: cfg?.felt ?? DEFAULT_FELT,
  };
}
