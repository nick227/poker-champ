import { View } from "react-native";
import { TABLE } from "@/constants/copy";
import type { Permissions, ActionHandlers, Wager } from "./actionBar.controller";
import { actionBarStyles } from "./styles";
import { PokerActionButton } from "./PokerActionButton";

type ActionButtonsProps = {
  checkCallLabel: string;
  permissions: Permissions;
  actions: Pick<ActionHandlers, "fold" | "checkCall" | "betRaise" | "allIn">;
  wager: Pick<Wager, "label" | "disabled">;
};

/** Primary act row — equal-width Fold / Check-Call / Bet-Raise / All-In. */
export function ActionButtons({
  checkCallLabel,
  permissions,
  actions,
  wager,
}: ActionButtonsProps) {
  const showAllIn = permissions.canAllIn;

  return (
    <View style={actionBarStyles.buttonsRow}>
      <PokerActionButton
        variant="fold"
        title={TABLE.fold}
        onPress={actions.fold}
        style={{ flex: 1 }}
        disabled={!permissions.canFold}
      />
      <PokerActionButton
        variant="checkCall"
        title={checkCallLabel}
        onPress={actions.checkCall}
        style={{ flex: 1 }}
        disabled={!permissions.canCheck && !permissions.canCall}
      />
      <PokerActionButton
        variant="betRaise"
        title={wager.label}
        onPress={actions.betRaise}
        style={{ flex: 1 }}
        disabled={!permissions.canWager || wager.disabled}
      />
      {showAllIn ? (
        <PokerActionButton
          variant="allIn"
          title={TABLE.allIn}
          onPress={actions.allIn}
          style={{ flex: 1 }}
          disabled={!permissions.canAllIn}
        />
      ) : null}
    </View>
  );
}
