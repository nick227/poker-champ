import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { PlayingCard } from "../PlayingCard";
import { CalculationsStrip } from "../CalculationsStrip";
import { PlayerPanel } from "../player-panel";
import { TABLE } from "@/constants/copy";
import type { HeroStatus, UiCard } from "../table.adapter";
import { assertNever } from "../table.adapter";
import { PotWinRing } from "../PotWinEffect";
import { hasHeroCalculations } from "../table.utils";
import { HERO_ZONE_HEIGHT } from "../constants/table-layout.constants";
import { CARDS } from "./layout";
import { useTableLayoutHeight } from "../table-layout";
import { heroZoneStyles as s } from "./styles";
import { usePreferencesStore } from "@/stores/preferences.store";
import { useTableMoneyDisplay } from "@/features/table/context/TableMoneyDisplayContext";


export type HeroZoneProps = {
  cards: UiCard[];
  stackCents: number;
  canAct: boolean;
  heroStatus: HeroStatus;
  equity?: number;
  potOdds?: number;
  outs?: number;
  playerStats?: { hands?: number; vpipPct?: number; pfrPct?: number };
  isWinner?: boolean;
  isDealer?: boolean;
  isActiveTurn?: boolean;
  turnCountdownSeconds?: number;
  userName?: string;
  avatarUrl?: string | null;
  onAvatarPress?: () => void;
  showStats?: boolean;
  potCents?: number;
  onToggleSittingOut?: () => void;
  roundBetCents?: number;
  /** Override height when viewport is small. */
  height?: number;
  /** Stable hero identity (snapshot.hero.userId) for deterministic avatar color; falls back to userName. */
  userId?: string;
  /** Hero's seat number — shown as the avatar badge placeholder (see report: no real rank/tier data exists yet). */
  seat?: number;
};

function isInactive(status: HeroStatus): boolean {
  switch (status) {
    case "ACTIVE":
    case "ALL_IN":
      return false;
    case "FOLDED":
    case "SITTING_OUT":
    case "RECONNECTING":
      return true;
    default:
      return assertNever(status);
  }
}

function getStatusLabel(status: HeroStatus): string | null {
  switch (status) {
    case "ACTIVE":
    case "ALL_IN":
      return null;
    case "FOLDED":
      return TABLE.fold;
    case "SITTING_OUT":
      return TABLE.sittingOut;
    case "RECONNECTING":
      return TABLE.reconnecting;
    default:
      return assertNever(status);
  }
}

const HERO_CARD_KEYS = ["left", "right"] as const;

export function HeroZone({
  cards,
  stackCents,
  canAct,
  heroStatus,
  equity,
  potOdds,
  outs,
  playerStats,
  isWinner = false,
  isDealer = false,
  isActiveTurn = false,
  turnCountdownSeconds,
  userName,
  avatarUrl,
  onAvatarPress,
  potCents = 0,
  showStats = false,
  onToggleSittingOut,
  roundBetCents = 0,
  height: heightProp,
  userId,
  seat,
}: HeroZoneProps) {
  const { formatStack, formatBet } = useTableMoneyDisplay();
  const cardFacePackId = usePreferencesStore((state) => state.cardFacePackId);
  const layoutHeight = useTableLayoutHeight();
  const zoneHeight =
    heightProp ?? layoutHeight?.heroZoneHeight ?? HERO_ZONE_HEIGHT;
  const layoutScale = layoutHeight?.layoutScale ?? 1;
  const scaledCardRowHeight = Math.round(CARDS.ROW_HEIGHT * layoutScale);
  const scaledHoleCardsPadding = Math.round(CARDS.HOLE_CARDS_COL_PADDING_VERTICAL * layoutScale);
  const folded = heroStatus === "FOLDED";
  const inactive = isInactive(heroStatus);
  const statusLabel = getStatusLabel(heroStatus);
  const betDisplay = roundBetCents > 0 ? formatBet(roundBetCents) : undefined;
  const isSittingOut = heroStatus === "SITTING_OUT";
  const sitOutDisabled =
    heroStatus === "RECONNECTING" ||
    !onToggleSittingOut ||
    (isSittingOut && stackCents <= 0);
  const hasCalculations = hasHeroCalculations({ equity, potOdds, outs });
  const calcMuted = !canAct || !hasCalculations;
  const hasExtraBelowRow =
    isSittingOut ||
    (typeof turnCountdownSeconds === "number" && turnCountdownSeconds > 0 && isActiveTurn);

  const content = (
    <View
      collapsable={false}
      className="hero-container flex-shrink-0 py-2"
      style={[
        isActiveTurn && s.activeTurn,
        { minHeight: zoneHeight },
      ]}
    >
      {isWinner ? <PotWinRing radius={0} /> : null}
      <View
        className={`ui-row ${inactive ? "opacity-55" : ""}`}
        style={[s.mainRow, { height: zoneHeight }]}
      >
        <View
          className="ui-col ui-center rounded-sm border border-border-subtle bg-panel/80 px-4 flex-1"
          style={[s.holeCardsCol, { paddingVertical: scaledHoleCardsPadding }]}
        >
          <View
            className="ui-row ui-center"
            style={[s.cardRow, { height: scaledCardRowHeight }]}
          >
            {cards.map((c, i) => {
              const key = HERO_CARD_KEYS[i] ?? `card-${i}`;
              return (
                <View key={key} style={{ transform: [{ scale: layoutScale }] }}>
                  {c ? (
                    <PlayingCard rank={c.rank} suit={c.suit} packId={cardFacePackId} />
                  ) : (
                    <PlayingCard faceDown />
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <PlayerPanel
          initial={userName?.slice(0, 1).toUpperCase() ?? "?"}
          playerName={userName ?? ""}
          stackCents={stackCents}
          stackDisplay={formatStack(stackCents)}
          avatarUrl={avatarUrl}
          isDealer={isDealer}
          bottomText={statusLabel ?? undefined}
          onAvatarPress={onAvatarPress}
          testID="hero-stack"
          dataStackCents={String(stackCents)}
          dataPlayerName={userName ?? ""}
          colorSeed={userId || userName}
          isActiveTurn={isActiveTurn}
          badgeLabel={seat}
          betCents={roundBetCents}
          betDisplay={betDisplay}
        />

        {showStats ? (
          <View style={s.calcCol}>
            <CalculationsStrip
              equity={equity}
              vpipPct={playerStats?.vpipPct}
              pfrPct={playerStats?.pfrPct}
              statsHands={playerStats?.hands}
              visible={true}
              muted={calcMuted}
              direction="column"
            />
          </View>
        ) : null}
      </View>

      {isActiveTurn && typeof turnCountdownSeconds === "number" && turnCountdownSeconds > 0 ? (
          <View className="p-2">
            <Text variant="label" className="text-warning text-xl" allowFontScaling={false}>
              {turnCountdownSeconds}s to act
            </Text>
          </View>
        ) : null}

    </View>
  );

  return content;
}
