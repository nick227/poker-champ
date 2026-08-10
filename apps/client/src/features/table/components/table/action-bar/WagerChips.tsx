import { View } from "react-native";
import { TABLE } from "@/constants/copy";
import type { Permissions, ActionHandlers } from "./actionBar.controller";
import { actionBarStyles } from "./styles";
import { HudChipButton } from "./HudChipButton";

type WagerChipsProps = {
  permissions: Permissions;
  actions: Pick<ActionHandlers, "setMin" | "halfPot" | "pot">;
};

/** Bet-sizing chips only — All-In lives in the primary ActionButtons row. */
export function WagerChips({ permissions, actions }: WagerChipsProps) {
  if (!permissions.canWager) {
    return null;
  }

  return (
    <View style={actionBarStyles.chipsRow}>
      <HudChipButton title={TABLE.min} onPress={actions.setMin} disabled={!permissions.canWager} />
      <HudChipButton
        title={TABLE.halfPot}
        onPress={actions.halfPot}
        disabled={!permissions.canWager}
      />
      <HudChipButton title={TABLE.pot} onPress={actions.pot} disabled={!permissions.canWager} />
    </View>
  );
}
