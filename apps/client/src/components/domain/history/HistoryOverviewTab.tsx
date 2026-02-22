import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/base/Text";
import type { HistoryOverview } from "@/services/history.service";

import { SECTION_SHAPE } from "./sectionShape";
import type { TileShape } from "./sectionShape";

import { SPAN_STYLE, type Span } from "./layout";
import {
  fmtMoneyFromCents,
  fmtPct,
  fmtRatioPct,
  fmtLossDisplayFromCents,
  safeNum,
} from "./formatters";
import { Skeleton } from "./Skeleton";

/* =========================
   Constants
========================= */

const CONTENT_STYLE = {
  padding: 16,
  paddingBottom: 96,
  gap: 16,
};

/* =========================
   Layout Components
========================= */

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View className="ui-stack-2">
      <Text variant="muted" className="text-xs uppercase tracking-wide px-1">
        {title}
      </Text>
      <View className="flex-row flex-wrap -mx-1">{children}</View>
    </View>
  );
}

function MosaicStat({
  label,
  value,
  span = "half",
  valueClass,
}: {
  label: string;
  value: string | number;
  span?: Span;
  valueClass?: string;
}) {
  return (
    <View style={SPAN_STYLE[span]} className="px-1 mb-2">
      <View className="ui-surface p-4 rounded-lg h-full">
        <Text variant="muted" className="text-xs">
          {label}
        </Text>
        <Text variant="h2" className={valueClass}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function MosaicStatSkeleton({ span = "half" }: { span?: Span }) {
  return (
    <View style={SPAN_STYLE[span]} className="px-1 mb-2">
      <View className="ui-surface p-4 rounded-lg h-full space-y-2">
        <Skeleton height={12} width="60%" />
        <Skeleton height={28} width="40%" rounded="rounded-lg" />
      </View>
    </View>
  );
}

/* =========================
   Tile Binding
========================= */

type TileSpec = TileShape & {
  value: (o: HistoryOverview) => string | number;
  valueClass?: (o: HistoryOverview) => string | undefined;
};

type SectionSpec = { title: string; tiles: TileSpec[] };

function assertNever(x: never): never {
  throw new Error(`Unhandled tile key: ${x}`);
}

function buildSections(): SectionSpec[] {
  const bindTile = (tile: TileShape): TileSpec => {
    switch (tile.key) {
      /* ---------- Volume ---------- */

      case "totalHands":
        return { ...tile, value: o => o.totalHands };

      case "winningHands":
        return { ...tile, value: o => o.winningHands };

      case "losingHands":
        return { ...tile, value: o => o.losingHands };

      case "breakEvenHands":
        return { ...tile, value: o => o.breakEvenHands };

      /* ---------- Profitability ---------- */

      case "netProfit":
        return {
          ...tile,
          value: o => fmtMoneyFromCents(o.totalProfitCents),
          valueClass: o =>
            o.totalProfitCents >= 0 ? "text-green-500" : "text-red-500",
        };

      case "avgProfitHand":
        return {
          ...tile,
          value: o => fmtMoneyFromCents(o.avgProfitPerHandCents),
          valueClass: o =>
            o.avgProfitPerHandCents >= 0
              ? "text-green-500"
              : "text-red-500",
        };

      case "bbPer100":
        return {
          ...tile,
          value: o => safeNum(o.bbPer100).toFixed(1),
        };

      case "winRate":
        return { ...tile, value: o => fmtPct(o.winRate) };

      case "profitFactor":
        return {
          ...tile,
          value: o =>
            o.profitFactor == null ? "N/A" : o.profitFactor.toFixed(2),
          valueClass: o =>
            o.profitFactor == null
              ? undefined
              : o.profitFactor >= 1
              ? "text-green-500"
              : "text-red-500",
        };

      /* ---------- Preflop ---------- */

      case "vpip":
        return {
          ...tile,
          value: o => fmtRatioPct(o.vpipPct, o.vpipHands, o.totalHands),
        };

      case "pfr":
        return {
          ...tile,
          value: o => fmtRatioPct(o.pfrPct, o.pfrHands, o.totalHands),
        };

      case "threeBet":
        return {
          ...tile,
          value: o =>
            fmtRatioPct(
              o.threeBetPct,
              o.threeBetHands,
              o.threeBetOpportunities
            ),
        };

      case "foldTo3bet":
        return {
          ...tile,
          value: o =>
            fmtRatioPct(
              o.foldToThreeBetPct,
              o.foldToThreeBetHands,
              o.foldToThreeBetOpportunities
            ),
        };

      case "steal":
        return {
          ...tile,
          value: o =>
            fmtRatioPct(
              o.stealAttemptPct,
              o.stealAttempts,
              o.stealOpportunities
            ),
        };

      case "foldBbToSteal":
        return {
          ...tile,
          value: o =>
            fmtRatioPct(
              o.foldBbToStealPct,
              o.foldBbToStealHands,
              o.foldBbToStealOpportunities
            ),
        };

      /* ---------- Outcomes ---------- */

      case "showdownRate":
        return {
          ...tile,
          value: o =>
            `${fmtPct(o.showdownRate)} (${o.showdownHands})`,
        };

      case "avgPot":
        return { ...tile, value: o => fmtMoneyFromCents(o.avgPotCents) };

      case "grossWon":
        return {
          ...tile,
          value: o => fmtMoneyFromCents(o.grossWonCents),
          valueClass: () => "text-green-500",
        };

      case "grossLost":
        return {
          ...tile,
          value: o => {
            const r = fmtLossDisplayFromCents(o.grossLostCents);
            return r.text;
          },
          valueClass: o =>
            fmtLossDisplayFromCents(o.grossLostCents).className,
        };

      case "biggestPot":
        return {
          ...tile,
          value: o => fmtMoneyFromCents(o.biggestPotCents),
        };

      case "biggestWin":
        return {
          ...tile,
          value: o => fmtMoneyFromCents(o.biggestWinCents),
          valueClass: () => "text-green-500",
        };

      case "biggestLoss":
        return {
          ...tile,
          value: o => {
            const r = fmtLossDisplayFromCents(o.biggestLossCents);
            return r.text;
          },
          valueClass: o =>
            fmtLossDisplayFromCents(o.biggestLossCents).className,
        };

      default:
        return assertNever(tile.key);
    }
  };

  return SECTION_SHAPE.map(section => ({
    title: section.title,
    tiles: section.tiles.map(bindTile),
  }));
}

/* =========================
   Main Component
========================= */

export function HistoryOverviewTab({
  overview,
}: {
  overview: HistoryOverview | null;
}) {
  if (!overview) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={CONTENT_STYLE}>
        {SECTION_SHAPE.map(section => (
          <Section key={section.title} title={section.title}>
            {section.tiles.map(tile => (
              <MosaicStatSkeleton
                key={tile.key}
                span={tile.span}
              />
            ))}
          </Section>
        ))}
      </ScrollView>
    );
  }

  const sections = buildSections();

  return (
    <ScrollView className="flex-1" contentContainerStyle={CONTENT_STYLE}>
      {sections.map(section => (
        <Section key={section.title} title={section.title}>
          {section.tiles.map(tile => (
            <MosaicStat
              key={tile.key}
              label={tile.label}
              value={tile.value(overview)}
              span={tile.span}
              valueClass={tile.valueClass?.(overview)}
            />
          ))}
        </Section>
      ))}
    </ScrollView>
  );
}
