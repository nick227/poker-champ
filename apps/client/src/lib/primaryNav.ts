import type { ScreenKey } from "@/registry/screen.registry";

export type PrimaryNavKey = Extract<ScreenKey, "lobby" | "slots" | "lessons" | "leaderboard" | "settings">;

/** Routes that use the phone/desktop primary chrome (BottomBar / NavRail). */
export function shouldShowPrimaryNav(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/login")) return false;
  if (pathname.startsWith("/admin") || pathname.startsWith("/dev")) return false;
  return true;
}

export function resolvePrimaryNavActive(pathname: string): PrimaryNavKey | null {
  if (pathname.startsWith("/slots")) return "slots";
  if (pathname.startsWith("/lessons") || pathname.startsWith("/lesson")) return "lessons";
  if (pathname.startsWith("/leaderboard")) return "leaderboard";
  if (pathname.startsWith("/settings")) return "settings";
  if (
    pathname.startsWith("/lobby") ||
    pathname.startsWith("/tournaments") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/replay") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/membership")
  ) {
    return "lobby";
  }
  return null;
}
