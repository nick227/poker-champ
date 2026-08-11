import type { ReactNode } from "react";
import { View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChromeInsetsProvider } from "@/components/containers/ChromeInsets";
import { NavRail } from "@/components/containers/NavRail";
import { WorkspaceStatusBar } from "@/components/domain/navigation/WorkspaceStatusBar";
import { MobileNavSheet } from "@/components/domain/navigation/MobileNavSheet";
import { OnlinePlayersSheet } from "@/features/lobby";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { useWorkspaceStatusChrome } from "@/hooks/useWorkspaceStatusChrome";
import { useMobileNavStore } from "@/stores/mobileNav.store";
import { resolvePrimaryNavActive, shouldShowPrimaryNav } from "@/lib/primaryNav";

function shouldShowWorkspaceStatusBar(pathname: string): boolean {
  return shouldShowPrimaryNav(pathname);
}

/**
 * Owns primary chrome: NavRail (desktop) / WorkspaceStatusBar's mobile hamburger + sheet
 * (mobile) + one persistent status bar (online / account; on `/table` also table name ·
 * stakes + table menu). Pages must not mount Masthead or their own top nav.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const insets = useSafeAreaInsets();
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const showNav = shouldShowPrimaryNav(pathname);
  const showStatusBar = shouldShowWorkspaceStatusBar(pathname);
  const active = resolvePrimaryNavActive(pathname);
  const status = useWorkspaceStatusChrome();
  const mobileNavOpen = useMobileNavStore((s) => s.open);
  const closeMobileNav = useMobileNavStore((s) => s.setOpen);

  const statusChrome = showStatusBar ? (
    <>
      <WorkspaceStatusBar
        username={status.username}
        amountCents={status.amountCents}
        onlineLabel={status.onlineLabel}
        onPressOnline={status.onPressOnline}
        avatarUrl={status.avatarUrl}
        authenticated={status.authenticated}
      />
      <OnlinePlayersSheet
        visible={status.onlineSheetVisible}
        onClose={status.closeOnlineSheet}
        players={status.onlinePlayers}
        loading={status.onlineBusy}
        error={status.onlineError}
        onRefresh={status.requestOnlinePlayers}
      />
      {!isDesktopWorkspace ? (
        <MobileNavSheet
          visible={mobileNavOpen}
          onClose={() => closeMobileNav(false)}
          active={active}
        />
      ) : null}
    </>
  ) : null;

  if (!showNav) {
    return (
      <ChromeInsetsProvider topConsumed={false}>
        <View className="app-content bg-bg/70">{children}</View>
      </ChromeInsetsProvider>
    );
  }

  if (isDesktopWorkspace) {
    const mainBleed = pathname.startsWith("/table") || pathname.startsWith("/slots");
    return (
      <ChromeInsetsProvider topConsumed={showStatusBar}>
        <View className="app-shell-desktop bg-bg/70">
          <NavRail active={active} />
          <View
            className={mainBleed ? "app-main app-main--bleed" : "app-main"}
            style={showStatusBar ? { paddingTop: insets.top } : undefined}
          >
            {statusChrome}
            {children}
          </View>
        </View>
      </ChromeInsetsProvider>
    );
  }

  return (
    <ChromeInsetsProvider topConsumed={showStatusBar}>
      <View className="app-content bg-bg/70">
        <View
          className="flex-1 min-h-0"
          style={showStatusBar ? { paddingTop: insets.top } : undefined}
        >
          {statusChrome}
          {children}
        </View>
      </View>
    </ChromeInsetsProvider>
  );
}
