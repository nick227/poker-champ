import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { resolveAnimation } from "./animationRegistry";
import type {
  TableAnimationRequest,
  AnimationLayerDefinition,
  TableAnimationDefinition,
} from "./animationTypes";
import {
  AnimationLayerBurst,
  AnimationLayerFlash,
  AnimationLayerParticles,
  AnimationLayerRing,
  TextLayer,
} from "./layers";
import { formatCents } from "@/lib/format";

type TableAnimationOverlayProps = {
  request: TableAnimationRequest | null;
  onComplete: () => void;
};

function getTextForRole(
  role: "headline" | "amount",
  payload: TableAnimationRequest["payload"]
): string {
  if (role === "headline") return payload?.headline ?? "";
  if (role === "amount" && payload?.amountCents != null) return formatCents(payload.amountCents);
  return "";
}

function renderLayer(
  layer: AnimationLayerDefinition,
  index: number,
  payload: TableAnimationRequest["payload"],
  defaultHeadline: string
) {
  const durationMs = layer.durationMs ?? 400;
  const delayMs = layer.delayMs ?? 0;

  switch (layer.type) {
    case "FLASH":
      return (
        <AnimationLayerFlash key={index} durationMs={durationMs} delayMs={delayMs} />
      );
    case "BURST":
      return (
        <AnimationLayerBurst
          key={index}
          durationMs={durationMs}
          delayMs={delayMs}
          rays={layer.rays ?? 8}
        />
      );
    case "PARTICLES":
      return (
        <AnimationLayerParticles
          key={index}
          durationMs={durationMs}
          delayMs={delayMs}
          particleCount={layer.particleCount ?? 12}
          particleSpread={layer.particleSpread ?? 50}
        />
      );
    case "RING":
      return (
        <AnimationLayerRing key={index} durationMs={durationMs} delayMs={delayMs} />
      );
    case "TEXT": {
      const role = layer.textRole ?? "headline";
      const text =
        role === "headline"
          ? (payload?.headline ?? defaultHeadline)
          : getTextForRole(role, payload);
      if (!text) return null;
      return (
        <TextLayer
          key={index}
          durationMs={durationMs}
          delayMs={delayMs}
          role={role}
          text={text}
          size={layer.textSize}
          glow={layer.textGlow}
        />
      );
    }
    default:
      return null;
  }
}

const DEFAULT_HEADLINES: Record<string, string> = {
  POT_WIN: "YOU WIN",
  ALL_IN: "ALL IN",
  SHOWDOWN: "SHOWDOWN",
};

export function TableAnimationOverlay({ request, onComplete }: TableAnimationOverlayProps) {
  const [active, setActive] = useState<TableAnimationRequest | null>(null);
  const runningRef = useRef<TableAnimationRequest | null>(null);

  useEffect(() => {
    if (!request) return;
    const current = runningRef.current;
    if (!current) {
      runningRef.current = request;
      setActive(request);
    } else if (request.tier > current.tier) {
      runningRef.current = request;
      setActive(request);
    }
  }, [request]);

  useEffect(() => {
    if (!active) return;
    const def = resolveAnimation(active.event, active.tier);
    if (!def) {
      runningRef.current = null;
      setActive(null);
      onComplete();
      return;
    }
    const timeout = setTimeout(() => {
      runningRef.current = null;
      setActive(null);
      onComplete();
    }, def.durationMs);
    return () => clearTimeout(timeout);
  }, [active, onComplete]);

  if (!active) return null;

  const def = resolveAnimation(active.event, active.tier) as
    | TableAnimationDefinition
    | undefined;
  if (!def) return null;

  const defaultHeadline = DEFAULT_HEADLINES[active.event] ?? "";

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
        pointerEvents: "none",
      }}
    >
      {def.layers.map((layer, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
          }}
        >
          {renderLayer(layer, index, active.payload, defaultHeadline)}
        </View>
      ))}
    </View>
  );
}
