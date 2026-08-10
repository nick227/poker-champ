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
  /** Mobile: the bet/raise amount is already shown in the wager stepper right above
   * this row, and the button itself is too narrow (~1/4 of a 390px screen) to fit
   * "Raise: $1,234" without clipping the digits — so drop the amount here. */
  compact?: boolean;
};

/** Primary act row — equal-width Fold / Check-Call / Bet-Raise / All-In. */
export function ActionButtons({
  checkCallLabel,
  permissions,
  actions,
  wager,
  compact = false,
}: ActionButtonsProps) {
  const showAllIn = permissions.canAllIn;
  const wagerTitle = compact ? wager.label.split(":")[0].trim() : wager.label;

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
        title={wagerTitle}
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
