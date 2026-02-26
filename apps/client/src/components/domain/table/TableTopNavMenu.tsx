import { useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Text } from "@/components/base/Text";

export type TableTopNavMenuProps = {
  chatBadge?: number;
  voiceEnabled: boolean;
  onOpenTheme: () => void;
  onToggleVoice: () => void;
  onOpenChat: () => void;
  onAddBot: () => void;
  addBotDisabled?: boolean;
};

export function TableTopNavMenu({
  chatBadge,
  voiceEnabled,
  onOpenTheme,
  onToggleVoice,
  onOpenChat,
  onAddBot,
  addBotDisabled = false,
}: TableTopNavMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const closeMenu = () => {
    setOpen(false);
  };

  const runAndClose = (action: () => void) => {
    action();
    closeMenu();
  };

  const windowWidth = Dimensions.get("window").width;
  const menuRight = anchor ? Math.max(8, windowWidth - (anchor.x + anchor.width)) : 8;
  const menuTop = anchor ? anchor.y + anchor.height + 6 : 60;

  return (
    <View className="relative">
      <View ref={triggerRef}>
        <IconButton
          variant="link"
          icon={<Icon name="menu" size={20} />}
          onPress={() => (open ? closeMenu() : openMenu())}
        />
      </View>
      {open ? (
        <Modal transparent visible animationType="fade" onRequestClose={closeMenu}>
          <Pressable style={{ flex: 1 }} onPress={closeMenu} />
          <View style={{ position: "absolute", right: menuRight, top: menuTop, zIndex: 30 }}>
            <View
              className="min-w-[180px] rounded-lg border border-border-subtle px-2 py-2"
              style={{ backgroundColor: "rgba(20, 24, 30, 0.96)" }}
            >
              <Pressable onPress={() => runAndClose(onOpenTheme)} className="px-2 py-2">
                <Text variant="body">Theme</Text>
              </Pressable>
              <Pressable onPress={() => runAndClose(onToggleVoice)} className="px-2 py-2">
                <Text variant="body">Voice chat: {voiceEnabled ? "On" : "Off"}</Text>
              </Pressable>
              <Pressable onPress={() => runAndClose(onOpenChat)} className="px-2 py-2">
                <Text variant="body">Text chat{chatBadge ? ` (${chatBadge})` : ""}</Text>
              </Pressable>
              <Pressable onPress={() => runAndClose(onAddBot)} disabled={addBotDisabled} className="px-2 py-2">
                <Text variant="body" className={addBotDisabled ? "text-text-subtle" : undefined}>
                  Add bot
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
