import "./global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { AppShell } from "@/components/containers/AppShell";
import { InjectWebTheme } from "@/components/domain/auth/InjectWebTheme";
import { bootstrapSdk } from "@/bootstrap/sdk";
import { storeRegistry } from "@/registry/store.registry";
import { LobbyRealtimeBridge } from "@/features/lobby/realtime/lobbyRealtimeBridge";

/** Override React Navigation default (rgb(242,242,242)) so stack screen container is transparent. */
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "transparent",
  },
};

export default function RootLayout() {
  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void Ionicons.loadFont().finally(() => {
      if (isMounted) {
        setIconsReady(true);
      }
    });
    storeRegistry.tables().pruneExpiredTables();
    void bootstrapSdk();
    return () => {
      isMounted = false;
    };
  }, []);

  if (!iconsReady) return null;

  return (
    <ThemeProvider value={NAV_THEME}>
      <AppShell>
        <LobbyRealtimeBridge>
          <InjectWebTheme />
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              animationDuration: 250,
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
        </LobbyRealtimeBridge>
      </AppShell>
    </ThemeProvider>
  );
}

