/**
 * FX Overlay Runtime
 *
 * Responsibilities:
 * - resolve animation definitions (no game logic)
 * - resolve anchors using host-provided bounds (overlay coordinate space)
 * - render FX layers (background + foreground planes)
 *
 * Non-responsibilities:
 * - layout measurement (host reports bounds)
 * - game logic
 */

// Imports
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { resolveAnimationWithCompanions, getPreloadSources, resolveLayerWithPreset } from "./animationRegistry";
import type { PreloadSource } from "./animationRegistry";
import { getAnchorRect, getAnchorRectForLayer, getCardSlotRects } from "./anchorResolution";
import { getAnimationTheme } from "./animationTheme";
import type {
  TableAnimationRequest,
  TableAnimationDefinition,
  AnimationSettings,
  AnimationChannel,
  SoundCue,
  AnchorBounds,
  Rect,
  AnimationLayerDefinition,
} from "./animationTypes";
import { FX_ANCHOR } from "./animationTypes";
import { DEFAULT_HEADLINES, filterReducedMotionLayers, FX_DEBUG_ANCHORS, FX_DEBUG_PREFIX, MIN_DISPLAY_MS } from "./animationConstants";
import { resolveRenderableLayers } from "./overlayRenderable";
import { renderAnimationLayer } from "./renderAnimationLayer";
import { emitSoundEvent } from "@/sound/emitSoundEvent";
import type { SoundEvent } from "@/sound/emitSoundEvent";

// Constants
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

// Types
type ActiveSlot = { request: TableAnimationRequest; def: TableAnimationDefinition };

/** Set to true to log animation start (event, tier, id, layers, duration). Tuning only. */
export const ANIMATION_DEBUG = false;

// Helpers
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

function partitionLayersByPlane(layers: AnimationLayerDefinition[]): {
  background: AnimationLayerDefinition[];
  foreground: AnimationLayerDefinition[];
} {
  const background: AnimationLayerDefinition[] = [];
  const foreground: AnimationLayerDefinition[] = [];
  for (const layer of layers) {
    const plane = ("plane" in layer ? layer.plane : undefined) ?? "FOREGROUND";
    (plane === "BACKGROUND" ? background : foreground).push(layer);
  }
  return { background, foreground };
}

type TableAnimationOverlayProps = {
  request: TableAnimationRequest | null;
  onComplete: () => void;
  settings?: AnimationSettings;
  /** When provided, HERO/SEAT/BOARD anchors are positioned at these rects; otherwise full-screen fallback. */
  anchorBounds?: AnchorBounds;
  onAnimationStart?: (def: TableAnimationDefinition) => void;
  onAnimationComplete?: (def: TableAnimationDefinition) => void;
  /** Called on mount with ASSET sources that have preload: true. Wire to preload/cache to avoid first-play hitch. */
  onPreloadAssets?: (sources: PreloadSource[]) => void;
  /** Optional persistent atmosphere layers (background plane). Rendered in addition to event FX when set. */
  atmosphereLayers?: AnimationLayerDefinition[] | null;
};

function renderAnchoredFx({
  rect,
  children,
  clip = true,
  key,
}: {
  rect: Rect;
  children: ReactNode;
  clip?: boolean;
  key?: string;
}) {
  return (
    <View
      key={key}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        overflow: clip ? "hidden" : "visible",
      }}
    >
      {children}
    </View>
  );
}

// Main component
export function TableAnimationOverlay({
  request,
  onComplete,
  settings: settingsProp,
  anchorBounds,
  onAnimationStart,
  onAnimationComplete,
  onPreloadAssets,
  atmosphereLayers,
}: TableAnimationOverlayProps) {
  const settings = settingsProp ?? DEFAULT_SETTINGS;
  const [activeByChannel, setActiveByChannel] = useState<Partial<Record<AnimationChannel, ActiveSlot>>>({});
  const cleanupByChannelRef = useRef<Partial<Record<AnimationChannel, () => void>>>({});
  const runningIdByChannelRef = useRef<Partial<Record<AnimationChannel, string>>>({});
  const primaryChannelRef = useRef<AnimationChannel | undefined>(undefined);
  const startTimeByChannelRef = useRef<Partial<Record<AnimationChannel, number>>>({});
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
    const effectiveTier = settings.reducedMotion ? Math.min(request.tier, 1) : request.tier;
    const reducedRequest: TableAnimationRequest = { ...request, tier: effectiveTier as 0 | 1 | 2 | 3 | 4 };
    const { table, hero, seat } = resolveAnimationWithCompanions(reducedRequest);
    const primaryChannel = table?.channel ?? hero?.channel ?? seat?.channel;
    primaryChannelRef.current = primaryChannel;
    const now = Date.now();
    setActiveByChannel((prev) => {
      let next = { ...prev };
      const allowReplace = (ch: AnimationChannel) => {
        const current = prev[ch];
        if (!current) return true;
        const started = startTimeByChannelRef.current[ch];
        if (started == null) return true;
        return now - started >= MIN_DISPLAY_MS;
      };
      const tableSlot = table ? next[table.channel] : undefined;
      if (table && allowReplace(table.channel) && (!tableSlot || reducedRequest.tier <= (tableSlot?.request.tier ?? -1))) {
        next = { ...next, [table.channel]: { request: reducedRequest, def: table } };
      }
      const heroSlot = hero ? next[hero.channel] : undefined;
      if (hero && allowReplace(hero.channel) && (!heroSlot || reducedRequest.tier <= (heroSlot?.request.tier ?? -1))) {
        next = { ...next, [hero.channel]: { request: reducedRequest, def: hero } };
      }
      const seatSlot = seat ? next[seat.channel] : undefined;
      if (seat && allowReplace(seat.channel) && (!seatSlot || reducedRequest.tier <= (seatSlot?.request.tier ?? -1))) {
        next = { ...next, [seat.channel]: { request: reducedRequest, def: seat } };
      }
      return next;
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
      startTimeByChannelRef.current[channel] = Date.now();
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
        if (channel === primaryChannelRef.current) onCompleteCallbackRef.current();
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
  const rawAtmosphere = atmosphereLayers ?? [];
  const atmosphereForRender = settings.reducedMotion
    ? filterReducedMotionLayers(rawAtmosphere)
    : rawAtmosphere;
  const resolvedAtmosphere = atmosphereForRender.map((l) => resolveLayerWithPreset(l));
  const hasAtmosphere = resolvedAtmosphere.length > 0;
  if (entries.length === 0 && !hasAtmosphere) return null;

  const renderLayerList = (
    def: TableAnimationDefinition,
    layers: AnimationLayerDefinition[],
    req: TableAnimationRequest,
    theme: ReturnType<typeof getAnimationTheme>
  ) =>
    layers.map((layer, index) => {
      const effectiveAnchor = ("anchor" in layer ? layer.anchor : undefined) ?? def.anchor;
      const layerRect = getAnchorRectForLayer(layer, def, req.payload, anchorBounds);
      const cardRects = effectiveAnchor === FX_ANCHOR.CARD ? getCardSlotRects(anchorBounds) : [];
      const skip =
        effectiveAnchor !== FX_ANCHOR.TABLE_CENTER &&
        effectiveAnchor !== FX_ANCHOR.CARD &&
        !layerRect;
      if (skip) return null;
      if (effectiveAnchor === FX_ANCHOR.CARD && cardRects.length === 0) return null;

      const key = `${layer.type}-${index}`;
      if (effectiveAnchor === FX_ANCHOR.CARD) {
        return (
          <Fragment key={key}>
            {cardRects.map((rect, slotIndex) =>
              renderAnchoredFx({
                rect,
                children: renderAnimationLayer(
                  layer,
                  index * 1000 + slotIndex,
                  req.payload,
                  DEFAULT_HEADLINES[req.event] ?? "",
                  theme
                ),
                key: `${key}-slot-${slotIndex}`,
              })
            )}
          </Fragment>
        );
      }
      const content = renderAnimationLayer(
        layer,
        index,
        req.payload,
        DEFAULT_HEADLINES[req.event] ?? "",
        theme
      );
      if (layerRect) return renderAnchoredFx({ rect: layerRect, children: content, key });
      return (
        <View key={key} style={LAYER_WRAPPER_STYLE}>
          {content}
        </View>
      );
    });

  const atmosphereTheme = getAnimationTheme("POT_WIN");

  return (
    <>
      {hasAtmosphere && (
        <View style={[OVERLAY_CONTAINER_STYLE, { zIndex: 99 }]}>
          {resolvedAtmosphere.map((layer, index) => {
            const content = renderAnimationLayer(
              layer,
              index,
              undefined,
              "",
              atmosphereTheme
            );
            return (
              <View key={`atmosphere-${layer.type}-${index}`} style={LAYER_WRAPPER_STYLE}>
                {content}
              </View>
            );
          })}
        </View>
      )}
      {entries.map(([channel, { request: req, def }]) => {
        const anchorRect = getAnchorRect(def, req.payload, anchorBounds);
        const containerStyle = anchorRect
          ? {
              ...OVERLAY_CONTAINER_STYLE,
              left: anchorRect.x,
              top: anchorRect.y,
              width: anchorRect.width,
              height: anchorRect.height,
              overflow: "hidden" as const,
            }
          : OVERLAY_CONTAINER_STYLE;
        const layers = resolveRenderableLayers(def, settings);
        const theme = getAnimationTheme(req.event);
        const { background: backgroundLayers, foreground: foregroundLayers } = partitionLayersByPlane(layers);
        return (
          <Fragment key={channel}>
            {backgroundLayers.length > 0 && (
              <View style={[containerStyle, { zIndex: 99 }]}>
                {renderLayerList(def, backgroundLayers, req, theme)}
              </View>
            )}
            <View style={containerStyle}>
              {renderLayerList(def, foregroundLayers, req, theme)}
            </View>
          </Fragment>
        );
      })}
      {FX_DEBUG_ANCHORS && anchorBounds && Object.keys(anchorBounds).length > 0 ? (
        <AnchorDebugLayer anchorBounds={anchorBounds} />
      ) : null}
    </>
  );
}

// Dev / debug
const ANCHOR_DEBUG_COLORS = {
  board: "green",
  hero: "blue",
  seat: "gold",
  card: "purple",
} as const;

const DEBUG_LABEL_STYLE = {
  position: "absolute" as const,
  left: 2,
  top: 2,
  fontSize: 10,
  fontWeight: "600" as const,
  color: "#000",
};

function AnchorDebugLayer({ anchorBounds }: { anchorBounds: AnchorBounds }) {
  const items: { rect: Rect; color: string; key: string; label: string }[] = [];
  if (anchorBounds.board) {
    items.push({ rect: anchorBounds.board, color: ANCHOR_DEBUG_COLORS.board, key: "board", label: "BOARD" });
  }
  if (anchorBounds.hero) {
    items.push({ rect: anchorBounds.hero, color: ANCHOR_DEBUG_COLORS.hero, key: "hero", label: "HERO" });
  }
  if (anchorBounds.seatByIndex) {
    for (const [seatIndex, rect] of Object.entries(anchorBounds.seatByIndex)) {
      if (rect) items.push({ rect, color: ANCHOR_DEBUG_COLORS.seat, key: `seat-${seatIndex}`, label: `SEAT ${seatIndex}` });
    }
  }
  if (anchorBounds.cardSlots?.length) {
    anchorBounds.cardSlots.forEach((r, i) => {
      if (r) items.push({ rect: r, color: ANCHOR_DEBUG_COLORS.card, key: `card-${i}`, label: `CARD ${i}` });
    });
  }
  if (items.length === 0) return null;
  return (
    <View style={[OVERLAY_CONTAINER_STYLE, { zIndex: 1000 }]} pointerEvents="none">
      {items.map(({ rect, color, key, label }) => (
        <View
          key={key}
          style={{
            position: "absolute",
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            borderWidth: 2,
            borderColor: color,
          }}
        >
          <Text style={DEBUG_LABEL_STYLE}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
