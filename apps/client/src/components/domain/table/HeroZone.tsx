import { View } from "react-native";
import { Text } from "@/components/base/Text";
import { PlayingCard } from "./PlayingCard";
import { CalculationsStrip } from "./CalculationsStrip";
import { DealerButton } from "./DealerButton";
import { formatCents } from "@/lib/format";
import { TABLE } from "@/constants/copy";
import type { HeroStatus, UiCard } from "./table.adapter";
import { assertNever } from "./table.adapter";
import { PotWinRing } from "./PotWinEffect";
import { hasHeroCalculations } from "./table.utils";
import { HERO_ZONE_HEIGHT } from "./constants/tableLayout.constants";
import { useTableLayoutHeight } from "./TableLayoutHeightContext";
import { heroZoneStyles as s } from "./heroZone.styles";

export { HERO_ZONE_HEIGHT };

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
  userName?: string;
  showStats?: boolean;
  /** Override height when viewport is small. */
  height?: number;
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
  userName,
  showStats = true,
  height: heightProp,
}: HeroZoneProps) {
  const layoutHeight = useTableLayoutHeight();
  const zoneHeight =
    heightProp ?? layoutHeight?.heroZoneHeight ?? HERO_ZONE_HEIGHT;
  const folded = heroStatus === "FOLDED";
  const inactive = isInactive(heroStatus);
  const statusLabel = getStatusLabel(heroStatus);
  const hasCalculations = hasHeroCalculations({ equity, potOdds, outs });
  // Keep calc strip visually persistent so Hero cards never shift between states.
  const calculationsVisible = showStats;
  const calcMuted = !canAct || !hasCalculations;

  // Core hero panel content. This is optionally wrapped with a win-ring below.
  const content = (
    <View
      collapsable={false}
      className="hero-container flex-shrink-0"
      style={[s.root, isActiveTurn && s.activeTurn, { height: zoneHeight, padding: 16, gap: 16 }]}
    >
      {/* Top rail: calculation stats (always rendered to preserve layout height). */}
      <View style={s.calcStrip}>
        <CalculationsStrip
          equity={equity}
          vpipPct={playerStats?.vpipPct}
          pfrPct={playerStats?.pfrPct}
          statsHands={playerStats?.hands}
          visible={calculationsVisible}
          muted={calcMuted}
        />
      </View>

      {/* Main row: hero cards + stack summary (+ optional dealer button). */}
      <View className={`ui-row ${inactive ? "opacity-55" : ""}`} style={s.mainRow}>
        {/* Left card: status label + two hero hole cards. */}
        <View className="ui-col ui-center rounded-lg border border-border-subtle bg-panel/80 px-3 py-4" style={s.holeCardsCol}>
          <View className="ui-row ui-center" style={s.cardRow}>
            {cards.map((c, i) => {
              const key = HERO_CARD_KEYS[i] ?? `card-${i}`;
              return c ? (
                <PlayingCard key={key} rank={c.rank} suit={c.suit} />
              ) : (
                <PlayingCard key={key} faceDown />
              );
            })}
          </View>
        </View>

        {/* Center card: player identity and stack amount. */}
        <View
          className="ui-col ui-center justify-center rounded-lg border border-border-subtle bg-panel/80 px-4 py-2 min-w-[88px]"
          style={s.stackCol}
          data-testid="hero-stack"
          data-stack-cents={String(stackCents)}
          data-hero-name={userName ?? ""}
        >
          {userName ? (
            <Text variant="label" numberOfLines={1} className="text-center" allowFontScaling={false}>{userName}</Text>
          ) : null}
          <Text variant="h2" className="text-2xl font-semibold" allowFontScaling={false}>{formatCents(stackCents)}</Text>
        </View>

        {/* Right slot: dealer indicator when hero has the button. */}
        {isDealer ? (
          <View style={s.dealerSlot}>
            <DealerButton size="small" />
          </View>
        ) : null}

        {/* Right slot: game status. */}
        <View className="ui-row ui-center" style={s.holeCardsHeader}>
          <Text variant={folded ? "danger" : "muted"} className="text-xs" allowFontScaling={false}>
            {statusLabel ?? " "}
          </Text>
        </View>
      </View>
    </View>
  );

  // Winner state: add celebratory ring around the same content tree.
  return isWinner ? <PotWinRing>{content}</PotWinRing> : content;
}
