import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/base/Text";

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
        borderWidth: showTurnCue ? 1 : 0,
        borderColor: showTurnCue ? "#d4af37" : "transparent",
        shadowColor: "#d4af37",
        shadowOpacity: showTurnCue ? 0.25 : 0,
        shadowRadius: showTurnCue ? 8 : 0,
        shadowOffset: { width: 0, height: 0 },
      }}
      className="ui-row items-center justify-center bg-panel/90 rounded-sm px-3 py-1 min-h-[33px]"
    >
      {showSpinner ? (
        <ActivityIndicator
          testID="table-status-strip-spinner"
          size="small"
          className="mr-2 opacity-70"
        />
      ) : null}
      <Text
        testID="table-status-strip-text"
        variant="label"
        allowFontScaling={false}
        numberOfLines={2}
        ellipsizeMode="tail"
        style={{
          flexShrink: 1,
          minWidth: 0,
          textAlign: "center",
          letterSpacing: 1,
          fontSize: 16,
        }}
        className="text-left"
      >
        {displayMessage}
      </Text>
    </View>
  );
}
