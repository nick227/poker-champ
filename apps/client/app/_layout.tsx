import "./global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppShell } from "@/components/containers/AppShell";
import { InjectWebTheme } from "@/components/domain/auth/InjectWebTheme";
import { bootstrapSdk } from "@/bootstrap/sdk";

export default function RootLayout() {
  useEffect(() => {
    void bootstrapSdk();
  }, []);

  return (
    <AppShell>
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
    </AppShell>
  );
}
