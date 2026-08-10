import { View } from "react-native";
import { TABLE } from "@/constants/copy";
import type { Permissions, ActionHandlers } from "./actionBar.controller";
import { actionBarStyles } from "./styles";
import { PokerActionButton } from "./PokerActionButton";
import { HudChipButton } from "./HudChipButton";

type WagerChipsProps = {
  permissions: Permissions;
  actions: Pick<ActionHandlers, "setMin" | "halfPot" | "pot" | "allIn">;
};

export function WagerChips({ permissions, actions }: WagerChipsProps) {
  const showRow = permissions.canWager || permissions.canAllIn;
  if (!showRow) {
    return <View collapsable={false} style={[actionBarStyles.chipsRow, { width: "100%" }]} />;
  }

  if (!permissions.canWager && permissions.canAllIn) {
    return (
      <View style={actionBarStyles.buttonsRow}>
        <PokerActionButton
          variant="allIn"
          title={TABLE.allIn}
          onPress={actions.allIn}
          style={{ flex: 1 }}
          disabled={!permissions.canAllIn}
        />
      </View>
    );
  }

  return (
    <View style={actionBarStyles.chipsRow}>
      {permissions.canWager ? (
        <>
          <HudChipButton title={TABLE.min} onPress={actions.setMin} disabled={!permissions.canWager} />
          <HudChipButton
            title={TABLE.halfPot}
            onPress={actions.halfPot}
            disabled={!permissions.canWager}
          />
          <HudChipButton title={TABLE.pot} onPress={actions.pot} disabled={!permissions.canWager} />
        </>
      ) : null}
      {permissions.canAllIn ? (
        <HudChipButton
          title={TABLE.allIn}
          onPress={actions.allIn}
          disabled={!permissions.canAllIn}
          danger
        />
      ) : null}
    </View>
  );
}
