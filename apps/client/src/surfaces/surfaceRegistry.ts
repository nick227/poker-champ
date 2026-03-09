import {
  SURFACE_COLOR,
  SURFACE_ELEVATION,
  SURFACE_RHYTHM,
  SURFACE_SPACING,
  type SurfaceElevationPreset,
  type SurfaceRadiusPreset,
  type SurfaceSpacingPreset,
} from "@/theme/surfaceTokens";

export type SurfaceStyleId =
  | "surface.app.canvas"
  | "surface.screen.base"
  | "surface.nav.top"
  | "surface.nav.bottom"
  | "surface.header.masthead"
  | "surface.header.stack"
  | "surface.card.primary"
  | "surface.card.secondary"
  | "surface.list.panel"
  | "surface.list.row"
  | "surface.prose.article"
  | "surface.sheet.modal"
  | "surface.dropdown.menu"
  | "surface.sim.table"
  | "surface.sim.table.topbar"
  | "surface.sim.table.announce"
  | "surface.sim.table.announce.highlight"
  | "surface.sim.table.actionbar"
  | "surface.sim.replay"
  | "surface.sim.lesson"
  | "surface.sim.slots"
  | "surface.commerce.section";

type SurfaceContract = {
  paddingPreset: SurfaceSpacingPreset;
  radiusPreset: SurfaceRadiusPreset;
  elevationPreset: SurfaceElevationPreset;
};

type SurfaceDefinition = {
  className: string;
  contract: SurfaceContract;
};

const DEFAULT_CONTRACT: SurfaceContract = {
  paddingPreset: "none",
  radiusPreset: "none",
  elevationPreset: 0,
};

const createDefinition = (
  className: string,
  contract: Partial<SurfaceContract> = {},
): SurfaceDefinition => ({
  className,
  contract: { ...DEFAULT_CONTRACT, ...contract },
});

export const surfaceRegistry: Record<SurfaceStyleId, SurfaceDefinition> = {
  "surface.app.canvas": createDefinition(
    `flex-1 min-h-full ${SURFACE_COLOR.canvas}`,
    { elevationPreset: 0 },
  ),
  "surface.screen.base": createDefinition(
    `flex-1 bg-bg/70 ${SURFACE_SPACING.screenX}`,
    { paddingPreset: "lg", elevationPreset: 0 },
  ),
  "surface.nav.top": createDefinition(
    `ui-row items-center justify-between ui-inline-3 border-b border-border ${SURFACE_SPACING.section}`,
    { paddingPreset: "md", elevationPreset: 1 },
  ),
  "surface.nav.bottom": createDefinition(
    `ui-row ui-bottom-bar ${SURFACE_ELEVATION[1]}`,
    { paddingPreset: "none", elevationPreset: 1 },
  ),
  "surface.header.masthead": createDefinition("ui-surface-card", {
    paddingPreset: "md",
    radiusPreset: "lg",
    elevationPreset: 2,
  }),
  "surface.header.stack": createDefinition(`${SURFACE_SPACING.stack} mb-2`, {
    paddingPreset: "none",
    elevationPreset: 0,
  }),
  "surface.card.primary": createDefinition(
    `ui-surface-card ${SURFACE_SPACING.card}`,
    { paddingPreset: "lg", radiusPreset: "lg", elevationPreset: 2 },
  ),
  "surface.card.secondary": createDefinition(
    `ui-surface ${SURFACE_SPACING.card}`,
    { paddingPreset: "lg", radiusPreset: "md", elevationPreset: 1 },
  ),
  "surface.list.panel": createDefinition(`ui-surface-card rounded-2xl ${SURFACE_SPACING.card}`, {
    paddingPreset: "lg",
    radiusPreset: "lg",
    elevationPreset: 2,
  }),
  "surface.list.row": createDefinition("ui-surface", {
    paddingPreset: "md",
    radiusPreset: "md",
    elevationPreset: 1,
  }),
  "surface.prose.article": createDefinition("ui-surface-card", {
    paddingPreset: "lg",
    radiusPreset: "lg",
    elevationPreset: 1,
  }),
  "surface.sheet.modal": createDefinition("bottom-sheet rounded-t-lg bg-panel", {
    paddingPreset: "lg",
    radiusPreset: "lg",
    elevationPreset: 3,
  }),
  "surface.dropdown.menu": createDefinition("ui-surface-card", {
    paddingPreset: "sm",
    radiusPreset: "md",
    elevationPreset: 2,
  }),
  "surface.sim.table": createDefinition("bg-transparent", {
    paddingPreset: "none",
    elevationPreset: 0,
  }),
  "surface.sim.table.topbar": createDefinition(
    "ui-row items-center justify-between ui-inline-3 border-b border-border-subtle px-4 py-2",
    { paddingPreset: "md", elevationPreset: 1 },
  ),
  "surface.sim.table.announce": createDefinition(
    "ui-row items-center justify-center px-4 min-h-[44px] w-full",
    { paddingPreset: "sm", elevationPreset: 1 },
  ),
  "surface.sim.table.announce.highlight": createDefinition(
    "ui-row items-center justify-center px-4 min-h-[44px] w-full bg-brand/20",
    { paddingPreset: "sm", elevationPreset: 1 },
  ),
  "surface.sim.table.actionbar": createDefinition(
    "border-t border-border-subtle flex items-center justify-center",
    { paddingPreset: "none", elevationPreset: 1 },
  ),
  "surface.sim.replay": createDefinition("bg-transparent", {
    paddingPreset: "none",
    elevationPreset: 0,
  }),
  "surface.sim.lesson": createDefinition("bg-panel", {
    paddingPreset: "none",
    elevationPreset: 1,
  }),
  "surface.sim.slots": createDefinition("slot-machine-container", {
    paddingPreset: "none",
    elevationPreset: 1,
  }),
  "surface.commerce.section": createDefinition("ui-surface-card", {
    paddingPreset: "lg",
    radiusPreset: "lg",
    elevationPreset: 2,
  }),
};

export function getSurfaceDefinition(styleId: SurfaceStyleId): SurfaceDefinition {
  return surfaceRegistry[styleId];
}
