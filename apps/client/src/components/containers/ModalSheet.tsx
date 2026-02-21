import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Platform, Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { Text } from "@/components/base/Text";
import { DURATION, PRESS_OPACITY } from "@/theme/animation";
import { BACKDROP_OVERLAY } from "@/theme/colors";
import { MODAL } from "@/constants/copy";
import { playSound } from "@/lib/sound";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const USE_NATIVE_DRIVER = Platform.OS !== "web";

export function ModalSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const [isExiting, setIsExiting] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const exitCancelRef = useRef<(() => void) | null>(null);
  const prevVisibleRef = useRef(visible);

  useEffect(() => () => { exitCancelRef.current?.(); }, []);

  useEffect(() => {
    const prevVisible = prevVisibleRef.current;
    if (!prevVisible && visible) {
      playSound("modalOpen");
    }
    prevVisibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (visible && !isExiting) {
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
  }, [visible, isExiting, backdrop, slide]);

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
        toValue: SCREEN_HEIGHT,
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
    playSound("modalClose");
    setIsExiting(true);
    runExit();
  };

  useEffect(() => {
    if (!visible && !isExiting) {
      backdrop.setValue(0);
      slide.setValue(SCREEN_HEIGHT);
    }
  }, [visible, isExiting, backdrop, slide]);

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
          <Pressable className="max-h-[80%] bottom-sheet rounded-t-lg bg-panel" onPress={(e) => e.stopPropagation()}>
            <View className="ui-row justify-between ui-border-b ui-p-inline-4 ui-p-stack-3">
              <Text variant="h2">{title}</Text>
              <Pressable onPress={handleClose} className="ui-touch" style={({ pressed }) => ({ opacity: pressed ? PRESS_OPACITY.pressed : 1 })}>
                <Text variant="muted">{MODAL.close}</Text>
              </Pressable>
            </View>
            <View className="ui-p-4">{children}</View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
