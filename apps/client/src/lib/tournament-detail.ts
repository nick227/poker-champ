import { formatCents } from "@/lib/format";
import { formatChipCount } from "@/lib/money/table-money";
import { chips } from "@/lib/money/types";

export type PayoutSlot = { place: number; percent: number };

export type BlindLevelRow = {
  level: number;
  smallBlindCents: number;
  bigBlindCents: number;
  durationMinutes: number;
};

const FAST_4MIN_LEVELS: BlindLevelRow[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, durationMinutes: 4 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, durationMinutes: 4 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, durationMinutes: 4 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, durationMinutes: 4 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, durationMinutes: 4 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, durationMinutes: 4 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, durationMinutes: 4 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, durationMinutes: 4 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, durationMinutes: 4 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, durationMinutes: 4 },
  { level: 11, smallBlindCents: 1000, bigBlindCents: 2000, durationMinutes: 4 },
  { level: 12, smallBlindCents: 1500, bigBlindCents: 3000, durationMinutes: 4 },
  { level: 13, smallBlindCents: 2000, bigBlindCents: 4000, durationMinutes: 4 },
  { level: 14, smallBlindCents: 3000, bigBlindCents: 6000, durationMinutes: 4 },
];

const STANDARD_8MIN_LEVELS: BlindLevelRow[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, durationMinutes: 8 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, durationMinutes: 8 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, durationMinutes: 8 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, durationMinutes: 8 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, durationMinutes: 8 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, durationMinutes: 8 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, durationMinutes: 8 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, durationMinutes: 8 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, durationMinutes: 8 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, durationMinutes: 8 },
];

const LONG_12MIN_LEVELS: BlindLevelRow[] = [
  { level: 1, smallBlindCents: 25, bigBlindCents: 50, durationMinutes: 12 },
  { level: 2, smallBlindCents: 50, bigBlindCents: 100, durationMinutes: 12 },
  { level: 3, smallBlindCents: 75, bigBlindCents: 150, durationMinutes: 12 },
  { level: 4, smallBlindCents: 100, bigBlindCents: 200, durationMinutes: 12 },
  { level: 5, smallBlindCents: 150, bigBlindCents: 300, durationMinutes: 12 },
  { level: 6, smallBlindCents: 200, bigBlindCents: 400, durationMinutes: 12 },
  { level: 7, smallBlindCents: 300, bigBlindCents: 600, durationMinutes: 12 },
  { level: 8, smallBlindCents: 400, bigBlindCents: 800, durationMinutes: 12 },
  { level: 9, smallBlindCents: 600, bigBlindCents: 1200, durationMinutes: 12 },
  { level: 10, smallBlindCents: 800, bigBlindCents: 1600, durationMinutes: 12 },
  { level: 11, smallBlindCents: 1000, bigBlindCents: 2000, durationMinutes: 12 },
  { level: 12, smallBlindCents: 1500, bigBlindCents: 3000, durationMinutes: 12 },
];

/** Mirrors server `getPayoutSlots` for display only. */
export function getTournamentPayoutSlots(entrantCount: number): PayoutSlot[] {
  if (entrantCount <= 2) return [{ place: 1, percent: 100 }];
  if (entrantCount === 3) {
    return [
      { place: 1, percent: 70 },
      { place: 2, percent: 30 },
    ];
  }
  return [
    { place: 1, percent: 50 },
    { place: 2, percent: 30 },
    { place: 3, percent: 20 },
  ];
}

export function formatPayoutPlace(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

export function buildPayoutSummaryLines(
  prizePoolCents: number,
  entrantCount: number,
  opts?: { humansOnly?: boolean },
): string[] {
  const count = Math.max(entrantCount, 2);
  const slots = getTournamentPayoutSlots(count);
  let distributed = 0;
  const lines: string[] = [];

  if (opts?.humansOnly) {
    lines.push("Prize pool is funded by human entries only. Bots are not paid.");
  }

  for (const slot of slots) {
    const amount = Math.floor((prizePoolCents * slot.percent) / 100);
    distributed += amount;
    lines.push(`${formatPayoutPlace(slot.place)}: ${formatCents(amount)} (${slot.percent}%)`);
  }

  const remainder = prizePoolCents - distributed;
  if (remainder > 0 && lines.length > 0) {
    lines[0] = `${lines[0]} + ${formatCents(remainder)} to 1st`;
  }

  return lines;
}

export function getBlindLevelsForPreset(blindStructureId: string): BlindLevelRow[] {
  if (blindStructureId === "fast_4min") return FAST_4MIN_LEVELS;
  if (blindStructureId === "standard_8min") return STANDARD_8MIN_LEVELS;
  if (blindStructureId === "long_12min") return LONG_12MIN_LEVELS;
  return [];
}

export function formatBlindLevelRow(row: BlindLevelRow): string {
  return `Level ${row.level}: ${formatChipCount(chips(row.smallBlindCents))} / ${formatChipCount(chips(row.bigBlindCents))} · ${row.durationMinutes}m`;
}

export function formatTournamentStackChips(stackChips: number): string {
  return formatChipCount(chips(stackChips));
}

export function buildBlindSummaryLines(blindStructureId: string, currentLevel: number): string[] {
  const levels = getBlindLevelsForPreset(blindStructureId);
  if (levels.length === 0) return ["Blind structure unavailable"];

  const current = levels.find((l) => l.level === currentLevel) ?? levels[0];
  const preview = levels.slice(0, 5).map(formatBlindLevelRow);
  const lines = [`Current: ${formatBlindLevelRow(current)}`, ...preview];
  if (levels.length > 5) {
    lines.push(`… ${levels.length - 5} more levels (${blindStructureId})`);
  }
  return lines;
}

export type TournamentTimelineStep = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming" | "cancelled";
};

export function buildTournamentTimeline(status: string): TournamentTimelineStep[] {
  const order = ["REGISTERING", "LATE_REG", "STARTING", "RUNNING", "FINISHED"] as const;
  const labels: Record<string, string> = {
    REGISTERING: "Registration open",
    LATE_REG: "Late registration",
    STARTING: "Starting",
    RUNNING: "In progress",
    FINISHED: "Finished",
  };

  if (status === "CANCELLED") {
    return [
      { key: "reg", label: "Registration", state: "cancelled" },
      { key: "cancel", label: "Cancelled", state: "cancelled" },
    ];
  }

  if (status === "ABANDONED") {
    return [
      { key: "reg", label: "Registration", state: "done" },
      { key: "start", label: "Started", state: "done" },
      { key: "run", label: "In progress", state: "done" },
      { key: "abandon", label: "Abandoned", state: "cancelled" },
    ];
  }

  const idx = order.indexOf(status as (typeof order)[number]);
  return order.map((step, i) => {
    let state: TournamentTimelineStep["state"] = "upcoming";
    if (idx === -1) state = i === 0 ? "current" : "upcoming";
    else if (i < idx) state = "done";
    else if (i === idx) state = "current";
    return { key: step, label: labels[step], state };
  });
}
