import type { ReactNode } from "react";
import { View } from "react-native";
import { usePathname } from "expo-router";
import { BottomBar } from "@/components/containers/BottomBar";
import { NavRail } from "@/components/containers/NavRail";
import { useIsDesktopWorkspace } from "@/hooks/useIsDesktopWorkspace";
import { resolvePrimaryNavActive, shouldShowPrimaryNav } from "@/lib/primaryNav";

/**
 * Owns primary chrome: BottomBar below desktop workspace, NavRail at 1024+.
 * Pages must not mount nav themselves.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const showNav = shouldShowPrimaryNav(pathname);
  const active = resolvePrimaryNavActive(pathname);

  if (!showNav) {
    return <View className="app-content bg-bg/70">{children}</View>;
  }

  if (isDesktopWorkspace) {
    const mainBleed = pathname.startsWith("/table");
    return (
      <View className="app-shell-desktop bg-bg/70">
        <NavRail active={active} />
        <View className={mainBleed ? "app-main app-main--bleed" : "app-main"}>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View className="app-content bg-bg/70">
      <View className="flex-1 min-h-0">{children}</View>
      <BottomBar active={active} />
    </View>
  );
}
