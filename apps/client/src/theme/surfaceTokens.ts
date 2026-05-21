export const SURFACE_RHYTHM = {
  screenPadding: "px-0",
  sectionPadding: "p-4",
  cardPadding: "p-4",
  stackGap: "gap-3",
} as const;

export const SURFACE_SPACING = {
  none: "p-0",
  sm: "p-2",
  md: "p-3",
  lg: SURFACE_RHYTHM.cardPadding,
  screenX: SURFACE_RHYTHM.screenPadding,
  section: SURFACE_RHYTHM.sectionPadding,
  card: SURFACE_RHYTHM.cardPadding,
  stack: SURFACE_RHYTHM.stackGap,
} as const;

const SURFACE_RADIUS = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-2xl",
} as const;

export const SURFACE_ELEVATION = {
  0: "",
  1: "border border-border-subtle bg-panel",
  2: "border border-border bg-panel-elevated",
  3: "border border-border bg-panel-elevated",
} as const;

export const SURFACE_COLOR = {
  canvas: "bg-bg",
  panel: "bg-panel",
  panelElevated: "bg-panel-elevated",
  inkDefault: "text-text",
  inkMuted: "text-muted",
} as const;

export type SurfaceSpacingPreset = keyof typeof SURFACE_SPACING;
export type SurfaceRadiusPreset = keyof typeof SURFACE_RADIUS;
export type SurfaceElevationPreset = keyof typeof SURFACE_ELEVATION;
