import { View, type ViewStyle } from "react-native";
import { Text } from "@/components/base/Text";
import { DealerButton } from "../DealerButton";
import { formatCents } from "@/lib/format";
import { AvatarDisc } from "./AvatarDisc";
import { ChipStack } from "./ChipStack";
import { playerPanelStyles as s } from "./styles";
import { AVATAR } from "./layout";

export type PlayerPanelProps = {
  initial: string;
  playerName: string;
  stackCents: number;
  /** When set, shown instead of formatCents(stackCents) (tournament chips/BB). */
  stackDisplay?: string;
  avatarUrl?: string | null;
  isDealer?: boolean;
  /** Shown in the lower area of the panel (e.g. status, action message). Ignored when betCents > 0 (chip stack wins). */
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
  /** Optional overlay slot for hero/opponent hole cards, positioned over the avatar. */
  holeCardsSlot?: React.ReactNode;
  /** Stable identity seed (userId, falling back to playerName) for deterministic avatar color. */
  colorSeed?: string;
  /** True while it's this seat's turn to act — drives the avatar ring/glow. */
  isActiveTurn?: boolean;
  /** Placeholder status/tier badge overlapping the avatar (e.g. seat number — see report: no real rank data exists yet). */
  badgeLabel?: string | number;
  /** Current round bet in cents; when > 0, renders a chip-stack visual instead of bottomText. */
  betCents?: number;
  /** Pre-formatted bet amount (BB mode, currency, etc.) shown next to the chip stack. */
  betDisplay?: string;
};

export function PlayerPanel({
  initial,
  playerName,
  stackCents,
  stackDisplay,
  avatarUrl,
  isDealer = false,
  bottomText,
  bottomTextClassName,
  onAvatarPress,
  inactive = false,
  style,
  testID,
  dataStackCents,
  dataPlayerName,
  nameTopMargin,
  holeCardsSlot,
  colorSeed,
  isActiveTurn = false,
  badgeLabel,
  betCents = 0,
  betDisplay,
}: PlayerPanelProps) {
  const showChipStack = betCents > 0 && betDisplay != null;

  return (
    <View
      className={`ui-row border border-border-subtle bg-panel/80 p-4 ${inactive ? "opacity-55" : ""} ${isActiveTurn ? "border-gold/70" : ""}`}
      style={[s.panel, isActiveTurn && s.panelActive, style]}
      data-testid={testID ?? "player-panel"}
      data-stack-cents={dataStackCents ?? String(stackCents)}
      data-hero-name={dataPlayerName ?? playerName}
    >
      {isDealer ? (
        <View style={[s.dealerSlot, { pointerEvents: "none" }]}>
          <DealerButton size="small" />
        </View>
      ) : null}
      <View className="flex-1 identity-row" style={s.identityRow}>
        <View style={s.avatarWrapper}>
          <AvatarDisc
            seed={colorSeed || playerName}
            initial={initial}
            avatarUrl={avatarUrl}
            size={AVATAR.SIZE}
            isActiveTurn={isActiveTurn}
            onPress={onAvatarPress}
            badgeLabel={badgeLabel}
            testID={testID ? `${testID}-avatar` : "player-panel-avatar"}
          />
          {holeCardsSlot ? (
            <View pointerEvents="none" style={s.holeCardsOverlay}>
              <View style={s.holeCardsContent}>{holeCardsSlot}</View>
            </View>
          ) : null}
        </View>
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
            {stackDisplay ?? formatCents(stackCents)}
          </Text>
          {showChipStack ? (
            <View style={s.bottomRow}>
              <ChipStack cents={betCents} label={betDisplay as string} testID={testID ? `${testID}-chip-stack` : undefined} />
            </View>
          ) : bottomText != null && bottomText !== "" ? (
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
