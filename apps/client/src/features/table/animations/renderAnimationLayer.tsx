/**
 * Layer renderer (pure): converts a resolved layer definition into a ReactNode.
 * No game logic; no anchor/layout positioning (overlay handles that).
 */

// Imports
import React from "react";
import type { ReactNode } from "react";
import { DEFAULT_LAYER_PARAMS } from "./animationRegistry";
import {
  ASSET_DURATION_DEFAULT_MS,
  LAYER_DURATION_DEFAULT_MS,
  TEXT_ROLE_AMOUNT,
  TEXT_ROLE_HEADLINE,
  TEXT_SIZE_DEFAULT,
} from "./animationConstants";
import type { AnimationTheme } from "./animationTheme";
import type {
  TableAnimationRequest,
  AnimationLayerDefinition,
  ProceduralLayerDefinition,
  AssetLayerDefinition,
} from "./animationTypes";
import {
  AnimationLayerBurst,
  AnimationLayerFlash,
  AnimationLayerRadialGlow,
  AnimationLayerParticles,
  AnimationLayerRing,
  AnimationLayerStreak,
  AnimationLayerSeatGlow,
  TextLayer,
  AssetLayer,
} from "./layers";
import { formatCents } from "@/lib/format";

// Types
type RenderCtx = {
  index: number;
  payload: TableAnimationRequest["payload"];
  defaultHeadline: string;
  theme: AnimationTheme;
  durationMs: number;
  delayMs: number;
  formatAmount: (amount: number) => string;
};

type ProceduralLayerRenderer = (layer: ProceduralLayerDefinition, ctx: RenderCtx) => ReactNode;
type AssetLayerRenderer = (layer: AssetLayerDefinition, ctx: RenderCtx) => ReactNode;

type ProceduralLayerType = ProceduralLayerDefinition["type"];

// Helpers
function getTextForRole(
  role: "headline" | "amount",
  payload: TableAnimationRequest["payload"],
  formatAmount: (amount: number) => string,
): string {
  if (role === TEXT_ROLE_HEADLINE) return payload?.headline ?? "";
  if (role === TEXT_ROLE_AMOUNT && payload?.amountCents != null) return formatAmount(payload.amountCents);
  return "";
}

function renderFlash(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, delayMs, theme } = ctx;
  const { palette, timing } = theme;
  return (
    <AnimationLayerFlash
      key={index}
      durationMs={layer.durationMs ?? timing.flashDurationMs}
      delayMs={delayMs}
      color={palette.flash}
    />
  );
}

function renderBurst(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { rays } = DEFAULT_LAYER_PARAMS;
  const { palette, timing } = theme;
  return (
    <AnimationLayerBurst
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      rays={layer.rays ?? rays}
      color={palette.burst}
      scaleRange={timing.burstScale}
    />
  );
}

function renderRadialGlow(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { palette } = theme;
  return (
    <AnimationLayerRadialGlow
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      color={palette.burst}
      opacity={layer.opacity}
    />
  );
}

function renderParticles(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { particleCount, particleSpread } = DEFAULT_LAYER_PARAMS;
  const { palette } = theme;
  return (
    <AnimationLayerParticles
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      particleCount={layer.particleCount ?? particleCount}
      particleSpread={layer.particleSpread ?? particleSpread}
      color={palette.particle}
      shape={layer.particleShape}
      originOffsetX={layer.originOffsetX}
      originOffsetY={layer.originOffsetY}
    />
  );
}

function renderRing(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { palette, timing } = theme;
  return (
    <AnimationLayerRing
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      color={palette.ring}
      strokeWidth={layer.strokeWidth}
      scaleRange={layer.scale ?? timing.ringScale}
    />
  );
}

function renderText(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, payload, defaultHeadline, theme } = ctx;
  const { palette } = theme;
  const role = layer.textRole ?? TEXT_ROLE_HEADLINE;
  const text =
    role === TEXT_ROLE_HEADLINE
      ? (payload?.headline ?? defaultHeadline)
      : getTextForRole(role, payload, ctx.formatAmount);
  if (!text) return null;
  type TextSize = keyof AnimationTheme["textScale"];
  const size = (layer.textSize ?? TEXT_SIZE_DEFAULT) as TextSize;
  return (
    <TextLayer
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      role={role}
      text={text}
      size={size}
      glow={layer.textGlow}
      headlineColor={palette.headline}
      glowColor={palette.headlineGlow}
      headlineGlowSecondary={palette.headlineGlowSecondary}
      headlineGlowBright={palette.headlineGlowBright}
      amountBg={palette.amountBg}
      amountText={palette.amountText}
      amountBorder={palette.amountBorder}
      fontSize={theme.textScale[size]}
    />
  );
}

function renderStreak(layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { palette } = theme;
  return (
    <AnimationLayerStreak
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      color={palette.streakColor}
      streakCount={layer.streakCount ?? 4}
      streakAngleDeg={layer.streakAngleDeg ?? 45}
    />
  );
}

function renderSeatGlow(_layer: ProceduralLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, durationMs, delayMs, theme } = ctx;
  const { palette } = theme;
  return (
    <AnimationLayerSeatGlow
      key={index}
      durationMs={durationMs}
      delayMs={delayMs}
      color={palette.haloColor ?? palette.ring}
    />
  );
}

function renderAsset(layer: AssetLayerDefinition, ctx: RenderCtx): ReactNode {
  const { index, delayMs } = ctx;
  if (!layer.source?.trim()) return null;
  return (
    <AssetLayer
      key={index}
      assetType={layer.assetType}
      source={layer.source}
      variant={layer.variant}
      containsAudio={layer.containsAudio}
      delayMs={delayMs}
      durationMs={layer.durationMs ?? ASSET_DURATION_DEFAULT_MS}
    />
  );
}

const PROCEDURAL_RENDERERS: Record<ProceduralLayerType, ProceduralLayerRenderer> = {
  FLASH: renderFlash,
  BURST: renderBurst,
  RADIAL_GLOW: renderRadialGlow,
  PARTICLES: renderParticles,
  RING: renderRing,
  TEXT: renderText,
  STREAK: renderStreak,
  SEAT_GLOW: renderSeatGlow,
};

// Main
export function renderAnimationLayer(
  layer: AnimationLayerDefinition,
  index: number,
  payload: TableAnimationRequest["payload"],
  defaultHeadline: string,
  theme: AnimationTheme,
  formatAmount: (amount: number) => string = formatCents,
): ReactNode {
  const durationMs =
    "durationMs" in layer ? (layer.durationMs ?? LAYER_DURATION_DEFAULT_MS) : LAYER_DURATION_DEFAULT_MS;
  const delayMs = layer.delayMs ?? 0;

  const ctx: RenderCtx = { index, payload, defaultHeadline, theme, durationMs, delayMs, formatAmount };
  if (layer.type === "ASSET") return renderAsset(layer, ctx);
  const renderer = PROCEDURAL_RENDERERS[layer.type];
  if (!renderer) return null;
  return renderer(layer, ctx);
}
