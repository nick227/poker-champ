import { View } from "react-native";
import { ChipButton } from "@/components/base/ChipButton";
import { TABLE } from "@/constants/copy";
import type { Permissions, ActionHandlers } from "./actionBar.controller";
import { actionBarStyles } from "./styles";
import { PokerActionButton } from "./PokerActionButton";

type WagerChipsProps = {
  permissions: Permissions;
  actions: Pick<ActionHandlers, "setMin" | "halfPot" | "pot" | "allIn">;
};

export function WagerChips({ permissions, actions }: WagerChipsProps) {
  const showRow = permissions.canWager || permissions.canAllIn;
  if (!showRow) {
    return <View collapsable={false} style={[actionBarStyles.chipsRow, { width: "100%" }]} />;
  }

  // When only ALL IN is available (no wager chips), render it full-size to match the main action buttons.
  if (!permissions.canWager && permissions.canAllIn) {
    return (
      <View className="ui-row" style={actionBarStyles.buttonsRow}>
        <PokerActionButton
          variant="allIn"
          title={TABLE.allIn}
          onPress={actions.allIn}
          className="flex-1 min-w-0"
          disabled={!permissions.canAllIn}
        />
      </View>
    );
  }

  return (
    <View className="ui-row justify-center" style={actionBarStyles.chipsRow}>
      {permissions.canWager ? (
        <>
          <ChipButton title={TABLE.min} onPress={actions.setMin} disabled={!permissions.canWager} />
          <ChipButton title={TABLE.halfPot} onPress={actions.halfPot} disabled={!permissions.canWager} />
          <ChipButton title={TABLE.pot} onPress={actions.pot} disabled={!permissions.canWager} />
        </>
      ) : null}
      {permissions.canAllIn ? (
        <ChipButton
          title={TABLE.allIn}
          onPress={actions.allIn}
          disabled={!permissions.canAllIn}
          className="border border-danger/50"
        />
      ) : null}
    </View>
  );
}
