import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { TABLE } from "@/constants/copy";
import type { HeroActionOptions } from "@poker-champ/realtime-contract";
import type { HeroStatus } from "../table.adapter";
import { ActionContext } from "./actionBar.logic";
import { ACTION_BAR_HEIGHT } from "../constants/table-layout.constants";
import { actionBarStyles } from "./styles";
import { useActionBarController, type ActionBarController } from "./actionBar.controller";
import { ActionButtons } from "./ActionButtons";
import { AllInBanner } from "./AllInBanner";
import { WagerChips } from "./WagerChips";
import { WagerInput } from "./WagerInput";
import { useIsMobile } from "@/hooks/useIsMobile";

export { ACTION_BAR_HEIGHT };

export type TableAction = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";

export type ActionBarOnAction = (payload: { type: TableAction; amount?: number }) => void;

export type ActionBarProps = {
  actionContext: ActionContext;
  heroStatus: HeroStatus;
  actionOptions?: HeroActionOptions;
  potCents?: number;
  /** @deprecated Action copy lives on the felt (`FeltActionAnnounce`), not in the HUD. */
  statusMessage?: string;
  showStatusSpinner?: boolean;
  showTurnCue?: boolean;
  forceDisabled?: boolean;
  hideReconnectingOverlay?: boolean;
  onAction: ActionBarOnAction;
  forceInteractive?: boolean;
};

export function ActionBar({
  actionContext,
  forceDisabled = false,
  hideReconnectingOverlay = false,
  forceInteractive = false,
  heroStatus,
  statusMessage: _statusMessage,
  showStatusSpinner: _showStatusSpinner,
  showTurnCue: _showTurnCue,
  ...rest
}: ActionBarProps) {
  const isMobile = useIsMobile();
  const ctrl: ActionBarController = useActionBarController({ actionContext, heroStatus, ...rest });
  const interactive = !forceDisabled && (ctrl.showActions || forceInteractive);
  const isAllIn = !ctrl.showActions && heroStatus === "ALL_IN";

  if (isAllIn) {
    return (
      <View collapsable={false} style={[actionBarStyles.root, { maxHeight: ACTION_BAR_HEIGHT }]}>
        <AllInBanner visible />
      </View>
    );
  }

  return (
    <View
      collapsable={false}
      style={[actionBarStyles.root, { maxHeight: ACTION_BAR_HEIGHT }]}
    >
      <View
        pointerEvents={interactive ? "auto" : "none"}
        style={[actionBarStyles.inner, { opacity: interactive ? 1 : 0.55 }]}
      >
        {/* Same stack on tablet + desktop: sizing row (min/half/pot + $ stepper), then acts. */}
        <View style={actionBarStyles.sizingRow}>
          <WagerChips permissions={ctrl.permissions} actions={ctrl.actions} />
          <WagerInput
            visible={ctrl.wager.visible}
            display={ctrl.wager.display}
            placeholder={ctrl.wager.placeholder}
            editable={ctrl.permissions.canWager}
            onChangeText={ctrl.handleBetInputChange}
            onBlur={ctrl.normalizeBetInput}
            onSubmitEditing={ctrl.normalizeBetInput}
            style={actionBarStyles.sizingWagerInputWrap}
          />
        </View>
        <ActionButtons
          checkCallLabel={ctrl.checkCallLabel}
          permissions={ctrl.permissions}
          actions={ctrl.actions}
          wager={ctrl.wager}
          compact={isMobile}
        />
      </View>
      {ctrl.showReconnectingOverlay && !hideReconnectingOverlay ? (
        <View
          pointerEvents="auto"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
            style={{ color: "#fff", fontWeight: "700" }}
          >
            {TABLE.reconnecting}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
