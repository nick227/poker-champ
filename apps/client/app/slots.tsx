import { ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";
import { useAuthStore } from "@/stores/auth.store";

export default function SlotsScreen() {
  const token = useAuthStore((s) => s.token);
  const { cents: bankroll, setCents } = useBankroll();
  const linked = Boolean(token);

  return (
    <Screen>
      <View className="flex-1 bg-bg">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 24 }}
        >
          <ThemeProvider initialThemeId="poker-champ-dark">
            <SlotMachine
              bankrollCents={linked ? bankroll : undefined}
              onBankrollChange={linked ? setCents : undefined}
            />
          </ThemeProvider>
        </ScrollView>
      </View>
    </Screen>
  );
}
