import { useMemo, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { IconButton } from "@/components/base/IconButton";
import { Icon } from "@/components/base/Icons";
import { Text } from "@/components/base/Text";
import { LoadingIndicatorMinimal } from "./LoadingIndicatorMinimal";
import { LONGEST_SPIN_MS, SlotMachine, ThemeProvider } from "@/components/domain/slot-machine/src";
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

/** Match slot machine longest reel spin including near-win linger. */
const ONE_SPIN_MS = LONGEST_SPIN_MS;

export function TableLoadingLanding({
  mode,
  statusMessage,
  tableId,
  onReturnToLobby,
  onGoToLogin,
  reducedMotion,
  onSlotSpinStart,
}: TableLoadingLandingProps) {
  const [isDismissed, setIsDismissed] = useState(false);

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
    <View className="flex-1 bg-background relative">
      <View key={tableId ?? "session"} className="absolute inset-0" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
        <ThemeProvider initialThemeId="poker-champ-dark">
          <SlotMachine
            bankrollCents={linked ? bankroll : undefined}
            onBankrollChange={linked ? setCents : undefined}
            onSpinStart={handleSlotSpinStart}
            reducedMotion={reducedMotion}
          />
        </ThemeProvider>
      </View>

      {/* Centered Combined Message & Action Card */}
      {!isDismissed && (
        <View className="absolute inset-0 items-center justify-center pointer-events-none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 10 }}>
          <View 
            className="bg-panel-elevated/95 border border-border-subtle rounded-2xl p-6 items-center pointer-events-auto"
            style={{ width: 320, maxWidth: '90%', shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 }}
          >
            <View className="absolute top-2 right-2">
              <IconButton
                icon={<Icon name="close" size={20} />}
                onPress={() => setIsDismissed(true)}
                intent="ghost"
                size="sm"
                accessibilityLabel="Dismiss message"
              />
            </View>

            <View className="items-center mb-4 mt-2">
              <LoadingIndicatorMinimal reducedMotion={reducedMotion} />
            </View>

            <Text variant="h2" className="text-text text-center mb-2">
              {loadingTitle}
            </Text>
            {statusMessage ? (
              <Text variant="body" className="text-text-subtle text-center mb-6">
                {statusMessage}
              </Text>
            ) : null}

            {shouldShowAction ? (
              <View className="w-full">
                <Button title={actionTitle} onPress={actionHandler} intent="secondary" />
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* Persistent discreet Return to Lobby button if dismissed */}
      {isDismissed && shouldShowAction && (
        <View className="absolute top-4 left-4 z-10">
          <IconButton
            icon={<Icon name="back" size={24} />}
            onPress={actionHandler}
            intent="ghost"
            size="lg"
            accessibilityLabel={actionTitle}
          />
        </View>
      )}
    </View>
  );
}
