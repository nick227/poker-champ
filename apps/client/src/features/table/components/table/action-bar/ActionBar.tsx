import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TABLE } from "@/constants/copy";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "../table.adapter";
import { ActionContext } from "./actionBar.logic";
import { CONTAINER } from "./layout";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { actionBarStyles } from "./styles";
import { useActionBarController, type ActionBarController } from "./actionBar.controller";
import { ActionButtons } from "./ActionButtons";
import { WagerChips } from "./WagerChips";
import { WagerInput } from "./WagerInput";

export { ACTION_BAR_HEIGHT };

export type TableAction = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type ActionBarOnAction = (payload: { type: TableAction; amount?: number }) => void;

export type ActionBarProps = {
  actionContext: ActionContext;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  onAction: ActionBarOnAction;
  /** When true, bar is interactive even if actionContext.showActions is false (e.g. lesson resume). */
  forceInteractive?: boolean;
};

export function ActionBar({
  actionContext,
  forceInteractive = false,
  ...rest
}: ActionBarProps) {
  const ctrl: ActionBarController = useActionBarController({ actionContext, ...rest });
  const interactive = ctrl.showActions || forceInteractive;

  return (
    <View
      collapsable={false}
      className="relative"
      style={[actionBarStyles.root, { height: ACTION_BAR_HEIGHT }]}
    >
      <View
        style={[
          actionBarStyles.inner,
          {
            opacity: interactive ? 1 : 0.5,
            pointerEvents: interactive ? "auto" : "none",
          },
        ]}
        className="ui-action-bar mt-2"
      >
        <View style={actionBarStyles.statusRow} className="ui-center justify-center bg-panel/90 rounded-lg px-3 py-1">
          <Text variant="label" allowFontScaling={false}>
            {ctrl.statusLabel}
          </Text>
        </View>
        <View style={{ gap: CONTAINER.GAP }}>
          <ActionButtons
            checkCallLabel={ctrl.checkCallLabel}
            permissions={ctrl.permissions}
            actions={ctrl.actions}
            wager={ctrl.wager}
          />
          <WagerChips permissions={ctrl.permissions} actions={ctrl.actions} />
          <View className="ui-row justify-center rounded-md max-w-[200px] mx-auto">
            <WagerInput
              visible={ctrl.wager.visible}
              display={ctrl.wager.display}
              placeholder={ctrl.wager.placeholder}
              editable={ctrl.permissions.canWager}
              onChangeText={ctrl.handleBetInputChange}
              onBlur={ctrl.normalizeBetInput}
              onSubmitEditing={ctrl.normalizeBetInput}
            />
          </View>
        </View>
      </View>
      {ctrl.showReconnectingOverlay && (
        <View style={{ pointerEvents: "auto" }} className="absolute inset-0 bg-black/50 ui-center ui-stack-2 rounded-lg max-w-[140px] mx-auto">
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            variant="body"
            className="text-white text-center"
            allowFontScaling={false}
          >
            {TABLE.reconnecting}
          </Text>
        </View>
      )}
    </View>
  );
}
