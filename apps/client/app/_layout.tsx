import "./global.css";
import { useEffect } from "react";
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
  // Always mount Stack on first paint. Returning null here blocks the root navigator and
  // causes "Attempted to navigate before mounting the Root Layout" when auth redirects fire.
  useEffect(() => {
    void Ionicons.loadFont();
    storeRegistry.tables().pruneExpiredTables();
    void bootstrapSdk();
  }, []);

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

