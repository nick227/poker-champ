import { useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";

export type TableTopNavMenuProps = {
  chatBadge?: number;
  voiceEnabled: boolean;
  onOpenTheme: () => void;
  onToggleVoice: () => void;
  onOpenChat: () => void;
  onAddBot: () => void;
  onLeaveTable: () => void;
  addBotDisabled?: boolean;
};

export function TableTopNavMenu({
  chatBadge,
  voiceEnabled,
  onOpenTheme,
  onToggleVoice,
  onOpenChat,
  onAddBot,
  onLeaveTable,
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
              <View className="mb-1">
                <Button
                  title="Theme"
                  onPress={() => runAndClose(onOpenTheme)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              <View className="mb-1">
                <Button
                  title={`Voice chat: ${voiceEnabled ? "On" : "Off"}`}
                  onPress={() => runAndClose(onToggleVoice)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              <View className="mb-1">
                <Button
                  title={`Text chat${chatBadge ? ` (${chatBadge})` : ""}`}
                  onPress={() => runAndClose(onOpenChat)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              <View className="mb-1">
                <Button
                  title="Add bot"
                  onPress={() => runAndClose(onAddBot)}
                  disabled={addBotDisabled}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              <Button
                title="Leave table"
                onPress={() => runAndClose(onLeaveTable)}
                intent="danger"
                shape="row"
                size="md"
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
