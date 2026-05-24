export type Meridiem = "AM" | "PM";

export type TournamentStartSchedule = {
  dateYmd: string;
  hour12: number;
  minute: number;
  meridiem: Meridiem;
};

export const HOUR12_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);

export function snapMinuteToFive(minute: number): number {
  const rounded = Math.round(minute / 5) * 5;
  return rounded === 60 ? 55 : Math.min(55, Math.max(0, rounded));
}

export function todayDateYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultTournamentStartSchedule(
  now = new Date(),
  offsetMinutes = 60,
): TournamentStartSchedule {
  const start = new Date(now.getTime() + offsetMinutes * 60_000);
  const dateYmd = todayDateYmd(start);
  const hour24 = start.getHours();
  const meridiem: Meridiem = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minute = snapMinuteToFive(start.getMinutes());
  return { dateYmd, hour12, minute, meridiem };
}

export function floorToMinute(date: Date): Date {
  const floored = new Date(date);
  floored.setSeconds(0, 0);
  return floored;
}

export function isTournamentStartInPast(iso: string, now: Date = new Date()): boolean {
  const start = floorToMinute(new Date(iso));
  if (Number.isNaN(start.getTime())) return true;
  return start.getTime() < floorToMinute(now).getTime();
}

export function buildTournamentStartIsoFromSchedule(schedule: TournamentStartSchedule): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule.dateYmd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const { hour12, minute, meridiem } = schedule;
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

  let hour24 = hour12 % 12;
  if (meridiem === "PM") hour24 += 12;

  const local = new Date(year, month - 1, day, hour24, minute, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) {
    return null;
  }
  return local.toISOString();
}

export function formatSchedulePreview(schedule: TournamentStartSchedule): string | null {
  const iso = buildTournamentStartIsoFromSchedule(schedule);
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

