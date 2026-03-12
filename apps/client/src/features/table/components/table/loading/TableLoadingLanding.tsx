import { useMemo, useState } from "react";
import { View, useWindowDimensions, ScrollView } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import { LoadingIndicatorMinimal } from "./LoadingIndicatorMinimal";
import { SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
import { useBankroll } from "@/hooks/useBankroll";

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
    return "Joining Table";
  }, [mode]);

  const actionTitle = mode === "auth_required" ? "Go to Login" : "Return to Lobby";
  const actionHandler = mode === "auth_required" ? (onGoToLogin ?? onReturnToLobby) : onReturnToLobby;
  const shouldShowAction = mode !== "auth_loading";

  const { cents: bankroll } = useBankroll();
  const [slotBankroll, setSlotBankroll] = useState(bankroll);

  const currentBankroll = slotBankroll ?? bankroll;
  const minBetCents = 100;
  const effectiveBankroll =
    currentBankroll != null && currentBankroll >= minBetCents ? currentBankroll : undefined;
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
      <View style={{ width: "100%" }} className="gap-4 flex-1">
      <ScrollView className="flex-1">
        <View className="rounded-2xl border border-border-subtle bg-panel-elevated" style={{ padding: cardPadding }}>
          <View className="flex-row items-center gap-3">
            <LoadingIndicatorMinimal reducedMotion={reducedMotion} />
            <Text variant="label" className="text-text-subtle">
              Loading Table
            </Text>
          </View>
          <Text variant="h2" className="mt-3 text-text">
            {loadingTitle}
          </Text>
          <Text variant="muted" className="mt-2 text-text-subtle">
            {statusMessage}
          </Text>
          {shouldShowAction ? (
            <View className="mt-4">
              <Button title={actionTitle} onPress={actionHandler} intent="secondary" />
            </View>
          ) : null}
        </View>

        <View
          key={tableId ?? "session"}
          className="overflow-hidden rounded-2xl border border-border-subtle bg-panel-elevated"
          style={{ minHeight: SLOT_LANDING_MIN_HEIGHT }}
        >
          <ThemeProvider initialThemeId="poker-champ-dark">
            <SlotMachine
              bankrollCents={effectiveBankroll}
              onBankrollChange={setSlotBankroll}
              onSpinStart={handleSlotSpinStart}
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
