import { useEffect, useRef, useState } from "react";
import { Dimensions, Modal, Pressable, View, Linking } from "react-native";
import { usePathname } from "expo-router";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Ionicons } from "@expo/vector-icons";

export type TableTopNavMenuProps = {
  chatBadge?: number;
  voiceEnabled: boolean;
  onOpenTheme: () => void;
  onOpenHandHistory: () => void;
  onToggleVoice: () => void;
  onOpenChat: () => void;
  onAddBot: () => void;
  onCopyInviteLink: () => void;
  onShareInviteLink: () => void;
  onLeaveTable: () => void;
  addBotDisabled?: boolean;
  /** Tournament tables only: current stack/pot display mode + toggle. */
  moneyDisplayMode?: "chips" | "bb";
  onToggleMoneyDisplayMode?: () => void;
};

export function TableTopNavMenu({
  chatBadge,
  voiceEnabled,
  onOpenTheme,
  onOpenHandHistory,
  onToggleVoice,
  onOpenChat,
  onAddBot,
  onCopyInviteLink,
  onShareInviteLink,
  onLeaveTable,
  addBotDisabled = false,
  moneyDisplayMode,
  onToggleMoneyDisplayMode,
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
    <View className="relative flex-row items-center gap-1">
      {!addBotDisabled && (
        <IconButton
          variant="link"
          icon={<Ionicons name="person-add-outline" size={20} className="text-white" />}
          onPress={onAddBot}
        />
      )}
      <IconButton
        variant="link"
        icon={<Ionicons name="color-palette-outline" size={20} className="text-white" />}
        onPress={onOpenTheme}
      />
      <IconButton
        variant="link"
        icon={<Ionicons name="time-outline" size={20} className="text-white" />}
        onPress={onOpenHandHistory}
      />
      <IconButton
        variant="link"
        icon={<Ionicons name="chatbubble-outline" size={20} className="text-white" />}
        onPress={onOpenChat}
        badge={chatBadge}
      />
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
              {onToggleMoneyDisplayMode ? (
                <View className="mb-1">
                  <Button
                    title={moneyDisplayMode === "bb" ? "Show as amount" : "Show as BB"}
                    onPress={() => runAndClose(onToggleMoneyDisplayMode)}
                    intent="neutral"
                    shape="row"
                    size="md"
                  />
                </View>
              ) : null}
              <View className="mb-1">
                <Button
                  title="Discord chat"
                  onPress={() =>
                    runAndClose(() =>
                      Linking.openURL("https://discord.gg/KZZexuqQxG")
                    )
                  }
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
