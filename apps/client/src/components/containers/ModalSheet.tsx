import { useEffect, useRef, useState } from "react";
import { Animated, Modal, PanResponder, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { DURATION, PRESS_OPACITY } from "@/theme/animation";
import { BACKDROP_OVERLAY } from "@/theme/colors";
import { MODAL } from "@/constants/copy";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

const DEFAULT_HEIGHT_FRACTION = 0.7;
/** px/s threshold — a faster flick jumps one snap level */
const FLICK_VELOCITY = 200;

export function ModalSheet({
  visible,
  onClose,
  title,
  children,
  heightFraction = DEFAULT_HEIGHT_FRACTION,
  blocking = true,
  snapPoints,
  defaultSnapIndex,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Fraction of screen height (0–1), default 0.7. Ignored when snapPoints is provided. */
  heightFraction?: number;
  /** When false, overlay does not capture touches outside the sheet (e.g. play while chat open). */
  blocking?: boolean;
  /**
   * Array of snap fractions (0–1) or "minimal" (header-only height).
   * When provided, enables drag-to-snap behaviour; lowest index = smallest, highest = largest.
   * Example: ["minimal", 0.25, 0.75, 1.0]
   */
  snapPoints?: Array<number | "minimal">;
  /** Which snap index to open at. Defaults to the last (largest) snap. */
  defaultSnapIndex?: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = windowHeight - insets.top - insets.bottom;

  // Measure drag-handle + header row combined so "minimal" = exactly that height.
  const [dragZoneHeight, setDragZoneHeight] = useState(52);

  const hasSnaps = Array.isArray(snapPoints) && snapPoints.length > 0;

  // Absolute pixel heights for each snap point.
  const snapHeights: number[] | null = hasSnaps
    ? snapPoints!.map((p) =>
        p === "minimal" ? dragZoneHeight : Math.round(availableHeight * (p as number))
      )
    : null;

  // Sheet's rendered height = largest snap (or fixed heightFraction).
  const maxSheetHeight = snapHeights
    ? Math.max(...snapHeights)
    : Math.min(Math.round(availableHeight * heightFraction), availableHeight);

  // translateY mapping:  0 → sheet fully open at maxSheetHeight above bottom
  //                      maxSheetHeight → sheet fully hidden below screen
  const translateYForIdx = (idx: number) =>
    snapHeights ? maxSheetHeight - snapHeights[idx] : 0;

  const initSnapIdx = defaultSnapIndex ?? (snapHeights ? snapHeights.length - 1 : 0);

  const [isExiting, setIsExiting] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(maxSheetHeight)).current;
  const exitCancelRef = useRef<(() => void) | null>(null);
  const prevVisibleRef = useRef(visible);

  // Stable refs used inside PanResponder (avoids stale closures).
  const slideValueRef = useRef(maxSheetHeight);
  const gestureStartYRef = useRef(maxSheetHeight);
  const snapIdxRef = useRef(initSnapIdx);
  const snapHeightsRef = useRef(snapHeights);
  const maxSheetHeightRef = useRef(maxSheetHeight);
  const visibleRef = useRef(visible);
  const isExitingRef = useRef(isExiting);

  // Keep mutable refs in sync each render.
  snapHeightsRef.current = snapHeights;
  maxSheetHeightRef.current = maxSheetHeight;
  visibleRef.current = visible;
  isExitingRef.current = isExiting;

  // Track animated slide value for PanResponder.
  useEffect(() => {
    const id = slide.addListener(({ value }) => {
      slideValueRef.current = value;
    });
    return () => slide.removeListener(id);
  }, [slide]);

  useEffect(() => () => { exitCancelRef.current?.(); }, []);

  // Sound on open.
  useEffect(() => {
    const prev = prevVisibleRef.current;
    if (!prev && visible) emitSoundEvent("ui.modalOpen");
    prevVisibleRef.current = visible;
  }, [visible]);

  // Open animation.
  useEffect(() => {
    if (visible && !isExiting) {
      const targetY = hasSnaps ? translateYForIdx(initSnapIdx) : 0;
      snapIdxRef.current = initSnapIdx;
      slide.setValue(maxSheetHeight);
      slideValueRef.current = maxSheetHeight;
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: DURATION.normal,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(slide, {
          toValue: targetY,
          duration: DURATION.normal,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [visible, isExiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when hidden.
  useEffect(() => {
    if (!visible && !isExiting) {
      backdrop.setValue(0);
      slide.setValue(maxSheetHeight);
      slideValueRef.current = maxSheetHeight;
    }
  }, [visible, isExiting]); // eslint-disable-line react-hooks/exhaustive-deps

  const runExit = () => {
    exitCancelRef.current?.();
    let cancelled = false;
    const msh = maxSheetHeightRef.current;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: DURATION.fast,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slide, {
        toValue: msh,
        duration: DURATION.normal,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => {
      if (cancelled) return;
      setIsExiting(false);
      isExitingRef.current = false;
      onClose();
    });
    exitCancelRef.current = () => { cancelled = true; };
  };

  const handleClose = () => {
    if (!visibleRef.current) return;
    emitSoundEvent("ui.modalClose");
    setIsExiting(true);
    isExitingRef.current = true;
    runExit();
  };

  // Keep handleClose ref fresh for PanResponder.
  const handleCloseRef = useRef(handleClose);
  useEffect(() => { handleCloseRef.current = handleClose; });

  const animateToSnapIdx = (idx: number) => {
    const sh = snapHeightsRef.current;
    const msh = maxSheetHeightRef.current;
    if (!sh) return;
    const clamped = Math.max(0, Math.min(sh.length - 1, idx));
    snapIdxRef.current = clamped;
    Animated.spring(slide, {
      toValue: msh - sh[clamped],
      tension: 55,
      friction: 11,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  };

  const animateToSnapRef = useRef(animateToSnapIdx);
  useEffect(() => { animateToSnapRef.current = animateToSnapIdx; });

  const panResponder = useRef(
    PanResponder.create({
      // Claim the responder immediately on the drag zone when snaps are active.
      // Being a deeper node than any parent Pressable, child Pressables (e.g. close button)
      // still win via RN's bottom-up responder priority — taps on them are unaffected.
      onStartShouldSetPanResponder: () => !!snapHeightsRef.current,
      onMoveShouldSetPanResponder: (_, gs) =>
        !!snapHeightsRef.current &&
        Math.abs(gs.dy) > 4 &&
        Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderTerminationRequest: () => true,
      onPanResponderGrant: () => {
        slide.stopAnimation();
        gestureStartYRef.current = slideValueRef.current;
      },
      onPanResponderMove: (_, gs) => {
        const msh = maxSheetHeightRef.current;
        if (!snapHeightsRef.current) return;
        // Allow dragging up (negative) clamped at 0, and down past maxSheetHeight for rubber band.
        const raw = gestureStartYRef.current + gs.dy;
        const clamped = Math.max(0, Math.min(msh + 60, raw));
        slide.setValue(clamped);
        slideValueRef.current = clamped;
      },
      onPanResponderRelease: (_, gs) => {
        const sh = snapHeightsRef.current;
        const msh = maxSheetHeightRef.current;
        if (!sh) return;

        const currentHeight = msh - slideValueRef.current;
        const { vy } = gs; // px/s, positive = downward

        // Dragged well below the smallest snap → close.
        if (currentHeight < sh[0] * 0.5) {
          handleCloseRef.current();
          return;
        }

        // Fast downward flick → step down one snap (or close from lowest).
        if (vy > FLICK_VELOCITY) {
          if (snapIdxRef.current === 0) {
            handleCloseRef.current();
          } else {
            animateToSnapRef.current(snapIdxRef.current - 1);
          }
          return;
        }

        // Fast upward flick → step up one snap.
        if (vy < -FLICK_VELOCITY) {
          animateToSnapRef.current(snapIdxRef.current + 1);
          return;
        }

        // No flick: snap to nearest height.
        let nearestIdx = 0;
        let minDist = Infinity;
        sh.forEach((h, i) => {
          const dist = Math.abs(h - currentHeight);
          if (dist < minDist) { minDist = dist; nearestIdx = i; }
        });
        animateToSnapRef.current(nearestIdx);
      },
    })
  ).current;

  const showOverlay = visible || isExiting;

  const sheetInner = (
    <>
      {/* Drag zone: handle pill + header row — receives pan gestures */}
      <View
        {...(hasSnaps ? panResponder.panHandlers : {})}
        onLayout={
          hasSnaps
            ? (e) => setDragZoneHeight(e.nativeEvent.layout.height)
            : undefined
        }
      >
        {hasSnaps && (
          <View className="items-center pt-2 pb-1">
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.25)",
              }}
            />
          </View>
        )}
        <View className="ui-row justify-between ui-border-b ui-p-inline-4 ui-p-stack-3 shrink-0">
          <Text variant="h2">{title}</Text>
          <Pressable
            onPress={handleClose}
            className="ui-touch"
            style={({ pressed }) => ({ opacity: pressed ? PRESS_OPACITY.pressed : 1 })}
          >
            <Text variant="muted">{MODAL.close}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, minHeight: 0 }} className="ui-p-4">
        {children}
      </View>
    </>
  );

  const sheetContent = (
    <>
      {blocking && (
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: BACKDROP_OVERLAY,
            opacity: backdrop,
            pointerEvents: showOverlay ? "auto" : "none",
          }}
        />
      )}
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: maxSheetHeight,
          transform: [{ translateY: slide }],
          pointerEvents: "box-none",
        }}
      >
        {/*
         * Blocking sheets use Pressable to swallow taps that would otherwise
         * bubble up to the Modal backdrop. Non-blocking sheets use a plain View
         * so that PanResponder on the drag zone has uncontested event ownership
         * on both web (mouse) and native (touch).
         */}
        {(blocking ? (
          <Pressable
            style={{ height: maxSheetHeight, paddingBottom: insets.bottom }}
            className="flex flex-col rounded-t-lg bg-panel bottom-sheet"
            onPress={(e) => e.stopPropagation()}
          >
            {sheetInner}
          </Pressable>
        ) : (
          <View
            style={{ height: maxSheetHeight, paddingBottom: insets.bottom }}
            className="flex flex-col rounded-t-lg bg-panel bottom-sheet"
          >
            {sheetInner}
          </View>
        ))}
      </Animated.View>
    </>
  );

  if (blocking) {
    return (
      <Modal visible={showOverlay} transparent animationType="none">
        <Pressable className="flex-1 justify-end" onPress={handleClose}>
          {sheetContent}
        </Pressable>
      </Modal>
    );
  }

  if (!showOverlay) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end" }}
    >
      {sheetContent}
    </View>
  );
}
