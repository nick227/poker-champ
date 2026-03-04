import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { DURATION, PRESS_OPACITY } from "@/theme/animation";
import { BACKDROP_OVERLAY } from "@/theme/colors";
import { MODAL } from "@/constants/copy";
import { emitSoundEvent } from "@/sound/emitSoundEvent";

const USE_NATIVE_DRIVER = Platform.OS !== "web";

const DEFAULT_HEIGHT_FRACTION = 0.7;

export function ModalSheet({
  visible,
  onClose,
  title,
  children,
  heightFraction = DEFAULT_HEIGHT_FRACTION,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Fraction of screen height (0–1), default 0.7 */
  heightFraction?: number;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableHeight = windowHeight - insets.top - insets.bottom;
  const sheetHeight = Math.min(Math.round(availableHeight * heightFraction), availableHeight);

  const [isExiting, setIsExiting] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const exitCancelRef = useRef<(() => void) | null>(null);
  const prevVisibleRef = useRef(visible);

  useEffect(() => () => { exitCancelRef.current?.(); }, []);

  useEffect(() => {
    const prevVisible = prevVisibleRef.current;
    if (!prevVisible && visible) {
      emitSoundEvent("ui.modalOpen");
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (visible && !isExiting) {
      slide.setValue(sheetHeight);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: DURATION.normal,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: DURATION.normal,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [visible, isExiting, backdrop, slide, sheetHeight]);

  const runExit = () => {
    exitCancelRef.current?.();
    let cancelled = false;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: DURATION.fast,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(slide, {
        toValue: sheetHeight,
        duration: DURATION.normal,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => {
      if (cancelled) return;
      setIsExiting(false);
      onClose();
    });
    exitCancelRef.current = () => { cancelled = true; };
  };

  const handleClose = () => {
    if (!visible) return;
    emitSoundEvent("ui.modalClose");
    setIsExiting(true);
    runExit();
  };

  useEffect(() => {
    if (!visible && !isExiting) {
      backdrop.setValue(0);
      slide.setValue(sheetHeight);
    }
  }, [visible, isExiting, backdrop, slide, sheetHeight]);

  const showModal = visible || isExiting;

  return (
    <Modal visible={showModal} transparent animationType="none">
      <Pressable className="flex-1 justify-end" onPress={handleClose}>
        <Animated.View
          style={{ flex: 1, backgroundColor: BACKDROP_OVERLAY, opacity: backdrop }}
          pointerEvents={showModal ? "auto" : "none"}
        />
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ translateY: slide }],
          }}
          pointerEvents="box-none"
        >
          <Pressable
            style={{
              height: sheetHeight,
              maxHeight: sheetHeight,
              paddingBottom: insets.bottom,
            }}
            className="flex flex-col rounded-t-lg bg-panel bottom-sheet"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="ui-row justify-between ui-border-b ui-p-inline-4 ui-p-stack-3 shrink-0">
              <Text variant="h2">{title}</Text>
              <Pressable onPress={handleClose} className="ui-touch" style={({ pressed }) => ({ opacity: pressed ? PRESS_OPACITY.pressed : 1 })}>
                <Text variant="muted">{MODAL.close}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, minHeight: 0 }} className="ui-p-4">{children}</View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
