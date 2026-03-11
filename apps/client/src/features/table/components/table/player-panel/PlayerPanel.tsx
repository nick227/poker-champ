import { View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { DealerButton } from "../DealerButton";
import { formatCents } from "@/lib/format";
import { playerPanelStyles as s } from "./styles";

export type PlayerPanelProps = {
  initial: string;
  playerName: string;
  stackCents: number;
  avatarUrl?: string | null;
  isDealer?: boolean;
  /** Shown in the lower area of the panel (e.g. status, action message). */
  bottomText?: string;
  bottomTextClassName?: string;
  /** Alignment of bottom text row; default center (hero), left/right for variants. */
  bottomAlign?: "center" | "left" | "right";
  onAvatarPress?: () => void;
  inactive?: boolean;
  style?: ViewStyle;
  /** Optional extra top margin for the name row (e.g. to clear dealer button). */
  nameTopMargin?: number;
  /** Optional test/data attributes */
  testID?: string;
  dataStackCents?: string;
  dataPlayerName?: string;
};

export function PlayerPanel({
  initial,
  playerName,
  stackCents,
  avatarUrl,
  isDealer = false,
  bottomText,
  bottomTextClassName,
  bottomAlign = "center",
  onAvatarPress,
  inactive = false,
  style,
  testID,
  dataStackCents,
  dataPlayerName,
  nameTopMargin,
}: PlayerPanelProps) {

  return (
    <View
      className={`ui-row rounded-sm border border-border-subtle bg-panel/80 p-4 ${inactive ? "opacity-55" : ""}`}
      style={[s.panel, style]}
      data-testid={testID ?? "player-panel"}
      data-stack-cents={dataStackCents ?? String(stackCents)}
      data-hero-name={dataPlayerName ?? playerName}
    >
      {isDealer ? (
        <View style={[s.dealerSlot, { pointerEvents: "none" }]}>
          <DealerButton size="small" />
        </View>
      ) : null}
      <View style={s.identityRow}>
        <AvatarImage
          avatarUrl={avatarUrl}
          initial={initial}
          onPress={onAvatarPress}
          style={s.avatar}
          imageStyle={s.avatarImage}
          className="bg-panel-elevated border border-border"
        />
        <View style={s.nameStackCol} className="flex-1">
          {playerName ? (
            <View style={[s.nameTextWrap, { marginTop: nameTopMargin ?? 0 }]}>
              <Text
                variant="label"
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-left"
                allowFontScaling={false}
              >
                {playerName}
              </Text>
            </View>
          ) : null}
          <Text
            variant="h2"
            className="text-2xl font-semibold"
            allowFontScaling={false}
          >
            {formatCents(stackCents)}
          </Text>
          {bottomText != null && bottomText !== "" ? (
            <View style={s.bottomRow}>
              <Text
                variant="muted"
                numberOfLines={2}
                ellipsizeMode="tail"
                className={bottomTextClassName}
                allowFontScaling={false}
                style={s.bottomText}
              >
                {bottomText}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
