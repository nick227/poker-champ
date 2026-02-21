import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/base/Text";
import type { HistoryOverview } from "@/services/history.service";

type Span = "half" | "third" | "full";

const SPAN_CLASS: Record<Span, string> = {
  half: "col-span-3",
  third: "col-span-2",
  full: "col-span-6",
};

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
      <View className="ui-grid grid-cols-6 gap-3">
        {children}
      </View>
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
    <View className={`ui-surface p-4 rounded-lg ${SPAN_CLASS[span]}`}>
      <Text variant="muted" className="text-xs">
        {label}
      </Text>
      <Text variant="h2" className={valueClass}>
        {value}
      </Text>
    </View>
  );
}

export function HistoryOverviewTab({ overview }: { overview: HistoryOverview | null }) {
  const formatCents = (cents = 0) => (cents / 100).toFixed(2);
  const formatPct = (value = 0) => `${value.toFixed(1)}%`;

  const profitFactorValue =
    overview?.profitFactor == null
      ? "-"
      : Number.isFinite(overview.profitFactor)
        ? overview.profitFactor.toFixed(2)
        : "-";

  const profitFactorClass =
    overview?.profitFactor == null
      ? undefined
      : overview.profitFactor >= 1
        ? "text-green-500"
        : "text-red-500";

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 96, gap: 16 }}
    >
      <Section title="Volume">
        <MosaicStat label="Total Hands" value={overview?.totalHands ?? 0} span="full" />
        <MosaicStat label="Winning Hands" value={overview?.winningHands ?? 0} span="third" />
        <MosaicStat label="Losing Hands" value={overview?.losingHands ?? 0} span="third" />
        <MosaicStat label="Break Even Hands" value={overview?.breakEvenHands ?? 0} span="third" />
      </Section>

      <Section title="Profitability">
        <MosaicStat
          label="Net Profit"
          value={`$${formatCents(overview?.totalProfitCents ?? 0)}`}
          span="half"
          valueClass={(overview?.totalProfitCents ?? 0) >= 0 ? "text-green-500" : "text-red-500"}
        />
        <MosaicStat
          label="Avg Profit / Hand"
          value={`$${formatCents(overview?.avgProfitPerHandCents ?? 0)}`}
          span="half"
          valueClass={(overview?.avgProfitPerHandCents ?? 0) >= 0 ? "text-green-500" : "text-red-500"}
        />
        <MosaicStat label="BB / 100" value={(overview?.bbPer100 ?? 0).toFixed(1)} span="third" />
        <MosaicStat label="Win Rate" value={formatPct(overview?.winRate ?? 0)} span="third" />
        <MosaicStat label="Profit Factor" value={profitFactorValue} span="third" valueClass={profitFactorClass} />
      </Section>

      <Section title="Preflop Tendencies">
        <MosaicStat
          label="VPIP"
          value={`${formatPct(overview?.vpipPct ?? 0)} (${overview?.vpipHands ?? 0})`}
          span="third"
        />
        <MosaicStat
          label="PFR"
          value={`${formatPct(overview?.pfrPct ?? 0)} (${overview?.pfrHands ?? 0})`}
          span="third"
        />
        <MosaicStat
          label="3-Bet"
          value={`${formatPct(overview?.threeBetPct ?? 0)} (${overview?.threeBetHands ?? 0}/${overview?.threeBetOpportunities ?? 0})`}
          span="third"
        />
        <MosaicStat
          label="Fold to 3-Bet"
          value={`${formatPct(overview?.foldToThreeBetPct ?? 0)} (${overview?.foldToThreeBetHands ?? 0}/${overview?.foldToThreeBetOpportunities ?? 0})`}
          span="half"
        />
        <MosaicStat
          label="Steal Attempt"
          value={`${formatPct(overview?.stealAttemptPct ?? 0)} (${overview?.stealAttempts ?? 0}/${overview?.stealOpportunities ?? 0})`}
          span="half"
        />
        <MosaicStat
          label="Fold BB to Steal"
          value={`${formatPct(overview?.foldBbToStealPct ?? 0)} (${overview?.foldBbToStealHands ?? 0}/${overview?.foldBbToStealOpportunities ?? 0})`}
          span="full"
        />
      </Section>

      <Section title="Hand Outcomes">
        <MosaicStat
          label="Showdown Rate"
          value={`${formatPct(overview?.showdownRate ?? 0)} (${overview?.showdownHands ?? 0})`}
          span="half"
        />
        <MosaicStat
          label="Avg Pot"
          value={`$${formatCents(overview?.avgPotCents ?? 0)}`}
          span="half"
        />
        <MosaicStat
          label="Gross Won"
          value={`$${formatCents(overview?.grossWonCents ?? 0)}`}
          span="third"
          valueClass="text-green-500"
        />
        <MosaicStat
          label="Gross Lost"
          value={`$${formatCents(overview?.grossLostCents ?? 0)}`}
          span="third"
          valueClass="text-red-500"
        />
        <MosaicStat
          label="Biggest Pot"
          value={`$${formatCents(overview?.biggestPotCents ?? 0)}`}
          span="third"
        />
        <MosaicStat
          label="Biggest Win"
          value={`$${formatCents(overview?.biggestWinCents ?? 0)}`}
          span="half"
          valueClass="text-green-500"
        />
        <MosaicStat
          label="Biggest Loss"
          value={`$${formatCents(overview?.biggestLossCents ?? 0)}`}
          span="half"
          valueClass={(overview?.biggestLossCents ?? 0) < 0 ? "text-red-500" : undefined}
        />
      </Section>
    </ScrollView>
  );
}
