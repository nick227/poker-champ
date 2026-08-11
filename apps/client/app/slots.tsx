import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";

export default function SlotsScreen() {
  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

  return (
    <Screen>
      <View className="flex-1 bg-bg">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 24 }}
        >
          <ThemeProvider initialThemeId="poker-champ-dark">
            <SlotMachine
              bankrollCents={slotBankroll != null && slotBankroll > 0 ? slotBankroll : undefined}
              onBankrollChange={setSlotBankroll}
            />
          </ThemeProvider>
        </ScrollView>
      </View>
    </Screen>
  );
}
