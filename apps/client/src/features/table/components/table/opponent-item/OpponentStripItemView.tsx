import { Pressable, View } from "react-native";
import { Text } from "@/components/base/Text";
import { AvatarImage } from "@/components/base/AvatarImage";
import { DealerButton } from "../DealerButton";
import { PotWinRing } from "../PotWinEffect";
import { opponentStripStyles as s, PRESSABLE_ANDROID_RIPPLE, PRESSABLE_HIT_SLOP } from "../opponent-strip/styles";

export type OpponentStripItemViewModel = {
  opponentId: string;
  opponentName: string;
  stackCents: number;
  avatarUrl: string | undefined;
  initial: string;
  nameDisplay: string;
  isDealer: boolean | undefined;
  isActive: boolean | undefined;
  inactive: boolean;
  stackFormatted: string;
  actionText: string;
  actionTextClassName: string | undefined;
  isWinner: boolean;
  showTurnBar: boolean;
  activeTurnProgress: number | null | undefined;
  cardsSlot: React.ReactNode;
};

export type OpponentStripItemViewProps = {
  model: OpponentStripItemViewModel;
  onPress: (() => void) | undefined;
};

export function OpponentStripItemView({
  model,
  onPress,
}: OpponentStripItemViewProps) {
  const {
    opponentId,
    opponentName,
    stackCents,
    avatarUrl,
    initial,
    nameDisplay,
    isDealer,
    isActive,
    inactive,
    stackFormatted,
    actionText,
    actionTextClassName,
    isWinner,
    showTurnBar,
    activeTurnProgress,
    cardsSlot,
  } = model;
  const tile = (
    <View
      collapsable={false}
      className={`opponent-item-container w-full border-border-subtle ${isActive ? "bg-dark-green-500" : "bg-panel"} ${inactive ? "opacity-50" : ""}`}
      style={[s.rowShell, isActive && s.rowShellActive]}
      data-testid="opponent-tile"
      data-opponent-id={opponentId}
      data-opponent-name={opponentName}
      data-stack-cents={String(stackCents)}
    >
      <View className="content-row" style={s.contentRow}>
        <View style={s.topRow}>
          <View className="opponent-avatar" style={s.avatarCol}>
            <AvatarImage
              avatarUrl={avatarUrl}
              initial={initial}
              style={s.avatar}
              imageStyle={s.avatarImage}
              className="bg-panel-elevated border border-border"
            />
          </View>
          <View className="opponent-meta" style={s.metaCol}>
            <View className="ui-row" style={s.nameRow}>
              <Text
                variant="label"
                className="font-semibold"
                numberOfLines={1}
                ellipsizeMode="tail"
                allowFontScaling={false}
                style={s.nameText}
              >
                {nameDisplay}
              </Text>
            </View>
            <View style={s.stackRow}>
              <Text numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false} style={s.stackText}>
                {stackFormatted}
              </Text>
            </View>
          </View>
        </View>
        <View style={s.cardsDock}>{cardsSlot}</View>
        <View style={s.footerRow}>
          <Text
            variant="muted"
            numberOfLines={2}
            ellipsizeMode="tail"
            className={actionTextClassName}
            allowFontScaling={false}
            style={s.actionText}
          >
            {actionText}
          </Text>
          <View style={s.dealerDock}>
            {isDealer ? <DealerButton size="small" /> : null}
          </View>
        </View>
      </View>
      {showTurnBar && activeTurnProgress != null ? (
        <View style={s.turnBarTrack}>
          <View style={[s.turnBarFill, { width: `${activeTurnProgress * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );

  const content = (
    <>
      {isWinner ? <PotWinRing /> : null}
      {tile}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={PRESSABLE_HIT_SLOP}
        android_ripple={PRESSABLE_ANDROID_RIPPLE}
        className="ui-touch"
        style={s.rowPressable}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={s.rowPressable}>{content}</View>;
}
