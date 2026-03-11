/**
 * Renders a single animation layer from definition. Isolates the layer-type switch
 * and default durations for easier testing and DX.
 */
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
} from "./animationTypes";
import {
  AnimationLayerBurst,
  AnimationLayerFlash,
  AnimationLayerParticles,
  AnimationLayerRing,
  TextLayer,
  AssetLayer,
} from "./layers";
import { formatCents } from "@/lib/format";
function getTextForRole(
  role: "headline" | "amount",
  payload: TableAnimationRequest["payload"]
): string {
  if (role === TEXT_ROLE_HEADLINE) return payload?.headline ?? "";
  if (role === TEXT_ROLE_AMOUNT && payload?.amountCents != null) return formatCents(payload.amountCents);
  return "";
}

export function renderAnimationLayer(
  layer: AnimationLayerDefinition,
  index: number,
  payload: TableAnimationRequest["payload"],
  defaultHeadline: string,
  theme: AnimationTheme
): ReactNode {
  const durationMs = "durationMs" in layer ? (layer.durationMs ?? LAYER_DURATION_DEFAULT_MS) : LAYER_DURATION_DEFAULT_MS;
  const delayMs = layer.delayMs ?? 0;
  const { particleCount, particleSpread, rays } = DEFAULT_LAYER_PARAMS;
  const { palette, timing } = theme;

  switch (layer.type) {
    case "FLASH":
      return (
        <AnimationLayerFlash
          key={index}
          durationMs={layer.durationMs ?? timing.flashDurationMs}
          delayMs={delayMs}
          color={palette.flash}
        />
      );
    case "BURST":
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
    case "PARTICLES":
      return (
        <AnimationLayerParticles
          key={index}
          durationMs={durationMs}
          delayMs={delayMs}
          particleCount={layer.particleCount ?? particleCount}
          particleSpread={layer.particleSpread ?? particleSpread}
          color={palette.particle}
          originOffsetX={layer.originOffsetX}
          originOffsetY={layer.originOffsetY}
        />
      );
    case "RING":
      return (
        <AnimationLayerRing
          key={index}
          durationMs={durationMs}
          delayMs={delayMs}
          color={palette.ring}
          scaleRange={timing.ringScale}
        />
      );
    case "TEXT": {
      const role = layer.textRole ?? TEXT_ROLE_HEADLINE;
      const text =
        role === TEXT_ROLE_HEADLINE
          ? (payload?.headline ?? defaultHeadline)
          : getTextForRole(role, payload);
      if (!text) return null;
      const size = layer.textSize ?? TEXT_SIZE_DEFAULT;
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
          amountBg={palette.amountBg}
          amountText={palette.amountText}
          amountBorder={palette.amountBorder}
          fontSize={theme.textScale[size]}
        />
      );
    }
    case "ASSET":
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
    default:
      return null;
  }
}
