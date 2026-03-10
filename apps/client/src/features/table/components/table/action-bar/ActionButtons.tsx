import { View } from "react-native";
import { Button } from "@/components/base/Button";
import { TABLE } from "@/constants/copy";
import type { Permissions, ActionHandlers, Wager } from "./actionBar.controller";
import { actionBarStyles } from "./styles";

type ActionButtonsProps = {
  checkCallLabel: string;
  permissions: Permissions;
  actions: Pick<ActionHandlers, "fold" | "checkCall" | "betRaise">;
  wager: Pick<Wager, "label" | "disabled">;
};

export function ActionButtons({
  checkCallLabel,
  permissions,
  actions,
  wager,
}: ActionButtonsProps) {
  return (
    <View className="ui-row ui-center" style={actionBarStyles.buttonsRow}>
      <Button
        variant="danger"
        title={TABLE.fold}
        onPress={actions.fold}
        className="flex-1 min-w-0"
        disabled={!permissions.canFold}
      />
      <Button
        variant="ghost"
        title={checkCallLabel}
        onPress={actions.checkCall}
        className="flex-1 min-w-0"
        disabled={!permissions.canCheck && !permissions.canCall}
      />
      {permissions.canWager ? (
        <Button
          variant="primary"
          title={wager.label}
          onPress={actions.betRaise}
          className="flex-1 min-w-0"
          disabled={wager.disabled}
        />
      ) : null}
    </View>
  );
}
