import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { Text } from "@/components/base/Text";
import type { TableLoadPhase } from "@/lib/tableLoadPhase";

export type TableLoadRecoveryPanelProps = {
  statusMessage: string;
  phase: TableLoadPhase;
  lastError?: string | null;
  recoveryBusy?: boolean;
  /** Tournament tables can call ensure-table; cash tables use Retry only. */
  canRecoverTable?: boolean;
  onRetry: () => void;
  onRecover: () => void;
  onBackToLobby: () => void;
  devDiagnostics?: string;
};

export function TableLoadRecoveryPanel({
  statusMessage,
  phase,
  lastError,
  recoveryBusy = false,
  canRecoverTable = false,
  onRetry,
  onRecover,
  onBackToLobby,
  devDiagnostics,
}: TableLoadRecoveryPanelProps) {
  const showRecover = canRecoverTable && phase !== "failed";

  return (
    <View className="gap-y-3">
      <Text variant="h2" className="text-text">
        {statusMessage}
      </Text>
      {lastError ? (
        <Text variant="body" className="text-text-subtle">
          {lastError}
        </Text>
      ) : null}
      <View className="gap-y-2">
        <Button
          title={recoveryBusy ? "Working…" : "Retry"}
          onPress={onRetry}
          intent="primary"
          disabled={recoveryBusy}
        />
        {showRecover ? (
          <Button
            title="Recover table"
            onPress={onRecover}
            intent="secondary"
            disabled={recoveryBusy}
          />
        ) : null}
        <Button title="Back to lobby" onPress={onBackToLobby} intent="neutral" disabled={recoveryBusy} />
      </View>
      {__DEV__ && devDiagnostics ? (
        <Text variant="label" className="text-text-subtle normal-case tracking-normal">
          {devDiagnostics}
        </Text>
      ) : null}
    </View>
  );
}
