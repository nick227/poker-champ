import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Screen } from "@/components/containers/Screen";
import { BottomBar } from "@/components/containers/BottomBar";
import { Masthead } from "@/components/domain/lobby/Masthead";
import { AppTopNav } from "@/components/domain/navigation/AppTopNav";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { OnlinePlayersSheet } from "@/components/domain/lobby/OnlinePlayersSheet";
import { storeRegistry } from "@/registry/store.registry";
import { useBankroll } from "@/hooks/useBankroll";
import { useProfile } from "@/hooks/useProfile";
import { useLobbyRealtimeBridge } from "@/realtime/lobbyRealtimeBridge";

export default function SlotsScreen() {
  const profile = useProfile();
  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);
  const [onlineSheetVisible, setOnlineSheetVisible] = useState(false);

  const {
    onlineTotal,
    onlinePlayers,
    onlineBusy,
    onlineError,
  } = storeRegistry.use.lobby();
  const { requestOnlinePlayers } = useLobbyRealtimeBridge();

  useEffect(() => {
    setSlotBankroll(bankroll);
  }, [bankroll]);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetVisible(true);
    requestOnlinePlayers();
  }, [requestOnlinePlayers]);

  const onlineLabel = onlineTotal === 1 ? "1 Online" : `${onlineTotal} Online`;

  const currentBankroll = slotBankroll ?? 0;

  return (
    <Screen>
      <Masthead />
      <AppTopNav
        username={profile.username ?? "Player"}
        onlineLabel={onlineLabel}
        onPressOnline={openOnlineSheet}
        amountCents={currentBankroll}
        avatarUrl={profile.avatarUrl}
      />

      <View className="flex-1 slot-container">
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="slot-machine-container justify-start" style={{ flex: 1, minHeight: 900 }}>
            <ThemeProvider initialThemeId="poker-champ-dark">
              <SlotMachine bankrollCents={currentBankroll} onBankrollChange={setSlotBankroll} />
            </ThemeProvider>
          </View>
        </ScrollView>
      </View>

      <OnlinePlayersSheet
        visible={onlineSheetVisible}
        onClose={() => setOnlineSheetVisible(false)}
        players={onlinePlayers}
        loading={onlineBusy}
        error={onlineError}
        onRefresh={requestOnlinePlayers}
      />

      <BottomBar active="lobby" />
    </Screen>
  );
}
