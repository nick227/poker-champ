import { memo } from "react";
import { Pressable, View } from "react-native";
import { DealerButton } from "../DealerButton";
import { PotWinRing } from "../PotWinEffect";
import { PlayerPanel } from "../player-panel";
import { opponentStripStyles as s, PRESSABLE_ANDROID_RIPPLE, PRESSABLE_HIT_SLOP } from "../opponent-strip/styles";

/** Isolated so progress tick (every 100ms) only re-renders the bar, not the whole tile. */
const TurnBar = memo(function TurnBar({
  show,
  progress,
}: {
  show: boolean;
  progress: number | null | undefined;
}) {
  if (!show || progress == null) return null;
  return (
    <View style={s.turnBarTrack} pointerEvents="none">
      <View style={[s.turnBarFill, { width: `${progress * 100}%` }]} />
    </View>
  );
});

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
  /** When true, outer wrapper fills slot (use rowPressableFillSlot). */
  fillSlot?: boolean;
};

export function OpponentStripItemView({
  model,
  onPress,
  fillSlot = false,
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
      {isDealer ? (
        <View style={[s.dealerSlotTile, { pointerEvents: "none" }]}>
          <DealerButton size="small" />
        </View>
      ) : null}
      <View style={s.opponentItemWrapper} collapsable={false}>
        <PlayerPanel
          initial={initial}
          playerName={nameDisplay}
          stackCents={stackCents}
          avatarUrl={avatarUrl}
          isDealer={false}
          bottomText={actionText}
          bottomTextClassName={actionTextClassName}
          inactive={inactive}
          bottomAlign="left"
          nameTopMargin={8}
          style={{ flex: 1 }}
          dataStackCents={String(stackCents)}
          dataPlayerName={opponentName}
        />
        <View style={s.cardsColumn} collapsable={false}>
          <View style={s.cardsDock}>{cardsSlot}</View>
        </View>
      </View>
      <TurnBar show={showTurnBar} progress={activeTurnProgress} />
    </View>
  );

  const content = (
    <>
      {isWinner ? <PotWinRing /> : null}
      {tile}
    </>
  );

  const outerStyle = fillSlot ? s.rowPressableFillSlot : s.rowPressable;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={PRESSABLE_HIT_SLOP}
        android_ripple={PRESSABLE_ANDROID_RIPPLE}
        className="ui-touch"
        style={outerStyle}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={outerStyle}>{content}</View>;
}
