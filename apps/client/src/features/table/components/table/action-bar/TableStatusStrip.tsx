import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/base/Text";
import { HUD_STATUS } from "../tokens/hud.tokens";

export type TableStatusStripProps = {
  message: string;
  showSpinner?: boolean;
  showTurnCue?: boolean;
};

export function TableStatusStrip({
  message,
  showSpinner = false,
  showTurnCue = false,
}: TableStatusStripProps) {
  const displayMessage = message.trim().length > 0 ? message.toUpperCase() : " ";

  return (
    <View
      testID="table-status-strip"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 26,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: HUD_STATUS.bg,
        borderWidth: 1,
        borderColor: showTurnCue ? HUD_STATUS.turnBorder : HUD_STATUS.border,
      }}
    >
      {showSpinner ? (
        <ActivityIndicator
          testID="table-status-strip-spinner"
          size="small"
          color={HUD_STATUS.text}
          style={{ marginRight: 8 }}
        />
      ) : null}
      <Text
        testID="table-status-strip-text"
        allowFontScaling={false}
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          flexShrink: 1,
          minWidth: 0,
          textAlign: "center",
          letterSpacing: 0.8,
          fontSize: 12,
          fontWeight: "700",
          color: HUD_STATUS.text,
        }}
      >
        {displayMessage}
      </Text>
    </View>
  );
}
