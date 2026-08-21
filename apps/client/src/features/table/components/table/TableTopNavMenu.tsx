import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dimensions, Modal, Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Ionicons } from "@expo/vector-icons";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";

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
  profileSlot?: ReactNode;
};

export function TableTopNavMenu({
  chatBadge,
  onOpenTheme,
  onOpenHandHistory,
  onOpenChat,
  onAddBot,
  onLeaveTable,
  addBotDisabled = false,
  moneyDisplayMode,
  onToggleMoneyDisplayMode,
  profileSlot,
}: TableTopNavMenuProps) {
  const pathname = usePathname();
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const closeMenu = () => setOpen(false);

  const runAndClose = (action: () => void) => {
    action();
    closeMenu();
  };

  const windowWidth = Dimensions.get("window").width;
  const menuRight = anchor ? Math.max(8, windowWidth - (anchor.x + anchor.width)) : 8;
  const menuTop = anchor ? anchor.y + anchor.height + 6 : 60;

  const chatButton = (
    <IconButton
      variant="link"
      size={isDesktopWorkspace ? "md" : "sm"}
      accessibilityLabel="Chat"
      icon={<Ionicons name="chatbubble-outline" size={20} className="text-white" />}
      onPress={onOpenChat}
      badge={chatBadge}
    />
  );

  const leaveButton = (
    <IconButton
      variant="link"
      size={isDesktopWorkspace ? "md" : "sm"}
      intent="danger"
      accessibilityLabel="Leave table"
      icon={<Ionicons name="exit-outline" size={20} />}
      onPress={onLeaveTable}
    />
  );

  if (isDesktopWorkspace) {
    return (
      <View className="flex-row items-center gap-1">
        {!addBotDisabled && (
          <IconButton
            variant="link"
            accessibilityLabel="Add a bot"
            icon={<Ionicons name="person-add-outline" size={20} className="text-white" />}
            onPress={onAddBot}
          />
        )}
        <IconButton
          variant="link"
          accessibilityLabel="Table theme"
          icon={<Ionicons name="color-palette-outline" size={20} className="text-white" />}
          onPress={onOpenTheme}
        />
        <IconButton
          variant="link"
          accessibilityLabel="Hand history"
          icon={<Ionicons name="time-outline" size={20} className="text-white" />}
          onPress={onOpenHandHistory}
        />
        {chatButton}
        {onToggleMoneyDisplayMode ? (
          <IconButton
            variant="link"
            accessibilityLabel={moneyDisplayMode === "bb" ? "Show as amount" : "Show as BB"}
            icon={<Ionicons name="swap-horizontal-outline" size={20} className="text-white" />}
            onPress={onToggleMoneyDisplayMode}
          />
        ) : null}
        {profileSlot}
        {leaveButton}
      </View>
    );
  }

  return (
    <View className="relative flex-row items-center gap-0.5">
      {profileSlot}
      <View ref={triggerRef}>
        <IconButton
          variant="link"
          size="sm"
          accessibilityLabel="More table options"
          icon={<Icon name="menu" size={20} />}
          onPress={() => (open ? closeMenu() : openMenu())}
          badge={chatBadge}
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
                  title={chatBadge ? `Chat (${chatBadge > 99 ? "99+" : chatBadge})` : "Chat"}
                  onPress={() => runAndClose(onOpenChat)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              {!addBotDisabled ? (
                <View className="mb-1">
                  <Button
                    title="Add bot"
                    onPress={() => runAndClose(onAddBot)}
                    intent="neutral"
                    shape="row"
                    size="md"
                  />
                </View>
              ) : null}
              <View className="mb-1">
                <Button
                  title="Table theme"
                  onPress={() => runAndClose(onOpenTheme)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
              <View className="mb-1">
                <Button
                  title="Hand history"
                  onPress={() => runAndClose(onOpenHandHistory)}
                  intent="neutral"
                  shape="row"
                  size="md"
                />
              </View>
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
