import { useMemo } from "react";
import { View, useWindowDimensions, ScrollView } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { LoadingIndicatorMinimal } from "./LoadingIndicatorMinimal";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";
import { useAuthStore } from "@/stores/auth.store";

export type TableLoadingMode = "auth_loading" | "auth_required" | "connecting";

export type TableLoadingLandingProps = {
  mode: TableLoadingMode;
  statusMessage: string;
  tableId?: string;
  onReturnToLobby: () => void;
  onGoToLogin?: () => void;
  reducedMotion?: boolean;
  onSlotSpinStart?: (spinDurationMs: number) => void;
};

/** Match slot machine longest reel spin (SlotMachine SPIN_DURATIONS max 1400ms). */
const ONE_SPIN_MS = 1500;
const SLOT_LANDING_MIN_HEIGHT = 380;

export function TableLoadingLanding({
  mode,
  statusMessage,
  tableId,
  onReturnToLobby,
  onGoToLogin,
  reducedMotion,
  onSlotSpinStart,
}: TableLoadingLandingProps) {
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const cardPadding = compact ? 14 : 18;

  const loadingTitle = useMemo(() => {
    if (mode === "auth_required") return "Login Required";
    if (mode === "auth_loading") return "Signing You In";
    return "";
  }, [mode]);

  const actionTitle = mode === "auth_required" ? "Go to Login" : "Return to Lobby";
  const actionHandler = mode === "auth_required" ? (onGoToLogin ?? onReturnToLobby) : onReturnToLobby;
  const shouldShowAction = mode !== "auth_loading";

  const { cents: bankroll, setCents } = useBankroll();
  const token = useAuthStore((s) => s.token);
  const linked = Boolean(token);
  const handleSlotSpinStart = () => onSlotSpinStart?.(ONE_SPIN_MS);

  return (
    <View
      className="flex-1"
      style={{
        paddingHorizontal: compact ? 12 : 16,
        paddingVertical: compact ? 14 : 22,
        justifyContent: "flex-start",
      }}
    >
      <View style={{ width: "100%", flex: 1 }}>
        <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
          <View className="rounded-2xl border border-border-subtle bg-panel-elevated" style={{ padding: cardPadding }}>
            <LoadingIndicatorMinimal reducedMotion={reducedMotion} />
            <Text variant="h2" className="mt-3 text-text">
              {loadingTitle} {statusMessage}
            </Text>
            {shouldShowAction ? (
              <View className="mt-4">
                <Button title={actionTitle} onPress={actionHandler} intent="secondary" />
              </View>
            ) : null}
          </View>

          <View key={tableId ?? "session"} style={{ minHeight: SLOT_LANDING_MIN_HEIGHT, flex: 1 }}>
            <ThemeProvider initialThemeId="poker-champ-dark">
              <SlotMachine
                bankrollCents={linked ? bankroll : undefined}
                onBankrollChange={linked ? setCents : undefined}
                onSpinStart={handleSlotSpinStart}
                reducedMotion={reducedMotion}
              />
            </ThemeProvider>
          </View>
        </ScrollView>

        <Text variant="caption" className="text-center text-text-subtle">
          Staying on this screen while the table initializes.
        </Text>
      </View>
    </View>
  );
}
