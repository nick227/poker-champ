import { View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";
import { useAuthStore } from "@/stores/auth.store";

/** Full-bleed video-slot monitor inside AppChrome (nav + status bar stay). */
export default function SlotsScreen() {
  const token = useAuthStore((s) => s.token);
  const { cents: bankroll, setCents } = useBankroll();
  const linked = Boolean(token);

  return (
    <Screen>
      <View style={{ flex: 1, minHeight: 0, width: "100%" }}>
        <ThemeProvider initialThemeId="poker-champ-dark">
          <SlotMachine
            bankrollCents={linked ? bankroll : undefined}
            onBankrollChange={linked ? setCents : undefined}
          />
        </ThemeProvider>
      </View>
    </Screen>
  );
}
