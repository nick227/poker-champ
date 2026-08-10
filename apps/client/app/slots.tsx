import { useEffect, useState } from "react";
import { ImageBackground, ScrollView } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";

const SLOT_BG = require("@/components/domain/slot-machine/assets/ui/background.png");

export default function SlotsScreen() {
  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

  return (
    <Screen>
      <ImageBackground source={SLOT_BG} style={{ flex: 1 }} resizeMode="cover">
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
          <ThemeProvider initialThemeId="poker-champ-dark">
            <SlotMachine bankrollCents={slotBankroll} onBankrollChange={setSlotBankroll} />
          </ThemeProvider>
        </ScrollView>
      </ImageBackground>
    </Screen>
  );
}
