import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { resolveAnimation, getPreloadSources } from "./animationRegistry";
import type { PreloadSource } from "./animationRegistry";
import { getAnimationTheme } from "./animationTheme";
import type {
  TableAnimationRequest,
  TableAnimationDefinition,
  AnimationSettings,
  AnimationChannel,
  SoundCue,
} from "./animationTypes";
import { DEFAULT_HEADLINES, FX_DEBUG_PREFIX } from "./animationConstants";
import { renderAnimationLayer } from "./renderAnimationLayer";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { SoundEvent } from "@/sound/emitSoundEvent";

/** One animation per channel at a time; different channels run concurrently. */
const DEFAULT_SETTINGS: AnimationSettings = { enabled: true, reducedMotion: false };

const OVERLAY_CONTAINER_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  zIndex: 100,
  pointerEvents: "none" as const,
};

const LAYER_WRAPPER_STYLE = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

type ActiveSlot = { request: TableAnimationRequest; def: TableAnimationDefinition };

/** Set to true to log animation start (event, tier, id, layers, duration). Tuning only. */
export const ANIMATION_DEBUG = false;

function scheduleSoundCues(sounds: SoundCue[]): (() => void) {
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  for (const cue of sounds) {
    const t = setTimeout(() => {
      try {
        emitSoundEvent(cue.sound as SoundEvent, cue.volume != null ? { volume: cue.volume } : undefined);
      } catch {
        // Unknown sound key: no-op so definitions with invalid keys don't crash
      }
    }, cue.delayMs ?? 0);
    timeouts.push(t);
  }
  return () => timeouts.forEach((t) => clearTimeout(t));
}

type TableAnimationOverlayProps = {
  request: TableAnimationRequest | null;
  onComplete: () => void;
  settings?: AnimationSettings;
  onAnimationStart?: (def: TableAnimationDefinition) => void;
  onAnimationComplete?: (def: TableAnimationDefinition) => void;
  /** Called on mount with ASSET sources that have preload: true. Wire to preload/cache to avoid first-play hitch. */
  onPreloadAssets?: (sources: PreloadSource[]) => void;
};

export function TableAnimationOverlay({
  request,
  onComplete,
  settings: settingsProp,
  onAnimationStart,
  onAnimationComplete,
  onPreloadAssets,
}: TableAnimationOverlayProps) {
  const settings = settingsProp ?? DEFAULT_SETTINGS;
  const [activeByChannel, setActiveByChannel] = useState<Partial<Record<AnimationChannel, ActiveSlot>>>({});
  const cleanupByChannelRef = useRef<Partial<Record<AnimationChannel, () => void>>>({});
  const runningIdByChannelRef = useRef<Partial<Record<AnimationChannel, string>>>({});
  const instanceIdRef = useRef(0);
  const instanceIdByChannelRef = useRef<Partial<Record<AnimationChannel, number>>>({});
  const onStartRef = useRef(onAnimationStart);
  const onCompleteRef = useRef(onAnimationComplete);
  const onCompleteCallbackRef = useRef(onComplete);
  const onPreloadRef = useRef(onPreloadAssets);
  onStartRef.current = onAnimationStart;
  onCompleteRef.current = onAnimationComplete;
  onCompleteCallbackRef.current = onComplete;
  onPreloadRef.current = onPreloadAssets;

  useEffect(() => {
    const sources = getPreloadSources();
    if (sources.length) onPreloadRef.current?.(sources);
  }, []);

  useEffect(() => {
    if (!request || !settings.enabled) return;
    const def = resolveAnimation(request.event, request.tier);
    if (!def) return;
    const { channel } = def;
    setActiveByChannel((prev) => {
      const current = prev[channel];
      if (current && request.tier <= current.request.tier) return prev;
      return { ...prev, [channel]: { request, def } };
    });
  }, [request, settings.enabled]);

  useEffect(() => {
    if (!settings.enabled) return;
    const cleanupFns: (() => void)[] = [];
    for (const [channel, slot] of Object.entries(activeByChannel) as [AnimationChannel, ActiveSlot][]) {
      if (runningIdByChannelRef.current[channel] === slot.def.id) continue;
      cleanupByChannelRef.current[channel]?.();
      const { def } = slot;
      runningIdByChannelRef.current[channel] = def.id;
      const instanceId = ++instanceIdRef.current;
      instanceIdByChannelRef.current[channel] = instanceId;
      if (ANIMATION_DEBUG) {
        const layerNames = def.layers.map((l) => l.type).join(" → ");
        const soundsStr = def.sounds?.length ? ` | sounds: ${def.sounds.map((s) => `${s.sound}@${s.delayMs ?? 0}ms`).join(", ")}` : "";
        console.log(`${FX_DEBUG_PREFIX} fx#${instanceId} ${def.channel} ${def.event} tier ${def.tier} | id: ${def.id} | Layers: ${layerNames} | Duration: ${def.durationMs}ms${soundsStr}`);
      }
      onStartRef.current?.(def);
      const cancelSounds = def.sounds?.length ? scheduleSoundCues(def.sounds) : () => {};
      const timeout = setTimeout(() => {
        delete runningIdByChannelRef.current[channel];
        setActiveByChannel((prev) => {
          const next = { ...prev };
          delete next[channel];
          return next;
        });
        cleanupByChannelRef.current[channel] = undefined;
        onCompleteRef.current?.(def);
        onCompleteCallbackRef.current();
      }, def.durationMs);
      const cleanupFn = () => {
        cancelSounds();
        clearTimeout(timeout);
      };
      cleanupByChannelRef.current[channel] = cleanupFn;
      cleanupFns.push(cleanupFn);
    }
    return () => {
      for (const fn of cleanupFns) fn();
    };
  }, [activeByChannel, settings.enabled]);

  const entries = Object.entries(activeByChannel) as [AnimationChannel, ActiveSlot][];
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([channel, { request: req, def }]) => {
        const theme = getAnimationTheme(req.event);
        return (
          <View key={channel} style={OVERLAY_CONTAINER_STYLE}>
            {def.layers.map((layer, index) => (
              <View key={index} style={LAYER_WRAPPER_STYLE}>
                {renderAnimationLayer(layer, index, req.payload, DEFAULT_HEADLINES[req.event] ?? "", theme)}
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}
